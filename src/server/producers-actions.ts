"use server";

import { revalidatePath } from "next/cache";

import { asAdmin } from "./admin-action";
import {
  attachProducer,
  createProducer,
  searchProducers,
  setProducerReferents,
  updateProducer,
  type SaveProducerResult,
  type SetReferentsResult,
} from "./producers";

// Actions de l'écran « Producteurs et référents » (story C1). Chacune : contexte de l'AMAP de
// l'adresse, puis fonction de producers.ts (qui vérifie le rôle admin dans la transaction).

const listPath = (slug: string) => `/${slug}/admin/producteurs`;

type Forbidden = { status: "forbidden" };

/** Les écrans de l'admin (liste, fiche, tableau de bord) affichent ces données. */
function refresh(slug: string) {
  revalidatePath(`/${slug}/admin`, "layout");
}

/** « Créer un producteur » : fiche commune et réglages dans l'AMAP. */
export async function createProducerAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SaveProducerResult | Forbidden> {
  const outcome = await asAdmin(amap, listPath(amap), (tx, ctx) => createProducer(tx, ctx, input));
  if ("status" in outcome) return outcome;
  refresh(amap);
  return outcome.result;
}

/** Recherche d'un producteur existant à rattacher (nom et catégorie seulement). */
export async function searchProducersAction(
  amap: string,
  query: string,
): Promise<Array<{ id: string; name: string; category: string }> | Forbidden> {
  const outcome = await asAdmin(amap, listPath(amap), (tx, ctx) => searchProducers(tx, ctx, query));
  return "status" in outcome ? outcome : outcome.result;
}

/** « Rattacher » un producteur qui livre déjà une autre AMAP. */
export async function attachProducerAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SaveProducerResult | Forbidden> {
  const outcome = await asAdmin(amap, listPath(amap), (tx, ctx) => attachProducer(tx, ctx, input));
  if ("status" in outcome) return outcome;
  refresh(amap);
  return outcome.result;
}

/** Enregistre la fiche et les réglages d'un producteur. */
export async function updateProducerAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SaveProducerResult | Forbidden> {
  const outcome = await asAdmin(amap, listPath(amap), (tx, ctx) => updateProducer(tx, ctx, input));
  if ("status" in outcome) return outcome;
  refresh(amap);
  return outcome.result;
}

/** Enregistre les référents d'un producteur. */
export async function setProducerReferentsAction(
  amap: string,
  input: { amapProducerId: string; userIds: string[] },
): Promise<SetReferentsResult | Forbidden> {
  const outcome = await asAdmin(amap, listPath(amap), (tx, ctx) =>
    setProducerReferents(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  refresh(amap);
  return outcome.result;
}
