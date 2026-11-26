import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import type { ComposerView } from "@/server/group-emails";
import { GroupEmail } from "@/ui/admin/GroupEmail";
import { DesktopShell } from "@/ui/layout/DesktopShell";
import { PageBanner } from "@/ui/layout/PageBanner";

import { AmapThemeBoundary } from "../../../../_components/AmapThemeBoundary";
import { demoPagesEnabled } from "../../../../_components/demo-pages";

// « Envoyer un email » de démonstration (développement et CI seulement), avec des données fixes
// et fictives : sa capture visuelle ne change pas d'un jour à l'autre (story H1).
const person = (n: number, firstName: string, lastName: string, householdId: string) => ({
  userId: `00000000-0000-7000-8000-00000000000${n}`,
  firstName,
  lastName,
  email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.org`,
  householdId,
});
const members = [
  person(1, "Camille", "Bernard", "h1"),
  person(2, "Louis", "Bernard", "h1"),
  person(3, "Léa", "Dubois", "h2"),
  person(4, "Nina", "Martin", "h3"),
];

const view: ComposerView = {
  amap: { name: "AMAP de démonstration", slug: "hommesdeterre", logoUrl: null },
  sender: "Pomme <ne-pas-repondre@example.org>",
  members,
  producers: [
    {
      id: "p1",
      name: "Ferme du Coteau",
      category: "Œufs et volailles",
      recipients: members.slice(2),
    },
  ],
  dateValues: {
    debutPeriodeCommande: "dimanche 15 novembre",
    finPeriodeCommande: "mercredi 25 novembre",
    debutDeclarationDisponibilites: "dimanche 22 novembre",
    finDeclarationDisponibilites: "dimanche 13 décembre",
  },
  history: [
    {
      id: "c1",
      sentAt: "2026-11-15T09:30:00.000Z",
      subject: "Les commandes sont ouvertes jusqu'au mercredi 25 novembre",
      audience: "all_members",
      producerName: null,
      recipientCount: 52,
      author: "Camille Bernard",
      automatic: false,
      failed: 0,
    },
    {
      id: "c2",
      sentAt: "2026-11-10T07:00:00.000Z",
      subject: "Rappel : vos disponibilités avant le dimanche 13 décembre",
      audience: "duty_no_answer",
      producerName: null,
      recipientCount: 14,
      author: "Camille Bernard",
      automatic: true,
      failed: 0,
    },
    {
      id: "c3",
      sentAt: "2026-11-03T18:12:00.000Z",
      subject: "Des nouvelles de Ferme du Coteau",
      audience: "producer_customers",
      producerName: "Ferme du Coteau",
      recipientCount: 15,
      author: "Louis Bernard",
      automatic: false,
      failed: 2,
    },
  ],
};

export default async function GroupEmailDemoPage() {
  await connection();
  if (!demoPagesEnabled()) notFound();
  const t = await getTranslations("Admin.emails");
  return (
    <AmapThemeBoundary slug="hommesdeterre">
      <DesktopShell title={view.amap.name} area="admin" amapSlug="hommesdeterre">
        <PageBanner title={t("title")}>{t("intro")}</PageBanner>
        <GroupEmail amapSlug="hommesdeterre" view={view} />
      </DesktopShell>
    </AmapThemeBoundary>
  );
}
