"use server";

import { revalidatePath } from "next/cache";

import type { ReportReason } from "@/domain/reports";

import { runAmapAction } from "./amap-action";
import { creditFromReport, type CreditFromReportResult } from "./credits";
import {
  createAdminReport,
  createFamilyReport,
  rejectReport,
  type CreateReportResult,
  type DecideReportResult,
} from "./reports";

// Actions des signalements (story F5). Chacune : contexte de l'AMAP de l'adresse, puis
// reports.ts, qui vérifie le droit et refait tous les contrôles.

type Forbidden = { status: "forbidden" };
type ReportInput = { orderLineId: string; quantity: number; reason: ReportReason; comment: string };

/** La famille signale un problème (écran « Signaler un problème »). */
export async function createFamilyReportAction(
  amap: string,
  input: ReportInput,
): Promise<CreateReportResult | Forbidden> {
  const path = `/${amap}/famille/signalement`;
  const outcome = await runAmapAction(amap, path, (tx, ctx) => createFamilyReport(tx, ctx, input));
  if ("status" in outcome) return outcome;
  if (outcome.result.status === "created") revalidatePath(path);
  return outcome.result;
}

/** L'admin reporte un écart de la feuille d'émargement. */
export async function createAdminReportAction(
  amap: string,
  input: ReportInput,
): Promise<CreateReportResult | Forbidden> {
  const path = `/${amap}/admin/signalements`;
  const outcome = await runAmapAction(amap, path, (tx, ctx) => createAdminReport(tx, ctx, input));
  if ("status" in outcome) return outcome;
  if (outcome.result.status === "created") revalidatePath(path);
  return outcome.result;
}

/** Le référent du producteur, ou un admin, rejette un signalement (motif montré à la famille). */
export async function rejectReportAction(
  amap: string,
  input: { reportId: string; note: string },
): Promise<DecideReportResult | Forbidden> {
  const outcome = await runAmapAction(amap, `/${amap}/admin/signalements`, (tx, ctx) =>
    rejectReport(tx, ctx, input),
  );
  return "status" in outcome ? outcome : outcome.result;
}

/** Le référent du producteur, ou un admin, crée l'avoir d'un signalement (story F2). */
export async function creditFromReportAction(
  amap: string,
  input: { reportId: string; amountCents: number; pickedUp: boolean },
): Promise<CreditFromReportResult | Forbidden> {
  const outcome = await runAmapAction(amap, `/${amap}/admin/signalements`, (tx, ctx) =>
    creditFromReport(tx, ctx, input),
  );
  return "status" in outcome ? outcome : outcome.result;
}
