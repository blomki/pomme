import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireFamilyPage } from "@/server/auth/guards";
import { getFamilyHome } from "@/server/family-home";
import { FamilyHome } from "@/ui/family/FamilyHome";

import { OrderState } from "./commande/OrderState";

type Props = { params: Promise<{ amap: string }> };

// Espace famille d'une AMAP (mobile) : [domaine]/<amap>/famille (story D6, écran 1).
export default async function FamilyHomePage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireFamilyPage(slug);
  const home = await withAmapContext(getDatabase(), ctx, (tx, c) => getFamilyHome(tx, c));
  if (home.state === "no_household") return <OrderState state="no_household" />;
  const t = await getTranslations("Family");
  return (
    <FamilyHome
      amapSlug={slug}
      title={t("title")}
      membership={home.membership}
      period={home.period}
      nextDistribution={home.nextDistribution}
    />
  );
}
