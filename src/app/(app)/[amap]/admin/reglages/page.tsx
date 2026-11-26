import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { getAmapSettings } from "@/server/amap-settings";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getFileStore } from "@/server/files/storage";
import { AmapSettingsForm } from "@/ui/admin/AmapSettingsForm";
import { LinkButton } from "@/ui/navigation/LinkButton";
import { PageBanner } from "@/ui/layout/PageBanner";

type Props = { params: Promise<{ amap: string }> };

// /<amap>/admin/reglages : réglages de l'AMAP (story A4), réservés à ses administrateurs.
export default async function AmapSettingsPage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const settings = await withAmapContext(getDatabase(), ctx, (tx, c) => getAmapSettings(tx, c));
  const t = await getTranslations("Admin.settings");
  const tw = await getTranslations("Platform.weekdays");
  const weekday = settings.distribution.weekday;
  return (
    <>
      <PageBanner title={t("title")}>{t("intro")}</PageBanner>
      {/* Reprise des données (story K1) : utile une fois, en quittant AmapJ. */}
      <LinkButton href={`/${slug}/admin/reprise`} variant="outlined" sx={{ mb: 3 }}>
        {t("importLink")}
      </LinkButton>
      <AmapSettingsForm
        amapSlug={slug}
        settings={settings}
        storageEnabled={getFileStore() !== null}
        weekdayLabel={weekday ? tw(String(weekday) as "1").toLowerCase() : null}
      />
    </>
  );
}
