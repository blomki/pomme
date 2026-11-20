import { notFound } from "next/navigation";
import { connection } from "next/server";

import { buildSignInSheet } from "@/domain/sign-in-sheet";
import { SignInSheet } from "@/ui/sign-in-sheet/SignInSheet";

import { demoPagesEnabled } from "../../../../_components/demo-pages";

// Feuille d'émargement de démonstration (développement et CI seulement), avec des données fixes :
// sa capture visuelle ne change pas d'un mois à l'autre, contrairement au jeu de données (E3).
const distributions = [
  { id: "d1", date: "2026-12-03" },
  { id: "d2", date: "2026-12-10" },
  { id: "d3", date: "2026-12-17" },
];
const households = ["Foyer Bernard", "Foyer Dubois", "Foyer Lefèvre", "Foyer Martin"];
const products = [
  { producer: "Boulangerie des Trois Moulins", product: "Pain de campagne, 1 kg" },
  { producer: "Ferme du Coteau", product: "Œufs, boîte de 6" },
  { producer: "Ferme du Coteau", product: "Poulet fermier" },
  { producer: "Laiterie du Pré Vert", product: "Yaourts nature, lot de 4" },
];
const lines = households.flatMap((householdName, h) =>
  products.flatMap((p, i) =>
    distributions.map((d, w) => ({
      householdId: `h${h}`,
      householdName,
      producerName: p.producer,
      productName: p.product,
      distributionId: d.id,
      // Quantités fixes, variées : certaines semaines sans rien.
      quantity: (h + i + w) % 3,
    })),
  ),
);

export default async function SignInSheetDemoPage() {
  await connection();
  if (!demoPagesEnabled()) notFound();
  return (
    <SignInSheet
      amapName="AMAP de démonstration"
      month="2026-12"
      sheet={buildSignInSheet({ distributions, lines })}
    />
  );
}
