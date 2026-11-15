import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { blockingTasks } from "@/server/producers";
import { BlockingTasks } from "@/ui/admin/BlockingTasks";

type Props = { params: Promise<{ amap: string }> };

// Administration d'une AMAP (ordinateur) : [domaine]/<amap>/admin. Tableau de bord : pour
// l'instant la liste des tâches « Bloquant » ; le bandeau des commandes et les tâches
// « À suivre » viendront avec leurs stories (D2, H3).
export default async function AdminHomePage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const tasks = await withAmapContext(getDatabase(), ctx, (tx, c) => blockingTasks(tx, c));
  const t = await getTranslations("Admin");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <BlockingTasks amapSlug={slug} tasks={tasks} />
    </>
  );
}
