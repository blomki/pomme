import { redirect } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { landingPath } from "@/domain/spaces";
import { getSecondFactorState } from "@/server/auth/second-factor";
import { noteSignInDevice } from "@/server/auth/sign-in-alert";
import { getMyProfile } from "@/server/my-account";
import { listMySpaces } from "@/server/spaces";

// [domaine]/connexion/suite : aiguillage après la connexion. Un seul espace (référent d'une AMAP,
// par exemple) : on y va directement ; plusieurs : « Mon compte », qui les liste.
// Un espace d'administration demandera la deuxième vérification à l'arrivée.
export default async function AfterSignInPage() {
  const state = await getSecondFactorState();
  if (!state) redirect("/connexion");
  // Connexion par passkey : arrive directement ici. Appareil nouveau : alerte (S10).
  await noteSignInDevice(state.user);
  const [{ amapSpaces, isProducer }, profile] = await Promise.all([
    listMySpaces(state.user.id),
    withAmapContext(getDatabase(), { amapId: null, userId: state.user.id }, (tx, ctx) =>
      getMyProfile(tx, ctx),
    ),
  ]);
  // Mode choisi dans « Mon profil » (story A3) d'abord, s'il est toujours valable.
  redirect(
    landingPath(
      amapSpaces,
      { isPlatformAdmin: state.factors.isPlatformAdmin, isProducer },
      profile.preferredSpace,
    ),
  );
}
