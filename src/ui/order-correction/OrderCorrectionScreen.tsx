import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import type { OrderCorrection } from "@/server/order-corrections";
import { PageBanner } from "@/ui/layout/PageBanner";

import { ProducerOrder } from "../family/ProducerOrder";
import { LinkButton } from "../navigation/LinkButton";

/**
 * Écran « Corriger la commande d'un foyer » (story D7), commun au référent (depuis le bon de
 * commande) et à l'admin (depuis la fiche du foyer) : l'écran de saisie de la famille, en mode
 * correction, ou la raison pour laquelle rien ne se corrige.
 */
export async function OrderCorrectionScreen({
  amapSlug,
  amapProducerId,
  backHref,
  correction,
}: {
  amapSlug: string;
  amapProducerId: string;
  backHref: string;
  correction: Exclude<OrderCorrection, { state: "not_found" }>;
}) {
  const t = await getTranslations("Correction");
  if (correction.state !== "open" || !correction.producer) {
    return (
      <>
        <PageBanner title={t("heading")} />
        <Typography sx={{ mb: 2 }}>
          {correction.state === "open" ? t("noCatalog") : t("notOpen")}
        </Typography>
        <LinkButton href={backHref} variant="outlined">
          {t("back")}
        </LinkButton>
      </>
    );
  }
  return (
    <>
      {!correction.membershipActive && (
        <Typography sx={{ mb: 2, color: "text.secondary" }}>{t("membership")}</Typography>
      )}
      <ProducerOrder
        amapSlug={amapSlug}
        month={correction.month}
        distributions={correction.distributions}
        producer={correction.producer}
        correction={{
          householdId: correction.household.id,
          householdName: correction.household.name,
          amapProducerId,
          backHref,
        }}
      />
    </>
  );
}
