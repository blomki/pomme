import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amapRole, household, householdMember, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import {
  canRevokeAdmin,
  checkNewMembers,
  memberStatus,
  normalizeHouseholdName,
  type MemberStatus,
  type MembersProblem,
} from "@/domain/households";
import { normalizePhone } from "@/domain/phone";
import { AMAP_ROLES, type AmapRoleName } from "@/domain/roles";

import { emailSchema } from "./auth/request-magic-link";
import { requireRole } from "./auth/require-role";
import { writeAuditLog } from "./audit";
import { uniqueViolation } from "./db-errors";

// Foyers et membres (story A2). Chaque fonction reçoit la transaction ouverte par
// withAmapContext et commence par requireRole : réservé aux admins de l'AMAP. La Row Level
// Security limite de toute façon chaque requête à l'AMAP courante.

export type HouseholdMemberView = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isPrimary: boolean;
  status: MemberStatus;
  roles: AmapRoleName[];
};

export type HouseholdView = {
  id: string;
  name: string;
  archivedAt: Date | null;
  members: HouseholdMemberView[];
};

/** Foyers de l'AMAP courante (actifs, ou archivés), par nom, avec leurs membres. */
export async function listHouseholds(
  tx: Transaction,
  ctx: AmapContext,
  { archived = false }: { archived?: boolean } = {},
): Promise<HouseholdView[]> {
  await requireRole(tx, ctx, ["admin"]);
  const households = await tx
    .select({ id: household.id, name: household.name, archivedAt: household.archivedAt })
    .from(household)
    .where(archived ? isNotNull(household.archivedAt) : isNull(household.archivedAt))
    .orderBy(asc(sql`lower(${household.name})`));
  return withMembers(tx, households);
}

/** Un foyer de l'AMAP courante, ou null s'il n'existe pas (ou appartient à une autre AMAP). */
export async function getHousehold(
  tx: Transaction,
  ctx: AmapContext,
  householdId: string,
): Promise<HouseholdView | null> {
  await requireRole(tx, ctx, ["admin"]);
  if (!z.uuid().safeParse(householdId).success) return null;
  const rows = await tx
    .select({ id: household.id, name: household.name, archivedAt: household.archivedAt })
    .from(household)
    .where(eq(household.id, householdId));
  const [found] = await withMembers(tx, rows);
  return found ?? null;
}

async function withMembers(
  tx: Transaction,
  households: Array<{ id: string; name: string; archivedAt: Date | null }>,
): Promise<HouseholdView[]> {
  if (households.length === 0) return [];
  const members = await tx
    .select({
      householdId: householdMember.householdId,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      emailVerified: user.emailVerified,
      isPrimary: householdMember.isPrimary,
    })
    .from(householdMember)
    .innerJoin(user, eq(user.id, householdMember.userId))
    .where(
      inArray(
        householdMember.householdId,
        households.map((h) => h.id),
      ),
    )
    // Contact principal en premier, puis par prénom.
    .orderBy(sql`${householdMember.isPrimary} desc`, asc(user.firstName));

  const roles = await tx
    .select({ userId: amapRole.userId, role: amapRole.role })
    .from(amapRole)
    .where(
      inArray(
        amapRole.userId,
        members.map((m) => m.userId),
      ),
    )
    .orderBy(asc(amapRole.role));

  return households.map((h) => ({
    ...h,
    members: members
      .filter((m) => m.householdId === h.id)
      .map((m) => ({
        userId: m.userId,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        phone: m.phone,
        isPrimary: m.isPrimary,
        status: memberStatus(m),
        roles: roles.filter((r) => r.userId === m.userId).map((r) => r.role),
      })),
  }));
}

// --- Création d'un foyer et ajout d'un membre ------------------------------------------------

const optionalText = (max: number) => z.string().trim().max(max).default("");

const memberSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1).max(60),
  lastName: optionalText(60),
  // Facultatif ; converti au format international (+33…) s'il est donné.
  phone: optionalText(30).transform((value, issue) => {
    if (value === "") return null;
    const result = normalizePhone(value);
    if (!result.ok) {
      issue.addIssue({ code: "custom", message: "phone" });
      return z.NEVER;
    }
    return result.phone;
  }),
  isPrimary: z.boolean().default(false),
});

export type MemberInput = z.input<typeof memberSchema>;
type Member = z.output<typeof memberSchema>;

export const createHouseholdSchema = z.object({
  name: z.string().transform(normalizeHouseholdName).pipe(z.string().min(1).max(80)),
  members: z.array(memberSchema).max(8),
});

/** Champ en erreur, pour l'afficher à côté du bon champ du formulaire. */
export type FieldError = { field: string; member?: number };

/** Personne à qui envoyer l'invitation, après la création. */
export type Invitation = { userId: string; email: string; firstName: string };

export type CreateHouseholdResult =
  | { status: "created"; householdId: string; invitations: Invitation[] }
  | { status: "invalid"; errors: FieldError[] }
  | { status: MembersProblem | "name_taken" }
  | { status: "member_taken"; email: string };

/**
 * Crée un foyer avec ses membres (formulaire « Inviter un foyer »).
 *
 * Pour chaque membre : si un compte existe déjà avec cet email (par exemple dans une autre AMAP),
 * le foyer s'y rattache et son profil (nom, téléphone) est conservé tel quel ; sinon un compte
 * est créé. Les invitations sont envoyées ensuite par l'action, une fois la transaction validée.
 */
export async function createHousehold(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<CreateHouseholdResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = createHouseholdSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error) };
  const { name, members } = parsed.data;
  const problem = checkNewMembers(members);
  if (problem) return { status: problem };

  const householdId = uuidv7();
  try {
    // Sous-transaction : si un nom ou une personne est déjà pris, rien n'est créé.
    const invitations = await tx.transaction(async (sub) => {
      await sub
        .insert(household)
        .values({ id: householdId, amapId: ctx.amapId!, name, createdBy: ctx.userId });
      const added: Invitation[] = [];
      for (const member of members) {
        added.push(await attachMember(sub, ctx, householdId, member));
      }
      return added;
    });
    await writeAuditLog(tx, ctx, {
      entityType: "household",
      entityId: householdId,
      action: "create",
      after: { name, members: invitations.map((i) => i.userId) },
    });
    return { status: "created", householdId, invitations };
  } catch (error) {
    const taken = takenStatus(error);
    if (taken) return taken;
    throw error;
  }
}

export const addMemberSchema = z.object({ householdId: z.uuid(), member: memberSchema });

export type AddMemberResult =
  | { status: "added"; invitation: Invitation }
  | { status: "invalid"; errors: FieldError[] }
  | { status: "not_found" | "archived" }
  | { status: "member_taken"; email: string };

/** Ajoute un membre à un foyer existant (même règle de compte unique que la création). */
export async function addHouseholdMember(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<AddMemberResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = addMemberSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error) };
  const { householdId, member } = parsed.data;

  const [target] = await tx
    .select({ archivedAt: household.archivedAt })
    .from(household)
    .where(eq(household.id, householdId));
  if (!target) return { status: "not_found" };
  if (target.archivedAt) return { status: "archived" };

  try {
    // Ajouté comme simple membre : le contact principal se change à part.
    const invitation = await tx.transaction((sub) =>
      attachMember(sub, ctx, householdId, { ...member, isPrimary: false }),
    );
    await writeAuditLog(tx, ctx, {
      entityType: "household",
      entityId: householdId,
      action: "add_member",
      after: { userId: invitation.userId },
    });
    return { status: "added", invitation };
  } catch (error) {
    const taken = takenStatus(error);
    if (taken?.status === "member_taken") return { ...taken, email: taken.email || member.email };
    throw error;
  }
}

/** La personne fait déjà partie d'un autre foyer actif de l'AMAP. */
class MemberTakenError extends Error {
  constructor(readonly email: string) {
    super(`${email} fait déjà partie d'un foyer de l'AMAP.`);
  }
}

/** Retrouve ou crée le compte de la personne, puis la rattache au foyer. */
async function attachMember(
  tx: Transaction,
  ctx: AmapContext,
  householdId: string,
  member: Member,
): Promise<Invitation> {
  // Fonction de base dédiée (migration 0007) : le compte peut appartenir à une autre AMAP,
  // invisible pour l'application à cause de la Row Level Security.
  const found = await tx.execute<{ id: string | null }>(
    sql`select find_user_id_by_email(${member.email}) as id`,
  );
  const existingId = found.rows[0]?.id ?? null;
  const userId = existingId ?? uuidv7();

  if (existingId) {
    // Déjà dans un foyer actif de cette AMAP ? (L'index unique le refuserait aussi, mais sans
    // dire de qui il s'agit.)
    const [already] = await tx
      .select({ id: householdMember.id })
      .from(householdMember)
      .where(and(eq(householdMember.userId, existingId), isNull(householdMember.archivedAt)));
    if (already) throw new MemberTakenError(member.email);
  } else {
    // Sans RETURNING : la ligne ne sera visible (RLS) qu'une fois la personne dans le foyer.
    await tx.insert(user).values({
      id: userId,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone,
    });
  }
  await tx.insert(householdMember).values({
    amapId: ctx.amapId!,
    householdId,
    userId,
    isPrimary: member.isPrimary,
    createdBy: ctx.userId,
  });
  // Compte existant : son profil (nom, téléphone) appartient à la personne, on n'y touche pas ;
  // l'invitation s'adresse à elle par le prénom qu'elle a choisi.
  const [account] = await tx
    .select({ firstName: user.firstName })
    .from(user)
    .where(eq(user.id, userId));
  return { userId, email: member.email, firstName: account?.firstName ?? member.firstName };
}

/** Traduit une erreur « déjà pris » en résultat lisible, ou null si ce n'en est pas une. */
function takenStatus(
  error: unknown,
): { status: "name_taken" } | { status: "member_taken"; email: string } | null {
  if (error instanceof MemberTakenError) return { status: "member_taken", email: error.email };
  const constraint = uniqueViolation(error);
  if (constraint === "household_name_unique") return { status: "name_taken" };
  // Deux ajouts simultanés de la même personne : l'index unique a tranché.
  if (constraint === "household_member_one_household_idx") {
    return { status: "member_taken", email: "" };
  }
  return null;
}

/**
 * Champs en erreur, d'après la validation. Chemins possibles : ["name"], ["members", 1,
 * "email"] (création) ou ["member", "email"] (ajout d'un membre).
 */
function fieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map(({ path }) => {
    if (path[0] === "members") return { member: Number(path[1]), field: String(path[2]) };
    if (path[0] === "member") return { member: 0, field: String(path[1]) };
    return { field: String(path[0]) };
  });
}

// --- Contact principal, archivage ------------------------------------------------------------

export const memberRefSchema = z.object({ householdId: z.uuid(), userId: z.uuid() });

/** Désigne le contact principal du foyer (un seul par foyer). */
export async function setPrimaryContact(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<{ status: "updated" | "invalid" | "not_found" }> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = memberRefSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { householdId, userId } = parsed.data;

  const member = and(
    eq(householdMember.householdId, householdId),
    eq(householdMember.userId, userId),
  );
  const [target] = await tx.select({ id: householdMember.id }).from(householdMember).where(member);
  if (!target) return { status: "not_found" };
  // D'abord retirer l'ancien contact : l'index unique refuse deux contacts à la fois.
  await tx
    .update(householdMember)
    .set({ isPrimary: false })
    .where(and(eq(householdMember.householdId, householdId), eq(householdMember.isPrimary, true)));
  await tx.update(householdMember).set({ isPrimary: true }).where(member);
  return { status: "updated" };
}

export type ArchiveResult =
  | { status: "archived" | "restored" | "invalid" | "not_found" }
  | {
      status: "name_taken" | "member_taken";
    };

/**
 * Archive un foyer (jamais de suppression) ou le rétablit (« Annuler »). Archivé, il disparaît
 * de la liste ; ses membres peuvent rejoindre un autre foyer, et son nom se libère.
 */
export async function setHouseholdArchived(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<ArchiveResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = z.object({ householdId: z.uuid(), archived: z.boolean() }).safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { householdId, archived } = parsed.data;
  const archivedAt = archived ? new Date() : null;

  try {
    const updated = await tx.transaction(async (sub) => {
      const rows = await sub
        .update(household)
        .set({ archivedAt })
        .where(eq(household.id, householdId))
        .returning({ id: household.id });
      await sub
        .update(householdMember)
        .set({ archivedAt })
        .where(eq(householdMember.householdId, householdId));
      return rows.length;
    });
    if (updated === 0) return { status: "not_found" };
  } catch (error) {
    // Rétablissement impossible : le nom ou une personne a été repris entre-temps.
    const constraint = uniqueViolation(error);
    if (constraint === "household_name_unique") return { status: "name_taken" };
    if (constraint === "household_member_one_household_idx") return { status: "member_taken" };
    throw error;
  }
  await writeAuditLog(tx, ctx, {
    entityType: "household",
    entityId: householdId,
    action: archived ? "archive" : "restore",
  });
  return { status: archived ? "archived" : "restored" };
}

// --- Rôles ------------------------------------------------------------------------------------

export const setRoleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(AMAP_ROLES),
  granted: z.boolean(),
});

export type SetRoleResult = {
  status: "updated" | "unchanged" | "invalid" | "not_found" | "last_admin";
};

/**
 * Attribue ou retire le rôle référent ou administrateur à une personne de l'AMAP courante.
 * Une personne peut cumuler les rôles. Toujours journalisé. On ne retire pas le rôle du dernier
 * administrateur : plus personne ne pourrait gérer l'AMAP.
 */
export async function setMemberRole(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SetRoleResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = setRoleSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { userId, role, granted } = parsed.data;

  // Visible seulement si la personne appartient à l'AMAP courante (RLS de user).
  const [person] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId));
  if (!person) return { status: "not_found" };

  const ofPerson = and(eq(amapRole.userId, userId), eq(amapRole.role, role));
  if (granted) {
    const inserted = await tx
      .insert(amapRole)
      .values({ amapId: ctx.amapId!, userId, role, createdBy: ctx.userId })
      .onConflictDoNothing()
      .returning({ id: amapRole.id });
    if (inserted.length === 0) return { status: "unchanged" };
  } else {
    if (role === "admin") {
      // Verrou sur les lignes d'admin : deux retraits simultanés ne peuvent pas laisser l'AMAP
      // sans administrateur.
      const admins = await tx
        .select({ userId: amapRole.userId })
        .from(amapRole)
        .where(eq(amapRole.role, "admin"))
        .for("update");
      if (admins.some((a) => a.userId === userId) && !canRevokeAdmin(admins.length)) {
        return { status: "last_admin" };
      }
    }
    const deleted = await tx.delete(amapRole).where(ofPerson).returning({ id: amapRole.id });
    if (deleted.length === 0) return { status: "unchanged" };
  }
  await writeAuditLog(tx, ctx, {
    entityType: "amap_role",
    entityId: userId,
    action: granted ? "grant_role" : "revoke_role",
    after: { role },
  });
  return { status: "updated" };
}

// --- Invitation -------------------------------------------------------------------------------

/**
 * Personne à qui renvoyer l'invitation : membre d'un foyer actif de l'AMAP courante, qui ne
 * s'est pas encore connecté. null sinon.
 */
export async function invitationFor(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<Invitation | null> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = memberRefSchema.safeParse(input);
  if (!parsed.success) return null;
  const [row] = await tx
    .select({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      emailVerified: user.emailVerified,
    })
    .from(householdMember)
    .innerJoin(user, eq(user.id, householdMember.userId))
    .where(
      and(
        eq(householdMember.householdId, parsed.data.householdId),
        eq(householdMember.userId, parsed.data.userId),
        isNull(householdMember.archivedAt),
      ),
    );
  if (!row || row.emailVerified) return null;
  return { userId: row.userId, email: row.email, firstName: row.firstName };
}
