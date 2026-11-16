import { and, asc, eq, gt, gte, lt } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amap, distribution } from "@/db/schema";
import {
  addMonths,
  closedReason,
  distributionDates,
  isValidTime,
  isValidTimeRange,
  parseMonth,
  sameWeekDate,
  WEEKDAYS,
  type Weekday,
} from "@/domain/distributions";

import { formatDate } from "@/i18n/dates";

import { requireRole } from "./auth/require-role";
import { writeAuditLog } from "./audit";
import { uniqueViolation } from "./db-errors";

// Calendrier des distributions (story D1). Réservé aux admins : ils fixent le calendrier.

/** Distribution habituelle de l'AMAP : jour, horaires, lieu. Vides tant qu'ils ne sont pas réglés. */
export type DistributionSettings = {
  weekday: Weekday | null;
  startTime: string;
  endTime: string;
  place: string;
};

export async function getDistributionSettings(
  tx: Transaction,
  ctx: AmapContext,
): Promise<DistributionSettings> {
  await requireRole(tx, ctx, ["admin"]);
  const [row] = await tx
    .select({ settings: amap.settings, place: amap.distributionPlace })
    .from(amap)
    .where(eq(amap.id, ctx.amapId!));
  const settings = row?.settings ?? {};
  return {
    weekday: WEEKDAYS.find((d) => d === settings.distributionWeekday) ?? null,
    startTime: settings.distributionStartTime ?? "",
    endTime: settings.distributionEndTime ?? "",
    place: row?.place ?? "",
  };
}

export const settingsSchema = z
  .object({
    // 1 = lundi … 7 = dimanche.
    weekday: z.coerce.number().int().min(1).max(7),
    startTime: z.string().refine(isValidTime),
    endTime: z.string().refine(isValidTime),
    place: z.string().trim().max(200).default(""),
    // Déplacer aussi les distributions à venir au nouveau jour et aux nouveaux horaires.
    moveUpcoming: z.boolean().default(false),
  })
  .refine((s) => isValidTimeRange(s.startTime, s.endTime), { path: ["endTime"] });

export type SaveSettingsResult =
  | {
      status: "saved";
      /** Distributions à venir déplacées (ou dont seuls les horaires ont changé). */
      moved: number;
      /**
       * Dates laissées telles quelles : une distribution existe déjà au jour visé, ou ce jour
       * est déjà passé (même semaine).
       */
      skipped: string[];
    }
  | { status: "invalid"; fields: string[] };

/**
 * Règle la distribution habituelle. Les prochaines générations prennent le nouveau jour et les
 * nouveaux horaires. Avec `moveUpcoming`, les distributions À VENIR (après `today`) sont aussi
 * déplacées au nouveau jour de la même semaine, avec les nouveaux horaires ; une distribution
 * fermée le reste. Le passé ne bouge jamais. Journalisé.
 *
 * @param today jour de référence (« 2026-11-16 ») : celui de Paris par défaut
 */
export async function saveDistributionSettings(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  today: string = formatDate(new Date(), "yyyy-MM-dd"),
): Promise<SaveSettingsResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "invalid",
      fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))],
    };
  }
  const { startTime, endTime, place, moveUpcoming } = parsed.data;
  const weekday = parsed.data.weekday as Weekday;
  const [row] = await tx
    .select({ settings: amap.settings })
    .from(amap)
    .where(eq(amap.id, ctx.amapId!));
  await tx
    .update(amap)
    .set({
      distributionPlace: place,
      settings: {
        ...row?.settings,
        distributionWeekday: weekday,
        distributionStartTime: startTime,
        distributionEndTime: endTime,
      },
    })
    .where(eq(amap.id, ctx.amapId!));
  if (!moveUpcoming) return { status: "saved", moved: 0, skipped: [] };

  const upcoming = await tx
    .select({ id: distribution.id, date: distribution.date })
    .from(distribution)
    .where(gt(distribution.date, today))
    .orderBy(asc(distribution.date));
  let moved = 0;
  const skipped: string[] = [];
  for (const row of upcoming) {
    const target = sameWeekDate(row.date, weekday);
    // Le jour visé de cette semaine est déjà passé (ou c'est aujourd'hui) : on n'y touche pas.
    if (target <= today) {
      skipped.push(row.date);
      continue;
    }
    try {
      // Sous-transaction : si une distribution existe déjà au jour visé (date unique), seule
      // celle-ci est laissée telle quelle.
      await tx.transaction((sub) =>
        sub
          .update(distribution)
          .set({ date: target, startTime, endTime })
          .where(eq(distribution.id, row.id)),
      );
      moved += 1;
    } catch (error) {
      if (uniqueViolation(error) !== "distribution_amap_date_unique") throw error;
      skipped.push(row.date);
    }
  }
  await writeAuditLog(tx, ctx, {
    entityType: "amap",
    entityId: ctx.amapId!,
    action: "move_distributions",
    after: { weekday, startTime, endTime, moved, skipped },
  });
  return { status: "saved", moved, skipped };
}

export type DistributionView = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  isOpen: boolean;
  closedReason: string | null;
};

/** Distributions d'un mois (« 2026-12 »), par date. */
export async function listDistributions(
  tx: Transaction,
  ctx: AmapContext,
  month: string,
): Promise<DistributionView[]> {
  await requireRole(tx, ctx, ["admin"]);
  const valid = parseMonth(month);
  if (!valid) return [];
  const rows = await tx
    .select({
      id: distribution.id,
      date: distribution.date,
      startTime: distribution.startTime,
      endTime: distribution.endTime,
      isOpen: distribution.isOpen,
      closedReason: distribution.closedReason,
    })
    .from(distribution)
    .where(
      and(
        gte(distribution.date, `${valid}-01`),
        lt(distribution.date, `${addMonths(valid, 1)}-01`),
      ),
    )
    .orderBy(asc(distribution.date));
  // PostgreSQL renvoie « 18:00:00 » : on garde « 18:00 ».
  return rows.map((r) => ({
    ...r,
    startTime: r.startTime.slice(0, 5),
    endTime: r.endTime.slice(0, 5),
  }));
}

export type GenerateResult =
  { status: "generated"; created: number } | { status: "invalid" | "no_settings" };

/**
 * Crée les distributions d'un mois, le jour et aux horaires habituels. Les dates qui ont déjà
 * une distribution sont laissées telles quelles (on peut relancer sans risque). Journalisé.
 */
export async function generateDistributions(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<GenerateResult> {
  const settings = await getDistributionSettings(tx, ctx);
  const parsed = z.object({ month: z.string() }).safeParse(input);
  const month = parsed.success ? parseMonth(parsed.data.month) : null;
  if (!month) return { status: "invalid" };
  if (!settings.weekday || !isValidTimeRange(settings.startTime, settings.endTime)) {
    return { status: "no_settings" };
  }

  const created = await tx
    .insert(distribution)
    .values(
      distributionDates(month, settings.weekday).map((date) => ({
        amapId: ctx.amapId!,
        date,
        startTime: settings.startTime,
        endTime: settings.endTime,
        createdBy: ctx.userId,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: distribution.id });
  await writeAuditLog(tx, ctx, {
    entityType: "amap",
    entityId: ctx.amapId!,
    action: "generate_distributions",
    after: { month, created: created.length },
  });
  return { status: "generated", created: created.length };
}

export type SetOpenResult = { status: "updated" | "invalid" | "not_found" | "reason_required" };

/**
 * Ferme une distribution (motif obligatoire) ou la rouvre. Journalisé avec le motif : familles
 * et producteurs devront être prévenus.
 */
export async function setDistributionOpen(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SetOpenResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = z
    .object({
      distributionId: z.uuid(),
      open: z.boolean(),
      reason: z.string().max(500).default(""),
    })
    .safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { distributionId, open } = parsed.data;
  const reason = open ? null : closedReason(parsed.data.reason);
  if (!open && !reason) return { status: "reason_required" };

  const updated = await tx
    .update(distribution)
    .set({ isOpen: open, closedReason: reason })
    .where(eq(distribution.id, distributionId))
    .returning({ date: distribution.date });
  if (updated.length === 0) return { status: "not_found" };
  await writeAuditLog(tx, ctx, {
    entityType: "distribution",
    entityId: distributionId,
    action: open ? "reopen" : "close",
    after: { date: updated[0]!.date, reason },
  });
  return { status: "updated" };
}
