import { redirect } from "next/navigation";

import { landingPath } from "@/domain/spaces";
import { getSecondFactorState } from "@/server/auth/second-factor";
import { noteSignInDevice } from "@/server/auth/sign-in-alert";
import { listMySpaces } from "@/server/spaces";

// [domaine]/connexion/suite : aiguillage après la connexion. Un seul espace (référent d'une AMAP,
// par exemple) : on y va directement ; plusieurs : « Mon compte », qui les liste.
// Un espace d'administration demandera la deuxième vérification à l'arrivée.
export default async function AfterSignInPage() {
  const state = await getSecondFactorState();
  if (!state) redirect("/connexion");
  // Connexion par passkey : arrive directement ici. Appareil nouveau : alerte (S10).
  await noteSignInDevice(state.user);
  const { amapSpaces, isProducer } = await listMySpaces(state.user.id);
  redirect(landingPath(amapSpaces, { isPlatformAdmin: state.factors.isPlatformAdmin, isProducer }));
}
