import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  amapProducer,
  amapRole,
  producer,
  producerUser,
  referentAssignment,
  user,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { normalizePhone } from "@/domain/phone";
import {
  parseDistanceKm,
  producerAccess,
  producersWithoutReferent,
  type ProducerAccess,
} from "@/domain/producers";

import { emailSchema } from "./auth/request-magic-link";
import { requireRole } from "./auth/require-role";
import { writeAuditLog } from "./audit";
import { unpublishedCatalogTasks, type UnpublishedCatalogTask } from "./catalogs";
import { foreignKeyViolation, uniqueViolation } from "./db-errors";

// Producteurs et référents, côté administrateur (story C1). Chaque fonction commence par
// requireRole ; la Row Level Security limite de toute façon chaque requête à l'AMAP courante.

export type ReferentView = { userId: string; firstName: string; lastName: string };

export type AmapProducerSummary = {
  /** Identifiant du producteur DANS l'AMAP (amap_producer) : celui des adresses des pages. */
  id: string;
  producerId: string;
  name: string;
  category: string;
  active: boolean;
  referents: ReferentView[];
  /** Accès du producteur à Pomme : compte actif, invitation envoyée, pas de compte. */
  access: ProducerAccess;
};

/** Compte producteur (personne qui se connecte au nom du producteur). */
export type ProducerAccount = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "active" | "invited";
};

export type AmapProducerDetail = AmapProducerSummary & {
  accounts: ProducerAccount[];
  shortDescription: string;
  description: string;
  phone: string | null;
  email: string | null;
  checkPayee: string;
  distanceKm: number | null;
};

const columns = {
  id: amapProducer.id,
  producerId: producer.id,
  name: producer.name,
  category: producer.category,
  active: amapProducer.active,
  shortDescription: producer.shortDescription,
  description: producer.description,
  phone: producer.phone,
  email: producer.email,
  checkPayee: amapProducer.checkPayee,
  distanceKm: amapProducer.distanceKm,
};

async function referentsOf(tx: Transaction, amapProducerIds: string[]) {
  if (amapProducerIds.length === 0) return [];
  return tx
    .select({
      amapProducerId: referentAssignment.amapProducerId,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
    })
    .from(referentAssignment)
    .innerJoin(user, eq(user.id, referentAssignment.userId))
    .where(inArray(referentAssignment.amapProducerId, amapProducerIds))
    .orderBy(asc(user.firstName), asc(user.lastName));
}

async function loadProducers(tx: Transaction, where?: ReturnType<typeof eq>) {
  const rows = await tx
    .select(columns)
    .from(amapProducer)
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(and(isNull(amapProducer.archivedAt), where))
    .orderBy(asc(sql`lower(${producer.name})`));
  const referents = await referentsOf(
    tx,
    rows.map((r) => r.id),
  );
  const accounts = await accountsOf(
    tx,
    rows.map((r) => r.producerId),
  );
  return rows.map((row) => {
    const own = accounts.filter((a) => a.producerId === row.producerId);
    return {
      ...row,
      referents: referents
        .filter((r) => r.amapProducerId === row.id)
        .map(({ userId, firstName, lastName }) => ({ userId, firstName, lastName })),
      access: producerAccess(own),
      accounts: own.map(({ userId, firstName, lastName, email, emailVerified }) => ({
        userId,
        firstName,
        lastName,
        email,
        status: emailVerified ? ("active" as const) : ("invited" as const),
      })),
    };
  });
}

/** Comptes des producteurs (visibles : producteurs de l'AMAP courante, RLS). */
async function accountsOf(tx: Transaction, producerIds: string[]) {
  if (producerIds.length === 0) return [];
  return tx
    .select({
      producerId: producerUser.producerId,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      emailVerified: user.emailVerified,
    })
    .from(producerUser)
    .innerJoin(user, eq(user.id, producerUser.userId))
    .where(inArray(producerUser.producerId, producerIds))
    .orderBy(asc(user.firstName));
}

/** Producteurs de l'AMAP courante, par nom, avec leurs référents. */
export async function listAmapProducers(
  tx: Transaction,
  ctx: AmapContext,
): Promise<AmapProducerSummary[]> {
  await requireRole(tx, ctx, ["admin"]);
  const all = await loadProducers(tx);
  return all.map(({ id, producerId, name, category, active, referents, access }) => ({
    id,
    producerId,
    name,
    category,
    active,
    referents,
    access,
  }));
}

/** Un producteur de l'AMAP courante, ou null. */
export async function getAmapProducer(
  tx: Transaction,
  ctx: AmapContext,
  amapProducerId: string,
): Promise<AmapProducerDetail | null> {
  await requireRole(tx, ctx, ["admin"]);
  if (!z.uuid().safeParse(amapProducerId).success) return null;
  const [found] = await loadProducers(tx, eq(amapProducer.id, amapProducerId));
  return found ?? null;
}

export type BlockingTask =
  | { kind: "producer_without_referent"; amapProducerId: string; name: string }
  | UnpublishedCatalogTask;

/**
 * Tâches « Bloquant » du tableau de bord : producteurs sans référent, puis catalogues pas
 * encore publiés à trois jours de l'ouverture des commandes (story C3).
 */
export async function blockingTasks(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<BlockingTask[]> {
  const producers = await listAmapProducers(tx, ctx);
  const withoutReferent = producersWithoutReferent(
    producers.map((p) => ({ ...p, referentCount: p.referents.length })),
  ).map((p) => ({
    kind: "producer_without_referent" as const,
    amapProducerId: p.id,
    name: p.name,
  }));
  return [...withoutReferent, ...(await unpublishedCatalogTasks(tx, now))];
}

/** Personnes qui ont le rôle référent dans l'AMAP courante : les seules qu'on peut affecter. */
export async function listReferentCandidates(
  tx: Transaction,
  ctx: AmapContext,
): Promise<ReferentView[]> {
  await requireRole(tx, ctx, ["admin"]);
  return tx
    .select({ userId: user.id, firstName: user.firstName, lastName: user.lastName })
    .from(amapRole)
    .innerJoin(user, eq(user.id, amapRole.userId))
    .where(eq(amapRole.role, "referent"))
    .orderBy(asc(user.firstName), asc(user.lastName));
}

// --- Saisie ----------------------------------------------------------------------------------

const optionalText = (max: number) => z.string().trim().max(max).default("");

/** Champs communs du producteur (sa fiche, partagée entre AMAP). */
const producerFields = {
  name: z.string().trim().min(1).max(80),
  category: optionalText(60),
  shortDescription: optionalText(160),
  description: optionalText(2000),
  phone: optionalText(30).transform((value, issue) => {
    if (value === "") return null;
    const result = normalizePhone(value);
    if (!result.ok) {
      issue.addIssue({ code: "custom", message: "phone" });
      return z.NEVER;
    }
    return result.phone;
  }),
  email: z.union([z.literal("").transform(() => null), emailSchema]).default(""),
};

/** Réglages propres à l'AMAP. */
const settingsFields = {
  checkPayee: optionalText(120),
  distanceKm: z
    .string()
    .default("")
    .transform((value, issue) => {
      const km = parseDistanceKm(value);
      if (km === undefined) {
        issue.addIssue({ code: "custom", message: "distanceKm" });
        return z.NEVER;
      }
      return km;
    }),
};

export const createProducerSchema = z.object({ ...producerFields, ...settingsFields });
export const attachProducerSchema = z.object({ producerId: z.uuid(), ...settingsFields });
export const updateProducerSchema = z.object({
  amapProducerId: z.uuid(),
  ...producerFields,
  ...settingsFields,
  active: z.boolean(),
});

export type FieldErrors = string[];

const fieldErrors = (error: z.ZodError): FieldErrors => [
  ...new Set(error.issues.map((issue) => String(issue.path[0]))),
];

export type SaveProducerResult =
  | { status: "saved"; amapProducerId: string }
  | { status: "invalid"; fields: FieldErrors }
  | { status: "not_found" | "already_attached" };

/** Crée un producteur (fiche commune) et l'ajoute à l'AMAP courante. */
export async function createProducer(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SaveProducerResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = createProducerSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: fieldErrors(parsed.error) };
  const { checkPayee, distanceKm, ...fields } = parsed.data;

  const producerId = uuidv7();
  const amapProducerId = uuidv7();
  // Sans RETURNING : le producteur ne devient visible (RLS) qu'une fois dans l'AMAP.
  await tx.insert(producer).values({ id: producerId, ...fields, createdBy: ctx.userId });
  await tx.insert(amapProducer).values({
    id: amapProducerId,
    amapId: ctx.amapId!,
    producerId,
    checkPayee,
    distanceKm,
    createdBy: ctx.userId,
  });
  await writeAuditLog(tx, ctx, {
    entityType: "amap_producer",
    entityId: amapProducerId,
    action: "create",
    after: { name: fields.name, checkPayee },
  });
  return { status: "saved", amapProducerId };
}

/** Cherche un producteur d'une autre AMAP à rattacher (nom et catégorie seulement). */
export async function searchProducers(
  tx: Transaction,
  ctx: AmapContext,
  query: unknown,
): Promise<Array<{ id: string; name: string; category: string }>> {
  await requireRole(tx, ctx, ["admin"]);
  const text = z.string().max(80).safeParse(query);
  if (!text.success) return [];
  // Fonction de base dédiée (migration 0011) : voir son commentaire.
  const result = await tx.execute<{ id: string; name: string; category: string }>(
    sql`select id, name, category from search_producers(${text.data})`,
  );
  return result.rows;
}

class ProducerNotFoundError extends Error {}

/** Rattache à l'AMAP courante un producteur qui livre déjà une autre AMAP. */
export async function attachProducer(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SaveProducerResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = attachProducerSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: fieldErrors(parsed.error) };
  const { producerId, checkPayee, distanceKm } = parsed.data;

  const amapProducerId = uuidv7();
  let name: string;
  try {
    // Sous-transaction : si le producteur est archivé, le rattachement est annulé.
    name = await tx.transaction(async (sub) => {
      await sub.insert(amapProducer).values({
        id: amapProducerId,
        amapId: ctx.amapId!,
        producerId,
        checkPayee,
        distanceKm,
        createdBy: ctx.userId,
      });
      // Désormais visible (RLS) : il est dans l'AMAP courante.
      const [row] = await sub
        .select({ name: producer.name, archivedAt: producer.archivedAt })
        .from(producer)
        .where(eq(producer.id, producerId));
      if (!row || row.archivedAt) throw new ProducerNotFoundError();
      return row.name;
    });
  } catch (error) {
    if (error instanceof ProducerNotFoundError || foreignKeyViolation(error)) {
      return { status: "not_found" };
    }
    if (uniqueViolation(error) === "amap_producer_unique") return { status: "already_attached" };
    throw error;
  }
  await writeAuditLog(tx, ctx, {
    entityType: "amap_producer",
    entityId: amapProducerId,
    action: "attach",
    after: { name, checkPayee },
  });
  return { status: "saved", amapProducerId };
}

/**
 * Modifie un producteur : sa fiche commune (vaut pour toutes ses AMAP) et ses réglages dans
 * l'AMAP courante. L'ordre des chèques est inscrit au journal : une erreur ferait libeller
 * des chèques au mauvais nom.
 */
export async function updateProducer(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SaveProducerResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = updateProducerSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: fieldErrors(parsed.error) };
  const { amapProducerId, checkPayee, distanceKm, active, ...fields } = parsed.data;

  const [current] = await tx
    .select({ producerId: amapProducer.producerId, checkPayee: amapProducer.checkPayee })
    .from(amapProducer)
    .where(eq(amapProducer.id, amapProducerId));
  if (!current) return { status: "not_found" };

  await tx.update(producer).set(fields).where(eq(producer.id, current.producerId));
  await tx
    .update(amapProducer)
    .set({ checkPayee, distanceKm, active })
    .where(eq(amapProducer.id, amapProducerId));
  await writeAuditLog(tx, ctx, {
    entityType: "amap_producer",
    entityId: amapProducerId,
    action: "update",
    before: { checkPayee: current.checkPayee },
    after: { checkPayee, active },
  });
  return { status: "saved", amapProducerId };
}

export const setReferentsSchema = z.object({
  amapProducerId: z.uuid(),
  userIds: z.array(z.uuid()).max(20),
});

export type SetReferentsResult = {
  status: "saved" | "invalid" | "not_found" | "not_referent";
};

/**
 * Remplace les référents d'un producteur. Chacun doit avoir le rôle référent dans l'AMAP
 * courante. Journalisé (avant / après).
 */
export async function setProducerReferents(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SetReferentsResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = setReferentsSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const amapProducerId = parsed.data.amapProducerId;
  const userIds = [...new Set(parsed.data.userIds)];

  const [target] = await tx
    .select({ id: amapProducer.id })
    .from(amapProducer)
    .where(eq(amapProducer.id, amapProducerId));
  if (!target) return { status: "not_found" };

  if (userIds.length > 0) {
    const referents = await tx
      .select({ userId: amapRole.userId })
      .from(amapRole)
      .where(and(eq(amapRole.role, "referent"), inArray(amapRole.userId, userIds)));
    if (referents.length !== userIds.length) return { status: "not_referent" };
  }

  const before = await tx
    .select({ userId: referentAssignment.userId })
    .from(referentAssignment)
    .where(eq(referentAssignment.amapProducerId, amapProducerId));
  await tx.delete(referentAssignment).where(eq(referentAssignment.amapProducerId, amapProducerId));
  if (userIds.length > 0) {
    await tx.insert(referentAssignment).values(
      userIds.map((userId) => ({
        amapId: ctx.amapId!,
        amapProducerId,
        userId,
        createdBy: ctx.userId,
      })),
    );
  }
  await writeAuditLog(tx, ctx, {
    entityType: "amap_producer",
    entityId: amapProducerId,
    action: "set_referents",
    before: { referents: before.map((b) => b.userId).sort() },
    after: { referents: [...userIds].sort() },
  });
  return { status: "saved" };
}

/** Producteurs suivis par une personne dans l'AMAP courante (noms), pour le retrait du rôle. */
export async function producersFollowedBy(tx: Transaction, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ name: producer.name })
    .from(referentAssignment)
    .innerJoin(amapProducer, eq(amapProducer.id, referentAssignment.amapProducerId))
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(eq(referentAssignment.userId, userId))
    .orderBy(asc(producer.name));
  return rows.map((r) => r.name);
}

// --- Comptes producteurs (C1, partie 2) ------------------------------------------------------

export const inviteProducerSchema = z.object({
  amapProducerId: z.uuid(),
  email: emailSchema,
  firstName: z.string().trim().min(1).max(60),
  lastName: optionalText(60),
});

export type ProducerInvitation = {
  userId: string;
  email: string;
  firstName: string;
  producerName: string;
};

export type InviteProducerResult =
  | { status: "invited"; invitation: ProducerInvitation }
  | { status: "invalid"; fields: FieldErrors }
  | { status: "not_found" | "already" };

/**
 * Donne un compte Pomme au producteur (story C1). Comme pour un foyer (ADR 0009) : si un compte
 * existe déjà avec cet email, il est rattaché tel quel ; sinon il est créé. L'invitation part
 * ensuite (action). Journalisé.
 */
export async function inviteProducerAccount(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<InviteProducerResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = inviteProducerSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: fieldErrors(parsed.error) };
  const { amapProducerId, email, firstName, lastName } = parsed.data;

  const [target] = await tx
    .select({ producerId: amapProducer.producerId, name: producer.name })
    .from(amapProducer)
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(eq(amapProducer.id, amapProducerId));
  if (!target) return { status: "not_found" };

  // Fonction de base dédiée (migration 0007) : le compte peut appartenir à une autre AMAP.
  const found = await tx.execute<{ id: string | null }>(
    sql`select find_user_id_by_email(${email}) as id`,
  );
  const userId = found.rows[0]?.id ?? uuidv7();
  if (!found.rows[0]?.id) {
    await tx.insert(user).values({ id: userId, email, firstName, lastName });
  }
  const inserted = await tx
    .insert(producerUser)
    .values({ producerId: target.producerId, userId, createdBy: ctx.userId })
    .onConflictDoNothing()
    .returning({ id: producerUser.id });
  if (inserted.length === 0) return { status: "already" };

  const [account] = await tx
    .select({ firstName: user.firstName })
    .from(user)
    .where(eq(user.id, userId));
  await writeAuditLog(tx, ctx, {
    entityType: "amap_producer",
    entityId: amapProducerId,
    action: "invite_account",
    after: { userId },
  });
  return {
    status: "invited",
    invitation: {
      userId,
      email,
      firstName: account?.firstName ?? firstName,
      producerName: target.name,
    },
  };
}

/** Compte producteur à qui renvoyer l'invitation (jamais connecté), ou null. */
export async function producerInvitationFor(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<ProducerInvitation | null> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = z.object({ amapProducerId: z.uuid(), userId: z.uuid() }).safeParse(input);
  if (!parsed.success) return null;
  const detail = await getAmapProducer(tx, ctx, parsed.data.amapProducerId);
  const account = detail?.accounts.find((a) => a.userId === parsed.data.userId);
  if (!detail || !account || account.status !== "invited") return null;
  return {
    userId: account.userId,
    email: account.email,
    firstName: account.firstName,
    producerName: detail.name,
  };
}

// --- Fiche producteur du référent (écran R5) -------------------------------------------------

export type MyProducer = Omit<AmapProducerDetail, "referents" | "access" | "accounts">;

/**
 * Producteurs dont l'utilisateur connecté est le référent dans l'AMAP courante (« Mes
 * producteurs »). Un référent n'agit que sur les producteurs dont il a la charge.
 */
export async function listMyProducers(tx: Transaction, ctx: AmapContext): Promise<MyProducer[]> {
  await requireRole(tx, ctx, ["referent"]);
  return tx
    .select(columns)
    .from(referentAssignment)
    .innerJoin(amapProducer, eq(amapProducer.id, referentAssignment.amapProducerId))
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(and(eq(referentAssignment.userId, ctx.userId!), isNull(amapProducer.archivedAt)))
    .orderBy(asc(sql`lower(${producer.name})`));
}

export const updateMyProducerSchema = z.object({
  amapProducerId: z.uuid(),
  ...producerFields,
  checkPayee: settingsFields.checkPayee,
});

/**
 * Le référent met à jour les coordonnées et l'ordre des chèques d'un producteur dont il a la
 * charge (pas la distance ni le statut actif, réglés par l'admin). Ordre des chèques journalisé.
 */
export async function updateMyProducer(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SaveProducerResult> {
  await requireRole(tx, ctx, ["referent"]);
  const parsed = updateMyProducerSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: fieldErrors(parsed.error) };
  const { amapProducerId, checkPayee, ...fields } = parsed.data;

  const mine = await listMyProducers(tx, ctx);
  const current = mine.find((p) => p.id === amapProducerId);
  // Pas son producteur : même réponse que s'il n'existait pas.
  if (!current) return { status: "not_found" };

  await tx.update(producer).set(fields).where(eq(producer.id, current.producerId));
  await tx.update(amapProducer).set({ checkPayee }).where(eq(amapProducer.id, amapProducerId));
  await writeAuditLog(tx, ctx, {
    entityType: "amap_producer",
    entityId: amapProducerId,
    action: "update",
    before: { checkPayee: current.checkPayee },
    after: { checkPayee },
  });
  return { status: "saved", amapProducerId };
}
