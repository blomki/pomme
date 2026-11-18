import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getDashboardOrderPeriod } from "@/server/order-periods";
import { blockingTasks } from "@/server/producers";
import { BlockingTasks } from "@/ui/admin/BlockingTasks";
import { OrderPeriodBanner } from "@/ui/admin/OrderPeriodBanner";

type Props = { params: Promise<{ amap: string }> };

// Administration d'une AMAP (ordinateur) : [domaine]/<amap>/admin. Tableau de bord : bandeau
// des commandes du mois (D2), puis la liste des tâches « Bloquant » ; les tâches « À suivre »
// viendront avec H3.
export default async function AdminHomePage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const { tasks, period } = await withAmapContext(getDatabase(), ctx, async (tx, c) => ({
    tasks: await blockingTasks(tx, c),
    period: await getDashboardOrderPeriod(tx, c),
  }));
  const t = await getTranslations("Admin");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <OrderPeriodBanner amapSlug={slug} period={period} />
      <BlockingTasks amapSlug={slug} tasks={tasks} />
    </>
  );
}
