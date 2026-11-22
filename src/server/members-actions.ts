"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { session } from "@/db/schema";

import { getAuthInstance } from "./auth/auth";
import { clearSecondFactor } from "./auth/devices";
import { ForbiddenError, SecondFactorRequiredError, UnauthenticatedError } from "./auth/errors";
import { verificationUrl } from "./auth/second-factor";
import { getAmapContext } from "./context";
import { correctMemberEmail, type CorrectEmailResult } from "./members";
import { resetMemberSecondFactor, type ResetSecondFactorResult } from "./second-factor-reset";

export type CorrectEmailState = { status: "idle" } | CorrectEmailResult;

/**
 * « Corriger l'email » (Administration › Foyers et adhésions, fiche d'un foyer). Après la correction, la personne est
 * déconnectée de tous ses appareils : elle se reconnectera avec la nouvelle adresse.
 */
export async function correctMemberEmailAction(
  _previous: CorrectEmailState,
  formData: FormData,
): Promise<CorrectEmailState> {
  const slug = String(formData.get("amap") ?? "");
  const ctx = await getAmapContext(slug);
  let result: CorrectEmailResult;
  try {
    result = await withAmapContext(getDatabase(), ctx, (tx, c) =>
      correctMemberEmail(tx, c, { userId: formData.get("userId"), email: formData.get("email") }),
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/connexion");
    if (error instanceof SecondFactorRequiredError)
      redirect(verificationUrl(`/${slug}/admin/foyers`));
    if (error instanceof ForbiddenError) return { status: "forbidden" };
    throw error;
  }
  if (result.status === "corrected") {
    // Sessions dans les tables de connexion : seul le rôle pomme_auth y a accès.
    await getAuthInstance().db.delete(session).where(eq(session.userId, result.userId));
    // Liste et fiches des foyers : l'adresse y est affichée.
    revalidatePath(`/${slug}/admin/foyers`, "layout");
  }
  return result;
}

export type ResetSecondFactorState = { status: "idle" } | ResetSecondFactorResult;

/**
 * « Réinitialiser la deuxième vérification » (fiche d'un foyer, story S10) : la personne a
 * perdu son téléphone ou sa passkey. Elle est déconnectée partout ; journalisé.
 */
export async function resetSecondFactorAction(input: {
  amap: string;
  userId: string;
}): Promise<ResetSecondFactorState> {
  const ctx = await getAmapContext(input.amap);
  try {
    return await withAmapContext(getDatabase(), ctx, (tx, c) =>
      resetMemberSecondFactor(tx, c, { userId: input.userId }, (userId) =>
        clearSecondFactor(getAuthInstance().db, userId),
      ),
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/connexion");
    if (error instanceof SecondFactorRequiredError)
      redirect(verificationUrl(`/${input.amap}/admin/foyers`));
    if (error instanceof ForbiddenError) return { status: "forbidden" };
    throw error;
  }
}
