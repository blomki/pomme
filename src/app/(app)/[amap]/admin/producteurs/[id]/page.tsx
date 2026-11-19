import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { storageSettings } from "@/server/files/settings";
import { getAmapProducer, listReferentCandidates } from "@/server/producers";
import { ProducerDetail } from "@/ui/admin/ProducerDetail";

type Props = { params: Promise<{ amap: string; id: string }> };

// [domaine]/<amap>/admin/producteurs/<id> : fiche, réglages et référents d'un producteur.
export default async function ProducerPage({ params }: Props) {
  const { amap: slug, id } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const data = await withAmapContext(getDatabase(), ctx, async (tx, c) => ({
    producer: await getAmapProducer(tx, c, id),
    candidates: await listReferentCandidates(tx, c),
  }));
  if (!data.producer) notFound();
  return (
    // key : repart des valeurs enregistrées après un rechargement des données.
    <ProducerDetail
      key={data.producer.id}
      amapSlug={slug}
      producer={data.producer}
      candidates={data.candidates}
      photoEnabled={storageSettings() !== null}
    />
  );
}
