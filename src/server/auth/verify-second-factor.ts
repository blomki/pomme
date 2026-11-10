import { z } from "zod";

import { normalizeBackupCode, normalizeTotpCode } from "@/domain/second-factor";

import type { RateLimiter } from "../rate-limit";

export type VerifySecondFactorState = {
  status: "idle" | "invalid_format" | "wrong_code" | "rate_limited" | "verified";
};

export const verifyInputSchema = z.object({
  method: z.enum(["totp", "backup"]),
  code: z.string().max(40),
});

export type VerifySecondFactorDeps = {
  /** Limite par compte : un code à 6 chiffres ne doit pas pouvoir être deviné par essais. */
  limiter: RateLimiter;
  userId: string;
  /** Vérifie le code avec Better Auth ; vrai s'il est juste. */
  verifyTotp: (code: string) => Promise<boolean>;
  verifyBackupCode: (code: string) => Promise<boolean>;
  /** Note la deuxième vérification sur la session. */
  markVerified: () => Promise<void>;
};

/**
 * Deuxième vérification par code (application d'authentification ou code de secours), sur une
 * session déjà ouverte par lien magique. Sans dépendre de Next.js, pour pouvoir la tester.
 *
 * Better Auth ne limite pas les essais quand une session existe : on le fait ici, par compte.
 */
export async function verifySecondFactor(
  input: { method: unknown; code: unknown },
  deps: VerifySecondFactorDeps,
): Promise<VerifySecondFactorState> {
  const parsed = verifyInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid_format" };
  const { method } = parsed.data;
  const code =
    method === "totp" ? normalizeTotpCode(parsed.data.code) : normalizeBackupCode(parsed.data.code);
  if (!code) return { status: "invalid_format" };
  if (!deps.limiter.consume(deps.userId)) return { status: "rate_limited" };

  const valid = method === "totp" ? await deps.verifyTotp(code) : await deps.verifyBackupCode(code);
  if (!valid) return { status: "wrong_code" };
  await deps.markVerified();
  return { status: "verified" };
}
