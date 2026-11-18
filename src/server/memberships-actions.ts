"use server";

import { revalidatePath } from "next/cache";

import { runAmapAction } from "./amap-action";
import { archiveMembership, saveMembership, type SaveMembershipResult } from "./memberships";

// Actions de la section « Adhésions » de la fiche d'un foyer (story B1). Chacune : contexte de
// l'AMAP de l'adresse, puis fonction de memberships.ts (qui vérifie le rôle admin).

type Forbidden = { status: "forbidden" };

/** Revalide la fiche du foyer et la liste (statut d'adhésion). */
function refresh(amap: string, householdId: string) {
  revalidatePath(`/${amap}/admin/foyers/${householdId}`);
  revalidatePath(`/${amap}/admin/foyers`);
}

/** « Ajouter une adhésion » ou « Modifier » une adhésion. */
export async function saveMembershipAction(
  amap: string,
  input: {
    householdId: string;
    id?: string;
    startDate: string;
    endDate: string;
    fee: string;
    note: string;
  },
): Promise<SaveMembershipResult | Forbidden> {
  const path = `/${amap}/admin/foyers/${input.householdId}`;
  const outcome = await runAmapAction(amap, path, (tx, ctx) => saveMembership(tx, ctx, input));
  if ("status" in outcome) return outcome;
  refresh(amap, input.householdId);
  return outcome.result;
}

/** « Archiver » une adhésion saisie par erreur. */
export async function archiveMembershipAction(
  amap: string,
  input: { householdId: string; id: string },
): Promise<{ status: "archived" | "not_found" } | Forbidden> {
  const path = `/${amap}/admin/foyers/${input.householdId}`;
  const outcome = await runAmapAction(amap, path, (tx, ctx) =>
    archiveMembership(tx, ctx, { id: input.id }),
  );
  if ("status" in outcome) return outcome;
  refresh(amap, input.householdId);
  return outcome.result;
}
