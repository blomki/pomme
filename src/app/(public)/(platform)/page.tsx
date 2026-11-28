import { redirect } from "next/navigation";

import { getCurrentSession } from "@/server/auth/session";
import { PlatformHome } from "@/ui/home/PlatformHome";

// Accueil de la plateforme ([domaine]/). Les AMAP ont leur propre page : [domaine]/<adresse-de-l-amap>.
// Personne connectée (fiche #128) : /connexion/suite choisit son accueil (mode mémorisé, espace
// unique ou « Mon compte ») et passe par la deuxième vérification si elle reste à faire.
export default async function HomePage() {
  if (await getCurrentSession()) redirect("/connexion/suite");
  return <PlatformHome />;
}
