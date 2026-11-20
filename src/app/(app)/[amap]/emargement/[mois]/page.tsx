import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { parseMonth } from "@/domain/distributions";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getSignInSheet } from "@/server/sign-in-sheet";
import { SignInSheet } from "@/ui/sign-in-sheet/SignInSheet";

type Props = { params: Promise<{ amap: string; mois: string }> };

// [domaine]/<amap>/emargement/<mois> : feuille d'émargement du mois, prête à imprimer en A4,
// sans menu (story E3, ADR 0027). Réservée aux admins.
export default async function SignInSheetPage({ params }: Props) {
  const { amap: slug, mois } = await params;
  const month = parseMonth(mois);
  if (!month) notFound();
  const { amap, ctx } = await requireAmapAdminPage(slug);
  const sheet = await withAmapContext(getDatabase(), ctx, (tx, c) => getSignInSheet(tx, c, month));
  return <SignInSheet amapName={amap.name} month={month} sheet={sheet} />;
}
