import { redirect } from "next/navigation";
import { cache } from "react";

import { secondFactorStatus } from "@/domain/second-factor";

import { getAuthInstance } from "./auth";
import { loadAccountFactors, toFacts } from "./second-factor-facts";
import { getCurrentSession } from "./session";

/**
 * Session en cours, avec l'état de sa deuxième vérification ; null si personne n'est connecté.
 * cache() : la mise en page et la page appellent cette fonction pour la même requête.
 */
export const getSecondFactorState = cache(async () => {
  const current = await getCurrentSession();
  if (!current) return null;
  const factors = await loadAccountFactors(getAuthInstance().db, current.user.id);
  const verifiedAt = current.session.secondFactorVerifiedAt ?? null;
  return {
    ...current,
    factors,
    verified: verifiedAt !== null,
    status: secondFactorStatus(toFacts(factors, verifiedAt)),
  };
});

/** Page de la deuxième vérification, avec retour vers la page demandée. */
export function verificationUrl(returnTo: string): string {
  return `/connexion/verification?retour=${encodeURIComponent(returnTo)}`;
}

/**
 * Espace réservé aux comptes soumis à la deuxième vérification : connexion obligatoire, puis
 * deuxième vérification si elle n'a pas encore été faite sur cette session.
 */
export async function requireVerifiedSession(returnTo: string) {
  const state = await getSecondFactorState();
  if (!state) redirect("/connexion");
  if (state.status === "challenge" || state.status === "enroll") {
    redirect(verificationUrl(returnTo));
  }
  return state;
}
