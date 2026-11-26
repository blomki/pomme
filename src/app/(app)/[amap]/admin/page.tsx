import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { getMembershipProgress, listFollowUpTasks } from "@/server/admin-tasks";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getDashboardOrderPeriod } from "@/server/order-periods";
import { blockingTasks } from "@/server/producers";
import { DashboardTasks, MembershipCard } from "@/ui/admin/DashboardTasks";
import { OrderPeriodBanner } from "@/ui/admin/OrderPeriodBanner";
import { PageBanner } from "@/ui/layout/PageBanner";

type Props = { params: Promise<{ amap: string }> };

// Administration d'une AMAP (ordinateur) : [domaine]/<amap>/admin. Tableau de bord (écran A1) :
// bandeau des commandes du mois et leur avancement (D2), avancement des adhésions, puis la liste
// de tâches, « Bloquant » et « À suivre » (H3).
export default async function AdminHomePage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const data = await withAmapContext(getDatabase(), ctx, async (tx, c) => ({
    blocking: await blockingTasks(tx, c),
    followUp: await listFollowUpTasks(tx, c),
    memberships: await getMembershipProgress(tx, c),
    period: await getDashboardOrderPeriod(tx, c),
  }));
  const t = await getTranslations("Admin");
  const tb = await getTranslations("Banners");
  return (
    <>
      <PageBanner title={t("title")}>{tb("adminDashboard")}</PageBanner>
      <OrderPeriodBanner amapSlug={slug} period={data.period} />
      <MembershipCard amapSlug={slug} progress={data.memberships} />
      <DashboardTasks
        amapSlug={slug}
        blocking={data.blocking}
        todo={data.followUp.todo}
        done={data.followUp.done}
      />
    </>
  );
}
