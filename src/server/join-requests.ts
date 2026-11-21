import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { joinRequest } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import {
  checkJoinRequest,
  isOpen,
  type JoinRequestProblem,
  type JoinRequestStatus,
} from "@/domain/join-requests";

import { writeAuditLog } from "./audit";
import { requireRole } from "./auth/require-role";
import { createHousehold, type CreateHouseholdResult, type Invitation } from "./households";
import { saveMembership, type SaveMembershipResult } from "./memberships";

// Demandes d'adhésion (story B2, ADR 0034). Un visiteur en envoie une (sans compte ; captcha et
// limite de débit dans l'action) ; les admins la lisent et la traitent (requireRole, et la Row
// Level Security). Chaque décision est journalisée.

export type SubmitJoinRequestResult =
  { status: "sent" } | { status: "invalid"; problems: JoinRequestProblem[] };

/**
 * Enregistre une demande envoyée depuis « Nous rejoindre ». Contexte : l'AMAP de l'adresse,
 * sans compte (la base n'accepte qu'une demande nouvelle, rattachée à rien).
 */
export async function submitJoinRequest(
  tx: Transaction,
  ctx: AmapContext,
  input: { name: string; email: string; phone: string; message: string },
): Promise<SubmitJoinRequestResult> {
  const checked = checkJoinRequest(input);
  if (!checked.ok) return { status: "invalid", problems: checked.problems };
  await tx.insert(joinRequest).values({ id: uuidv7(), amapId: ctx.amapId!, ...checked.value });
  return { status: "sent" };
}

export type JoinRequestView = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: JoinRequestStatus;
  createdAt: Date;
  handledAt: Date | null;
  householdId: string | null;
};

/** Nombre de demandes à traiter (nouvelles ou contactées), pour l'onglet. */
export async function countOpenJoinRequests(tx: Transaction, ctx: AmapContext): Promise<number> {
  await requireRole(tx, ctx, ["admin"]);
  const rows = await tx
    .select({ id: joinRequest.id })
    .from(joinRequest)
    .where(inArray(joinRequest.status, ["new", "contacted"]));
  return rows.length;
}

/** Demandes à traiter d'abord (les plus anciennes en tête), puis les 20 dernières closes. */
export async function listJoinRequests(
  tx: Transaction,
  ctx: AmapContext,
): Promise<{ open: JoinRequestView[]; closed: JoinRequestView[] }> {
  await requireRole(tx, ctx, ["admin"]);
  const rows = await tx
    .select({
      id: joinRequest.id,
      name: joinRequest.name,
      email: joinRequest.email,
      phone: joinRequest.phone,
      message: joinRequest.message,
      status: joinRequest.status,
      createdAt: joinRequest.createdAt,
      handledAt: joinRequest.handledAt,
      householdId: joinRequest.householdId,
    })
    .from(joinRequest)
    .orderBy(desc(joinRequest.createdAt));
  return {
    open: rows.filter((r) => isOpen(r.status)).reverse(),
    closed: rows.filter((r) => !isOpen(r.status)).slice(0, 20),
  };
}

export type DecideJoinRequestResult = { status: "saved" | "not_found" | "closed" | "invalid" };

/** Demande encore ouverte (nouvelle ou contactée), ou la raison pour laquelle elle ne l'est pas. */
async function loadOpen(
  tx: Transaction,
  requestId: string,
): Promise<{ row: typeof joinRequest.$inferSelect } | { problem: "not_found" | "closed" }> {
  if (!z.uuid().safeParse(requestId).success) return { problem: "not_found" };
  const [row] = await tx.select().from(joinRequest).where(eq(joinRequest.id, requestId));
  if (!row) return { problem: "not_found" };
  if (!isOpen(row.status)) return { problem: "closed" };
  return { row };
}

/** Marque une demande nouvelle comme contactée, ou la refuse. Journalisé. */
export async function decideJoinRequest(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<DecideJoinRequestResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = z
    .object({ requestId: z.string(), decision: z.enum(["contacted", "declined"]) })
    .safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const found = await loadOpen(tx, parsed.data.requestId);
  if ("problem" in found) return { status: found.problem };
  const status = parsed.data.decision;
  await tx
    .update(joinRequest)
    .set({ status, handledBy: ctx.userId, handledAt: now })
    .where(eq(joinRequest.id, found.row.id));
  await writeAuditLog(tx, ctx, {
    entityType: "join_request",
    entityId: found.row.id,
    action: status === "contacted" ? "mark_contacted" : "decline",
    before: { status: found.row.status },
    after: { status },
  });
  return { status: "saved" };
}

const acceptSchema = z.object({
  requestId: z.string(),
  householdName: z.string(),
  firstName: z.string(),
  lastName: z.string().default(""),
  email: z.string(),
  phone: z.string().default(""),
  startDate: z.string(),
  endDate: z.string(),
});

export type AcceptJoinRequestResult =
  | { status: "accepted"; householdId: string; invitations: Invitation[] }
  | { status: "not_found" | "closed" | "invalid" }
  | { status: "household"; result: Exclude<CreateHouseholdResult, { status: "created" }> }
  | { status: "membership"; result: Exclude<SaveMembershipResult, { status: "saved" }> };

/**
 * Accepte une demande : crée le foyer et son membre (avec le compte s'il n'existe pas),
 * enregistre l'adhésion, puis rattache le foyer à la demande ; le tout en une transaction
 * (si l'adhésion est refusée, rien n'est créé). L'invitation part ensuite (action).
 */
export async function acceptJoinRequest(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<AcceptJoinRequestResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const data = parsed.data;
  const found = await loadOpen(tx, data.requestId);
  if ("problem" in found) return { status: found.problem };

  // Point de sauvegarde : un foyer ou une adhésion refusés n'enregistrent rien.
  class Rollback extends Error {
    constructor(readonly result: AcceptJoinRequestResult) {
      super("annulé");
    }
  }
  try {
    return await tx.transaction(async (sub) => {
      const created = await createHousehold(sub, ctx, {
        name: data.householdName,
        members: [
          {
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            isPrimary: true,
          },
        ],
      });
      if (created.status !== "created")
        throw new Rollback({ status: "household", result: created });
      const membership = await saveMembership(sub, ctx, {
        householdId: created.householdId,
        startDate: data.startDate,
        endDate: data.endDate,
        fee: "",
        note: "",
      });
      if (membership.status !== "saved") {
        throw new Rollback({ status: "membership", result: membership });
      }
      await sub
        .update(joinRequest)
        .set({
          status: "accepted",
          householdId: created.householdId,
          handledBy: ctx.userId,
          handledAt: now,
        })
        .where(and(eq(joinRequest.id, found.row.id)));
      await writeAuditLog(sub, ctx, {
        entityType: "join_request",
        entityId: found.row.id,
        action: "accept",
        before: { status: found.row.status },
        after: { status: "accepted", householdId: created.householdId },
      });
      return {
        status: "accepted" as const,
        householdId: created.householdId,
        invitations: created.invitations,
      };
    });
  } catch (error) {
    if (error instanceof Rollback) return error.result;
    throw error;
  }
}
