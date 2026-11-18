import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireFamilyPage } from "@/server/auth/guards";
import { getFamilyOrder } from "@/server/orders";

/** Commande du foyer du compte connecté, pour les pages de /famille/commande (story D3). */
export async function loadFamilyOrder(slug: string) {
  const { ctx } = await requireFamilyPage(slug);
  return withAmapContext(getDatabase(), ctx, (tx, c) => getFamilyOrder(tx, c));
}
