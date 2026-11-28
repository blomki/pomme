import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amapRole, auditLog, household, householdMember, notificationLog, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import {
  checkNewMembers,
  confirmsAnonymization,
  memberStatus,
  normalizeHouseholdName,
  type MemberStatus,
  type MembersProblem,
} from "@/domain/households";
import { normalizePhone } from "@/domain/phone";
import { canResetMemberSecondFactor } from "@/domain/second-factor";
import { type AmapRoleName } from "@/domain/roles";


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
  /**
   * « Réinitialiser la deuxième vérification » proposé (fiche #125) : calculé seulement pour la
   * fiche d'un foyer, faux dans la liste des foyers.
   */
  canResetSecondFactor: boolean;
};

export type HouseholdView = {
  id: string;
  name: string;
  archivedAt: Date | null;
  /** Anonymisé (RGPD) : irréversible, plus aucune action possible. */
  anonymizedAt: Date | null;
  members: HouseholdMemberView[];
};

/** Colonnes d'un foyer lues par les écrans. */
const householdColumns = {
  id: household.id,
  name: household.name,
  archivedAt: household.archivedAt,
  anonymizedAt: household.anonymizedAt,
};

/** Foyers de l'AMAP courante (actifs, ou archivés), par nom, avec leurs membres. */
export async function listHouseholds(
  tx: Transaction,
  ctx: AmapContext,
  { archived = false }: { archived?: boolean } = {},
): Promise<HouseholdView[]> {
  await requireRole(tx, ctx, ["admin"]);
  const households = await tx
    .select(householdColumns)
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
    .select(householdColumns)
    .from(household)
    .where(eq(household.id, householdId));
  const [found] = await withMembers(tx, rows, ctx);
  return found ?? null;
}

/**
 * Ajoute les membres et leurs rôles. Avec `resetFor` (la fiche d'un foyer), indique aussi pour
 * chacun si l'admin connecté peut réinitialiser sa deuxième vérification.
 */
async function withMembers(
  tx: Transaction,
  households: Array<Omit<HouseholdView, "members">>,
  resetFor?: AmapContext,
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
      isPlatformAdmin: user.isPlatformAdmin,
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

  const withFactor = resetFor
    ? await membersWithSecondFactor(
        tx,
        members.map((m) => m.userId),
      )
    : new Set<string>();

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
      }))
      .map((m) => ({
        ...m,
        canResetSecondFactor:
          resetFor !== undefined &&
          canResetMemberSecondFactor({
            isSelf: m.userId === resetFor.userId,
            isPlatformAdmin: members.find((x) => x.userId === m.userId)?.isPlatformAdmin ?? false,
            roles: m.roles,
            hasFactor: withFactor.has(m.userId),
          }),
      })),
  }));
}

/**
 * Membres qui ont au moins un moyen de deuxième vérification (application ou passkey). La table
 * des passkeys appartient à Better Auth (ADR 0005) : une fonction de la base répond par un
 * simple « oui », réservée aux admins de l'AMAP courante (migration 0048).
 */
async function membersWithSecondFactor(tx: Transaction, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const ids = sql.join(
    userIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = await tx.execute<{ id: string }>(
    sql`select id from amap_members_with_second_factor(array[${ids}]::uuid[]) as id`,
  );
  return new Set(rows.rows.map((r) => r.id));
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
  | { status: "archived" | "restored" | "invalid" | "not_found" | "anonymized" }
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

  // Un foyer anonymisé reste archivé pour toujours.
  const [target] = await tx
    .select({ anonymizedAt: household.anonymizedAt })
    .from(household)
    .where(eq(household.id, householdId));
  if (!target) return { status: "not_found" };
  if (target.anonymizedAt) return { status: "anonymized" };

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

// --- RGPD : export et anonymisation (story A2, ADR 0010) --------------------------------------

/** Données d'un foyer remises à la famille (droit d'accès et de portabilité, RGPD). */
export type HouseholdExport = {
  exportedAt: string;
  amap: { name: string };
  household: { name: string; createdAt: string; archivedAt: string | null };
  members: Array<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    isPrimaryContact: boolean;
    status: MemberStatus;
    memberSince: string;
    roles: AmapRoleName[];
  }>;
  emails: Array<{ to: string; template: string; status: string; date: string }>;
  history: Array<{ action: string; date: string }>;
};

/**
 * Rassemble les données d'un foyer de l'AMAP courante. À compléter avec chaque nouvelle donnée
 * d'un foyer (adhésions B1, commandes D3, chèques, avoirs…). L'export est inscrit au journal :
 * c'est un accès à des données personnelles.
 */
export async function exportHousehold(
  tx: Transaction,
  ctx: AmapContext,
  householdId: string,
): Promise<HouseholdExport | null> {
  const view = await getHousehold(tx, ctx, householdId);
  if (!view || view.anonymizedAt) return null;

  const [row] = await tx
    .select({
      createdAt: household.createdAt,
      amapName: sql<string>`(select name from amap where id = ${household.amapId})`,
    })
    .from(household)
    .where(eq(household.id, householdId));
  const since = await tx
    .select({ userId: householdMember.userId, createdAt: householdMember.createdAt })
    .from(householdMember)
    .where(eq(householdMember.householdId, householdId));
  const userIds = view.members.map((m) => m.userId);
  const emails = userIds.length
    ? await tx
        .select({
          userId: notificationLog.userId,
          template: notificationLog.template,
          status: notificationLog.status,
          createdAt: notificationLog.createdAt,
        })
        .from(notificationLog)
        .where(inArray(notificationLog.userId, userIds))
        .orderBy(asc(notificationLog.createdAt))
    : [];
  const history = await tx
    .select({ action: auditLog.action, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.entityType, "household"), eq(auditLog.entityId, householdId)))
    .orderBy(asc(auditLog.createdAt));

  await writeAuditLog(tx, ctx, {
    entityType: "household",
    entityId: householdId,
    action: "export",
  });

  const emailOf = new Map(view.members.map((m) => [m.userId, m.email]));
  return {
    exportedAt: new Date().toISOString(),
    amap: { name: row?.amapName ?? "" },
    household: {
      name: view.name,
      createdAt: (row?.createdAt ?? new Date()).toISOString(),
      archivedAt: view.archivedAt?.toISOString() ?? null,
    },
    members: view.members.map((m) => ({
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      phone: m.phone,
      isPrimaryContact: m.isPrimary,
      status: m.status,
      memberSince: (
        since.find((s) => s.userId === m.userId)?.createdAt ?? new Date()
      ).toISOString(),
      roles: m.roles,
    })),
    emails: emails.map((e) => ({
      to: emailOf.get(e.userId ?? "") ?? "",
      template: e.template,
      status: e.status,
      date: e.createdAt.toISOString(),
    })),
    history: history.map((h) => ({ action: h.action, date: h.createdAt.toISOString() })),
  };
}

export const anonymizeSchema = z.object({
  householdId: z.uuid(),
  confirmName: z.string().max(200),
});

export type AnonymizeResult =
  | { status: "anonymized"; anonymizedUserIds: string[] }
  | { status: "invalid" | "not_found" | "already_anonymized" | "confirmation" };

/**
 * Anonymise un foyer à sa demande (RGPD), de façon irréversible. Le travail est fait par la
 * fonction de base anonymize_household (migration 0009), en une transaction ; voir son
 * commentaire. Renvoie les comptes anonymisés, dont l'action fait effacer les sessions.
 */
export async function anonymizeHousehold(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<AnonymizeResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = anonymizeSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { householdId, confirmName } = parsed.data;

  const [target] = await tx
    .select({ name: household.name, anonymizedAt: household.anonymizedAt })
    .from(household)
    .where(eq(household.id, householdId));
  if (!target) return { status: "not_found" };
  if (target.anonymizedAt) return { status: "already_anonymized" };
  if (!confirmsAnonymization(confirmName, target.name)) return { status: "confirmation" };

  const result = await tx.execute<{ id: string }>(
    sql`select anonymize_household(${householdId}) as id`,
  );
  // Journal sans aucune donnée personnelle : seulement le fait.
  await writeAuditLog(tx, ctx, {
    entityType: "household",
    entityId: householdId,
    action: "anonymize",
  });
  return { status: "anonymized", anonymizedUserIds: result.rows.map((r) => r.id) };
}
