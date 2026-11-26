import { and, asc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  amapProducer,
  catalog,
  dutyPlan,
  household,
  householdMember,
  membership,
  order,
  orderPeriod,
  producer,
  user,
} from "@/db/schema";
import { addMonths } from "@/domain/distributions";
import { CUSTOMER_MONTHS } from "@/domain/email-campaigns";
import {
  bodyParagraphs,
  canSend,
  checkTags,
  renderTags,
  type TagCheck,
  type TagValues,
} from "@/domain/email-tags";
import { coversDay } from "@/domain/memberships";
import { parisDay, periodDays } from "@/domain/order-periods";
import { formatDate } from "@/i18n/dates";

import { requireRole } from "./auth/require-role";
import { planDays } from "./duty-plans";
import { listCampaigns, type CampaignRow } from "./email/campaigns";
import { renderEmail } from "./email/layout";
import type { EmailContent } from "./email/mailer";

// Emails groupés (story H1, ADR 0046) : à tous les adhérents ou aux clients d'un producteur.
// Les destinataires et les valeurs des balises sont recalculés au moment de l'envoi : l'aperçu
// du navigateur ne fait foi que pour l'affichage.

export type Recipient = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  householdId: string;
};

const longDay = (day: string) => formatDate(`${day}T12:00:00Z`, "EEEE d MMMM");

/** Membres (actifs) des foyers donnés, une fois chacun, par prénom. */
async function membersOf(tx: Transaction, householdIds: string[]): Promise<Recipient[]> {
  if (householdIds.length === 0) return [];
  const rows = await tx
    .select({
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      householdId: householdMember.householdId,
    })
    .from(householdMember)
    .innerJoin(user, eq(user.id, householdMember.userId))
    .innerJoin(household, eq(household.id, householdMember.householdId))
    .where(
      and(
        inArray(householdMember.householdId, householdIds),
        isNull(householdMember.archivedAt),
        isNull(household.archivedAt),
        isNull(household.anonymizedAt),
      ),
    )
    .orderBy(asc(user.firstName), asc(user.lastName));
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.userId) && seen.add(r.userId));
}

/** Tous les adhérents : membres des foyers dont l'adhésion couvre aujourd'hui. */
export async function allMembers(tx: Transaction, now: Date): Promise<Recipient[]> {
  const today = parisDay(now);
  const periods = await tx
    .select({
      householdId: membership.householdId,
      startDate: membership.startDate,
      endDate: membership.endDate,
    })
    .from(membership)
    .where(isNull(membership.archivedAt));
  const active = [...new Set(periods.map((p) => p.householdId))].filter((id) =>
    coversDay(
      periods.filter((p) => p.householdId === id),
      today,
    ),
  );
  return membersOf(tx, active);
}

/**
 * Clients d'un producteur : foyers qui lui ont commandé pour le mois en cours, les 3 mois
 * précédents, ou le mois suivant (commandes passées ce mois-ci).
 */
export async function producerCustomers(
  tx: Transaction,
  producerId: string,
  now: Date,
): Promise<Recipient[]> {
  const month = parisDay(now).slice(0, 7);
  const rows = await tx
    .selectDistinct({ householdId: order.householdId })
    .from(order)
    .innerJoin(catalog, eq(catalog.id, order.catalogId))
    .where(
      and(
        eq(catalog.producerId, producerId),
        gte(catalog.month, `${addMonths(month, -CUSTOMER_MONTHS)}-01`),
        lte(catalog.month, `${addMonths(month, 1)}-01`),
      ),
    );
  return membersOf(
    tx,
    rows.map((r) => r.householdId),
  );
}

/** Valeurs des balises de dates : période de commande et période des disponibilités à venir. */
async function dateTagValues(tx: Transaction, now: Date): Promise<TagValues> {
  const values: TagValues = {};
  const [period] = await tx
    .select()
    .from(orderPeriod)
    .where(ne(orderPeriod.status, "closed"))
    .orderBy(asc(orderPeriod.month))
    .limit(1);
  if (period) {
    const { opensOn, closesOn } = periodDays(period);
    values.debutPeriodeCommande = longDay(opensOn);
    values.finPeriodeCommande = longDay(closesOn);
  }
  const [plan] = await tx
    .select()
    .from(dutyPlan)
    .where(and(gte(dutyPlan.quarterStart, parisDay(now)), ne(dutyPlan.status, "sent")))
    .orderBy(asc(dutyPlan.quarterStart))
    .limit(1);
  if (plan) {
    const { opensOn, deadlineOn } = planDays(plan);
    values.debutDeclarationDisponibilites = longDay(opensOn);
    values.finDeclarationDisponibilites = longDay(deadlineOn);
  }
  return values;
}

export type ComposerView = {
  amap: { name: string; slug: string; logoUrl: string | null };
  sender: string;
  producers: Array<{ id: string; name: string; category: string; recipients: Recipient[] }>;
  members: Recipient[];
  /** Valeurs des balises de dates (absentes si la période n'est pas définie). */
  dateValues: TagValues;
  history: CampaignRow[];
};

/** Écran « Envoyer un email » (A9) : destinataires possibles, valeurs des balises, historique. */
export async function getEmailComposer(
  tx: Transaction,
  ctx: AmapContext,
  amapInfo: { name: string; slug: string; logoUrl: string | null },
  now = new Date(),
): Promise<ComposerView> {
  await requireRole(tx, ctx, ["admin"]);
  const producers = await tx
    .select({ id: producer.id, name: producer.name, category: producer.category })
    .from(amapProducer)
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(eq(amapProducer.active, true))
    .orderBy(asc(producer.name));
  return {
    amap: amapInfo,
    sender: process.env.EMAIL_FROM ?? "Pomme <ne-pas-repondre@example.org>",
    producers: await Promise.all(
      producers.map(async (p) => ({ ...p, recipients: await producerCustomers(tx, p.id, now) })),
    ),
    members: await allMembers(tx, now),
    dateValues: await dateTagValues(tx, now),
    history: await listCampaigns(tx),
  };
}

export const groupEmailSchema = z.object({
  audience: z.enum(["all_members", "producer_customers"]),
  producerId: z.uuid().nullable().default(null),
  subject: z.string().trim().max(200),
  body: z.string().max(20_000),
});

export type GroupEmailInput = z.input<typeof groupEmailSchema>;

/** Contenu de l'email d'une personne : balises remplacées, aux couleurs de l'AMAP. */
export function groupEmailContent(params: {
  amap: { name: string; theme: Parameters<typeof renderEmail>[0]["theme"] };
  subject: string;
  body: string;
  values: TagValues;
  spaceUrl: string;
  footer: string;
  spaceLabel: string;
}): EmailContent {
  const subject = renderTags(params.subject, params.values);
  const paragraphs = bodyParagraphs(renderTags(params.body, params.values));
  return renderEmail(
    { name: params.amap.name, theme: params.amap.theme },
    {
      subject,
      preview: paragraphs[0]?.slice(0, 120),
      greeting: "",
      paragraphs,
      action: { label: params.spaceLabel, url: params.spaceUrl },
      notes: [],
      footer: params.footer,
    },
  );
}

export type PreparedGroupEmail =
  | {
      status: "ready";
      audience: "all_members" | "producer_customers";
      producerId: string | null;
      producerName: string | null;
      subject: string;
      body: string;
      recipients: Recipient[];
      householdCount: number;
      /** Valeurs communes (dates, producteur) ; prénom et nom s'ajoutent par personne. */
      values: TagValues;
      check: TagCheck;
    }
  | { status: "invalid" | "no_subject" | "blocked" | "no_recipient" };

/**
 * Prépare un envoi : destinataires et valeurs recalculés ; refusé sans objet, avec une période
 * manquante ou `{{producteur}}` hors envoi aux clients d'un producteur.
 */
export async function prepareGroupEmail(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<PreparedGroupEmail> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = groupEmailSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { audience, producerId, subject, body } = parsed.data;
  let recipients: Recipient[];
  let producerName: string | null = null;
  if (audience === "producer_customers") {
    if (!producerId) return { status: "invalid" };
    const [row] = await tx
      .select({ name: producer.name })
      .from(amapProducer)
      .innerJoin(producer, eq(producer.id, amapProducer.producerId))
      .where(eq(producer.id, producerId));
    if (!row) return { status: "invalid" };
    producerName = row.name;
    recipients = await producerCustomers(tx, producerId, now);
  } else {
    recipients = await allMembers(tx, now);
  }
  const values: TagValues = {
    ...(await dateTagValues(tx, now)),
    ...(producerName ? { producteur: producerName } : {}),
  };
  const check = checkTags({ subject, body, audience, values });
  if (subject === "") return { status: "no_subject" };
  if (!canSend(subject, check)) return { status: "blocked" };
  if (recipients.length === 0) return { status: "no_recipient" };
  return {
    status: "ready",
    audience,
    producerId: audience === "producer_customers" ? producerId : null,
    producerName,
    subject,
    body,
    recipients,
    householdCount: new Set(recipients.map((r) => r.householdId)).size,
    values,
    check,
  };
}

/** Valeurs des balises pour une personne. */
export function recipientValues(common: TagValues, person: Recipient): TagValues {
  return { ...common, prenom: person.firstName, nom: person.lastName };
}
