import { createHash, randomBytes } from "node:crypto";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database, Transaction } from "@/db/client";
import { withAmapContext, type AmapContext } from "@/db/context";
import { householdInvitation, householdMember, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { invitationExpiry, invitationState } from "@/domain/household-invitations";
import { memberStatus, type MemberStatus } from "@/domain/households";
import { normalizePhone } from "@/domain/phone";
import { parsePreferredSpace, preferredSpaceValue, type AmapSpace } from "@/domain/spaces";

import { UnauthenticatedError } from "./auth/errors";
import { emailSchema } from "./auth/request-magic-link";
import { uniqueViolation } from "./db-errors";
import { myHousehold } from "./orders";

// « Mon profil » (story A3, ADR 0045) : mes informations, mon mode, mon foyer (membres,
// invitations, retrait). Un membre de foyer n'écrit pas lui-même dans household_member : il
// passe par les fonctions de base accept_household_invitation et remove_household_member, qui
// vérifient chaque condition (migration 0043).

// --- Mes informations -------------------------------------------------------------------------

export type MyProfile = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string;
  preferredSpace: string | null;
};

/** Profil de la personne connectée (sa propre ligne, lisible par elle). */
export async function getMyProfile(tx: Transaction, ctx: AmapContext): Promise<MyProfile> {
  if (!ctx.userId) throw new UnauthenticatedError();
  const [row] = await tx
    .select({
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      email: user.email,
      preferredSpace: user.preferredSpace,
    })
    .from(user)
    .where(eq(user.id, ctx.userId));
  if (!row) throw new UnauthenticatedError();
  return row;
}

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60),
  phone: z.string().trim().max(30),
});

export type UpdateProfileResult =
  { status: "saved" } | { status: "invalid"; fields: Array<"firstName" | "lastName" | "phone"> };

/**
 * Prénom, nom, téléphone. Le téléphone est enregistré au format international (+33…), celui des
 * liens « Appeler » et « Écrire sur Signal » ; un numéro invalide bloque l'enregistrement.
 * L'email de connexion ne se change pas ici (correction par un admin, story A1).
 */
export async function updateMyProfile(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<UpdateProfileResult> {
  if (!ctx.userId) throw new UnauthenticatedError();
  const parsed = profileSchema.safeParse(input);
  const fields = new Set<"firstName" | "lastName" | "phone">();
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fields.add(issue.path[0] as "firstName" | "lastName" | "phone");
    }
    return { status: "invalid", fields: [...fields] };
  }
  let phone: string | null = null;
  if (parsed.data.phone) {
    const result = normalizePhone(parsed.data.phone);
    if (!result.ok) return { status: "invalid", fields: ["phone"] };
    phone = result.phone;
  }
  await tx
    .update(user)
    .set({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone,
      updatedAt: new Date(),
    })
    .where(eq(user.id, ctx.userId));
  return { status: "saved" };
}

/**
 * Mode choisi (consomm'acteur, référent, administrateur) : mémorisé sur le compte, il ouvre
 * l'espace correspondant après la connexion. Seulement un espace du compte.
 */
export async function setPreferredSpace(
  tx: Transaction,
  ctx: AmapContext,
  value: unknown,
  spaces: readonly AmapSpace[],
): Promise<{ status: "saved"; path: string } | { status: "invalid" }> {
  if (!ctx.userId) throw new UnauthenticatedError();
  const chosen = parsePreferredSpace(typeof value === "string" ? value : null);
  const space = chosen
    ? spaces.find((s) => s.amapSlug === chosen.amapSlug && s.kind === chosen.kind)
    : undefined;
  if (!space) return { status: "invalid" };
  await tx
    .update(user)
    .set({ preferredSpace: preferredSpaceValue(space), updatedAt: new Date() })
    .where(eq(user.id, ctx.userId));
  return { status: "saved", path: `/${space.amapSlug}/${space.kind}` };
}

// --- Mon foyer --------------------------------------------------------------------------------

export type MyHouseholdView = {
  amapSlug: string;
  amapName: string;
  name: string;
  members: Array<{
    userId: string;
    firstName: string;
    lastName: string;
    isMe: boolean;
    isPrimary: boolean;
    status: MemberStatus;
    since: string;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    sentOn: string;
    expiresOn: string;
    expired: boolean;
  }>;
};

/** Foyer de la personne connectée dans l'AMAP courante, ou null. */
export async function getMyHousehold(
  tx: Transaction,
  ctx: AmapContext,
  amap: { slug: string; name: string },
  now = new Date(),
): Promise<MyHouseholdView | null> {
  const home = await myHousehold(tx, ctx);
  if (!home) return null;
  const [members, invitations] = await Promise.all([
    tx
      .select({
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        isPrimary: householdMember.isPrimary,
        createdAt: householdMember.createdAt,
      })
      .from(householdMember)
      .innerJoin(user, eq(user.id, householdMember.userId))
      .where(and(eq(householdMember.householdId, home.id), isNull(householdMember.archivedAt)))
      .orderBy(desc(householdMember.isPrimary), asc(user.firstName)),
    tx
      .select()
      .from(householdInvitation)
      .where(
        and(
          eq(householdInvitation.householdId, home.id),
          isNull(householdInvitation.acceptedAt),
          isNull(householdInvitation.cancelledAt),
        ),
      )
      .orderBy(asc(householdInvitation.createdAt)),
  ]);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    amapSlug: amap.slug,
    amapName: amap.name,
    name: home.name,
    members: members.map((m) => ({
      userId: m.userId,
      firstName: m.firstName,
      lastName: m.lastName,
      isMe: m.userId === ctx.userId,
      isPrimary: m.isPrimary,
      status: memberStatus(m),
      since: day(m.createdAt),
    })),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      sentOn: day(i.createdAt),
      expiresOn: day(i.expiresAt),
      expired: invitationState(i, now) === "expired",
    })),
  };
}

/** Empreinte d'un jeton d'invitation : la base ne garde jamais le jeton lui-même. */
export function invitationTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type InviteResult =
  | {
      status: "invited";
      token: string;
      email: string;
      householdName: string;
      inviterName: string;
    }
  | { status: "invalid" | "self" | "already_member" | "already_invited" | "no_household" };

/**
 * Inviter une personne dans son foyer : lien valable 7 jours. Son compte est créé s'il n'existe
 * pas (vide : elle donnera son prénom en acceptant) ; elle ne rejoint le foyer qu'en acceptant.
 * L'email part ensuite, depuis l'action.
 */
export async function inviteToHousehold(
  tx: Transaction,
  ctx: AmapContext,
  input: { email: unknown },
  now = new Date(),
): Promise<InviteResult> {
  const home = await myHousehold(tx, ctx);
  if (!home) return { status: "no_household" };
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) return { status: "invalid" };
  const email = parsed.data;
  const me = await getMyProfile(tx, ctx);
  if (email === me.email) return { status: "self" };
  const members = await tx
    .select({ email: user.email })
    .from(householdMember)
    .innerJoin(user, eq(user.id, householdMember.userId))
    .where(and(eq(householdMember.householdId, home.id), isNull(householdMember.archivedAt)));
  if (members.some((m) => m.email === email)) return { status: "already_member" };
  const pending = await tx
    .select()
    .from(householdInvitation)
    .where(
      and(
        eq(householdInvitation.householdId, home.id),
        eq(householdInvitation.email, email),
        isNull(householdInvitation.acceptedAt),
        isNull(householdInvitation.cancelledAt),
      ),
    );
  if (pending.some((p) => invitationState(p, now) === "pending")) {
    return { status: "already_invited" };
  }
  // Compte unique de la plateforme : créé vide s'il n'existe pas. Insertion simple, dans une
  // sous-transaction : « ON CONFLICT » appliquerait la politique de lecture à la nouvelle ligne,
  // invisible tant que la personne n'est dans aucun foyer de l'AMAP. Email déjà pris : le compte
  // existe, rien à faire.
  try {
    await tx.transaction((sub) =>
      sub.insert(user).values({ id: uuidv7(), email, firstName: "", lastName: "" }),
    );
  } catch (error) {
    if (uniqueViolation(error) === null) throw error;
  }
  const token = randomBytes(32).toString("base64url");
  await tx.insert(householdInvitation).values({
    amapId: ctx.amapId!,
    householdId: home.id,
    email,
    invitedBy: ctx.userId!,
    tokenHash: invitationTokenHash(token),
    expiresAt: invitationExpiry(now),
  });
  return {
    status: "invited",
    token,
    email,
    householdName: home.name,
    inviterName: `${me.firstName} ${me.lastName}`.trim(),
  };
}

/** Annuler une invitation en attente de son foyer : le lien ne fonctionnera plus. */
export async function cancelInvitation(
  tx: Transaction,
  ctx: AmapContext,
  input: { invitationId: unknown },
): Promise<{ status: "cancelled" | "not_found" }> {
  const home = await myHousehold(tx, ctx);
  const id = z.uuid().safeParse(input.invitationId);
  if (!home || !id.success) return { status: "not_found" };
  const updated = await tx
    .update(householdInvitation)
    .set({ cancelledAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(householdInvitation.id, id.data),
        eq(householdInvitation.householdId, home.id),
        isNull(householdInvitation.acceptedAt),
        isNull(householdInvitation.cancelledAt),
      ),
    )
    .returning({ id: householdInvitation.id });
  return { status: updated.length > 0 ? "cancelled" : "not_found" };
}

export type RemoveMemberResult =
  | { status: "removed"; email: string; firstName: string; householdName: string }
  | { status: "self" | "not_found" | "forbidden" };

/**
 * Retirer un membre de son foyer (fonction remove_household_member) : il ne voit plus la
 * commande du foyer, son compte est conservé. L'email qui l'en informe part ensuite.
 */
export async function removeHouseholdMember(
  tx: Transaction,
  ctx: AmapContext,
  input: { userId: unknown },
): Promise<RemoveMemberResult> {
  const id = z.uuid().safeParse(input.userId);
  if (!id.success) return { status: "not_found" };
  const home = await myHousehold(tx, ctx);
  if (!home) return { status: "forbidden" };
  // Lu avant : une fois retirée, la personne n'est plus visible (RLS).
  const [target] = await tx
    .select({ email: user.email, firstName: user.firstName })
    .from(user)
    .where(eq(user.id, id.data));
  const result = await tx.execute<{ status: string }>(
    sql`select remove_household_member(${id.data}) as status`,
  );
  const status = result.rows[0]?.status;
  if (status === "removed" && target) {
    return { status: "removed", ...target, householdName: home.name };
  }
  return { status: status === "self" || status === "forbidden" ? status : "not_found" };
}

// --- Accepter une invitation (sans connexion : le lien prouve l'adresse) ----------------------

export type InvitationDetails =
  | {
      status: "pending";
      amapSlug: string;
      amapName: string;
      householdName: string;
      email: string;
      needsName: boolean;
    }
  | { status: "invalid" | "expired" | "accepted" | "cancelled" };

/** Ce que montre la page « Rejoindre le foyer » (fonction household_invitation_details). */
export async function getInvitationDetails(
  db: Database,
  token: string,
  now = new Date(),
): Promise<InvitationDetails> {
  if (!token) return { status: "invalid" };
  const rows = await withAmapContext(db, { amapId: null, userId: null }, (tx) =>
    tx.execute<{
      amap_slug: string;
      amap_name: string;
      household_name: string;
      email: string;
      expires_at: string;
      accepted_at: string | null;
      cancelled_at: string | null;
      needs_name: boolean;
    }>(sql`select * from household_invitation_details(${invitationTokenHash(token)})`),
  );
  const row = rows.rows[0];
  if (!row) return { status: "invalid" };
  const state = invitationState(
    {
      expiresAt: new Date(row.expires_at),
      acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    },
    now,
  );
  if (state !== "pending") return { status: state };
  return {
    status: "pending",
    amapSlug: row.amap_slug,
    amapName: row.amap_name,
    householdName: row.household_name,
    email: row.email,
    needsName: row.needs_name,
  };
}

const acceptSchema = z.object({
  token: z.string().min(10).max(200),
  firstName: z.string().trim().max(60).default(""),
  lastName: z.string().trim().max(60).default(""),
});

export type AcceptResult = {
  status: "accepted" | "invalid" | "expired" | "name_required" | "already_member";
};

/** « Rejoindre le foyer » (fonction accept_household_invitation). */
export async function acceptInvitation(db: Database, input: unknown): Promise<AcceptResult> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { token, firstName, lastName } = parsed.data;
  const result = await withAmapContext(db, { amapId: null, userId: null }, (tx) =>
    tx.execute<{ status: string }>(
      sql`select accept_household_invitation(${invitationTokenHash(token)}, ${uuidv7()}, ${firstName}, ${lastName}) as status`,
    ),
  );
  const status = result.rows[0]?.status;
  const known = ["accepted", "invalid", "expired", "name_required", "already_member"] as const;
  return { status: known.find((s) => s === status) ?? "invalid" };
}
