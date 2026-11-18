import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { defaultMembershipDays } from "@/domain/memberships";
import { parisDay } from "@/domain/order-periods";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getHousehold } from "@/server/households";
import { listMemberships, membershipStates } from "@/server/memberships";
import { HouseholdDetail } from "@/ui/admin/HouseholdDetail";
import { MembershipsSection } from "@/ui/admin/MembershipsSection";

type Props = { params: Promise<{ amap: string; id: string }> };

// [domaine]/<amap>/admin/foyers/<id> : fiche d'un foyer (membres, rôles, adhésions, archivage).
export default async function HouseholdPage({ params }: Props) {
  const { amap: slug, id } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const data = await withAmapContext(getDatabase(), ctx, async (tx, c) => {
    const found = await getHousehold(tx, c, id);
    if (!found) return null;
    const memberships = await listMemberships(tx, c, id);
    const states = await membershipStates(tx, c, [id]);
    return { found, memberships, state: states.get(id)! };
  });
  if (!data) notFound();
  const { found, memberships, state } = data;
  return (
    <HouseholdDetail
      amapSlug={slug}
      household={found}
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
    />
  );
}
