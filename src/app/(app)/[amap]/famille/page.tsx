import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireFamilyPage } from "@/server/auth/guards";
import { quarterLabel } from "@/server/duty-notices";
import { getMyAvailability } from "@/server/duty-plans";
import { getFamilyHome } from "@/server/family-home";
import { FamilyHome } from "@/ui/family/FamilyHome";

import { OrderState } from "./commande/OrderState";

type Props = { params: Promise<{ amap: string }> };

// Espace famille d'une AMAP (mobile) : [domaine]/<amap>/famille (story D6, écran 1).
export default async function FamilyHomePage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireFamilyPage(slug);
  const [home, duty] = await withAmapContext(
    getDatabase(),
    ctx,
    async (tx, c) => [await getFamilyHome(tx, c), await getMyAvailability(tx, c)] as const,
  );
  if (home.state === "no_household") return <OrderState state="no_household" />;
  const t = await getTranslations("Family");
  return (
    <FamilyHome
      amapSlug={slug}
      title={t("title")}
      membership={home.membership}
      period={home.period}
      nextDistribution={home.nextDistribution}
      duty={
        duty.status === "ready" && duty.phase === "open"
          ? {
              quarter: quarterLabel(duty.quarterStart),
              deadlineOn: duty.deadlineOn,
              distributionCount: duty.distributions.length,
              answered: duty.answeredOn !== null,
              unavailableCount: duty.unavailable.length,
            }
          : null
      }
    />
  );
}
