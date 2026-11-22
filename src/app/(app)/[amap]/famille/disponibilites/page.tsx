import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireFamilyPage } from "@/server/auth/guards";
import { quarterLabel } from "@/server/duty-notices";
import { getMyAvailability } from "@/server/duty-plans";
import { MyAvailability } from "@/ui/family/MyAvailability";

import { OrderState } from "../commande/OrderState";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/famille/disponibilites : « Mes disponibilités » pour les permanences du
// prochain trimestre (story G1, écran 7).
export default async function MyAvailabilityPage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireFamilyPage(slug);
  const data = await withAmapContext(getDatabase(), ctx, (tx, c) => getMyAvailability(tx, c));
  if (data.status === "no_household") return <OrderState state="no_household" />;
  const t = await getTranslations("Family.availability");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      {data.status === "none" ? (
        <Typography>{t("none")}</Typography>
      ) : (
        <>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {t("subtitle", { quarter: quarterLabel(data.quarterStart) })}
          </Typography>
          <MyAvailability
            amapSlug={slug}
            planId={data.planId}
            deadlineOn={data.deadlineOn}
            phase={data.phase}
            distributions={data.distributions}
            unavailable={data.unavailable}
            answeredOn={data.answeredOn}
          />
        </>
      )}
    </>
  );
}
