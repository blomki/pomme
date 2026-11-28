import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { defaultMembershipDays } from "@/domain/memberships";
import { parisDay } from "@/domain/order-periods";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getHousehold } from "@/server/households";
import { listRoleProducers } from "@/server/member-roles";
import { listMemberships, membershipStates } from "@/server/memberships";
import { getHouseholdOrderOverview } from "@/server/order-corrections";
import { HouseholdDetail } from "@/ui/admin/HouseholdDetail";
import { HouseholdOrderSection } from "@/ui/admin/HouseholdOrderSection";
import { MembershipsSection } from "@/ui/admin/MembershipsSection";

type Props = { params: Promise<{ amap: string; id: string }> };

// [domaine]/<amap>/admin/foyers/<id> : fiche d'un foyer (membres, rôles, adhésions, commande du
// mois, archivage).
export default async function HouseholdPage({ params }: Props) {
  const { amap: slug, id } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const data = await withAmapContext(getDatabase(), ctx, async (tx, c) => {
    const found = await getHousehold(tx, c, id);
    if (!found) return null;
    const memberships = await listMemberships(tx, c, id);
    const states = await membershipStates(tx, c, [id]);
    // Commande du mois, à corriger au besoin (story D7) : pas pour un foyer archivé.
    const orders = found.archivedAt ? null : await getHouseholdOrderOverview(tx, c, id);
    // Fenêtre « Rôles » : une case « Référent » par producteur actif (fiche #138).
    const roleProducers = await listRoleProducers(tx, c);
    return { found, memberships, state: states.get(id)!, orders, roleProducers };
  });
  if (!data) notFound();
  const { found, memberships, state, orders, roleProducers } = data;
  return (
    <HouseholdDetail
      amapSlug={slug}
      household={found}
      roleProducers={roleProducers}
      memberships={
        // Un foyer anonymisé n'a plus rien à montrer ; archivé, ses adhésions restent lisibles.
        found.anonymizedAt ? null : (
          <MembershipsSection
            amapSlug={slug}
            householdId={id}
            memberships={memberships}
            state={state}
            proposal={defaultMembershipDays(memberships, parisDay(new Date()))}
            readOnly={found.archivedAt !== null}
          />
        )
      }
      orders={
        orders && <HouseholdOrderSection amapSlug={slug} householdId={id} overview={orders} />
      }
    />
  );
}
