import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import {
  ForbiddenError,
  SecondFactorRequiredError,
  UnauthenticatedError,
} from "@/server/auth/errors";
import { getAmapContext } from "@/server/context";
import { exportHousehold } from "@/server/households";

type Params = { params: Promise<{ amap: string; id: string }> };

// [domaine]/<amap>/admin/foyers/<id>/export : données d'un foyer en JSON (RGPD, ADR 0010).
// Réservé aux admins de l'AMAP, après la deuxième vérification ; l'export est journalisé.
export async function GET(_request: Request, { params }: Params) {
  const { amap: slug, id } = await params;
  const ctx = await getAmapContext(slug);
  try {
    const data = await withAmapContext(getDatabase(), ctx, (tx, c) => exportHousehold(tx, c, id));
    if (!data) return new Response(null, { status: 404 });
    const day = data.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // Téléchargé, jamais mis en cache (données personnelles).
        "Content-Disposition": `attachment; filename="foyer-${id.slice(0, 8)}-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response(null, { status: 401 });
    if (error instanceof SecondFactorRequiredError || error instanceof ForbiddenError) {
      return new Response(null, { status: 403 });
    }
    throw error;
  }
}
