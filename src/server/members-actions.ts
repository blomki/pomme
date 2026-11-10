"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { session } from "@/db/schema";

import { getAuthInstance } from "./auth/auth";
import { ForbiddenError, SecondFactorRequiredError, UnauthenticatedError } from "./auth/errors";
import { verificationUrl } from "./auth/second-factor";
import { getAmapContext } from "./context";
import { correctMemberEmail, type CorrectEmailResult } from "./members";

export type CorrectEmailState = { status: "idle" } | CorrectEmailResult;

/**
 * « Corriger l'email » (Administration › Membres). Après la correction, la personne est
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
      redirect(verificationUrl(`/${slug}/admin/membres`));
    if (error instanceof ForbiddenError) return { status: "forbidden" };
    throw error;
  }
  if (result.status === "corrected") {
    // Sessions dans les tables de connexion : seul le rôle pomme_auth y a accès.
    await getAuthInstance().db.delete(session).where(eq(session.userId, result.userId));
    revalidatePath(`/${slug}/admin/membres`);
  }
  return result;
}
