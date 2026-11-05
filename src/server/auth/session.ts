import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "./auth";

/** Session de la requête en cours (ou null si personne n'est connecté). */
export async function getCurrentSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

/** Session obligatoire : sinon, renvoi vers la page de connexion. */
export async function requireSession() {
  const current = await getCurrentSession();
  if (!current) redirect("/connexion");
  return current;
}
