import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";

// Sonde de santé (ADR 0008) : Clever Cloud l'appelle avant de basculer sur une nouvelle version
// (CC_HEALTH_CHECK_PATH), et la sonde de disponibilité toutes les 5 minutes. Répond 200 si
// l'application tourne ET joint la base ; 503 sinon. Aucun détail d'erreur dans la réponse
// (il renseignerait un attaquant) : l'erreur va dans les journaux.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDatabase().execute(sql`select 1`);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Sonde de santé : base injoignable :", error);
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
