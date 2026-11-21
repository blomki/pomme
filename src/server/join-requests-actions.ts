"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import type { JoinRequestProblem } from "@/domain/join-requests";

import { runAmapAction } from "./amap-action";
import { getAmapBySlug } from "./amap";
import { clientIp } from "./auth/client-ip";
import { CAPTCHA_FIELD, captchaConfig, verifyCaptcha } from "./captcha";
import { sendInvitations } from "./invitations";
import {
  acceptJoinRequest,
  decideJoinRequest,
  submitJoinRequest,
  type AcceptJoinRequestResult,
  type DecideJoinRequestResult,
} from "./join-requests";
import { createRateLimiter } from "./rate-limit";
import { RATE_LIMIT_FACTOR } from "./rate-limit-factor";

// Actions des demandes d'adhésion (story B2). Le formulaire public est ouvert à tous : captcha,
// puis limites de débit (par adresse IP et par adresse email), avant toute écriture. Les
// actions de l'admin vérifient le rôle (join-requests.ts).

// En production : 5 demandes par heure et par adresse IP, 3 par jour et par adresse email.
const ipLimiter = createRateLimiter({ limit: 5 * RATE_LIMIT_FACTOR, windowMs: 60 * 60 * 1000 });
const emailLimiter = createRateLimiter({
  limit: 3 * RATE_LIMIT_FACTOR,
  windowMs: 24 * 60 * 60 * 1000,
});

export type JoinFormState =
  | { status: "idle" | "sent" | "captcha" | "rate_limited" | "unknown_amap" }
  | { status: "invalid"; problems: JoinRequestProblem[] };

/** Formulaire « Nous rejoindre » du site public d'une AMAP. */
export async function submitJoinRequestAction(
  amapSlug: string,
  _previous: JoinFormState,
  form: FormData,
): Promise<JoinFormState> {
  const amap = await getAmapBySlug(amapSlug);
  if (!amap) return { status: "unknown_amap" };
  const input = {
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    phone: String(form.get("phone") ?? ""),
    message: String(form.get("message") ?? ""),
  };
  // Captcha d'abord : un robot ne doit pas pouvoir épuiser le quota d'une vraie personne.
  if ((await verifyCaptcha(form.get(CAPTCHA_FIELD), captchaConfig())) !== "passed") {
    return { status: "captcha" };
  }
  const ip = clientIp(await headers());
  if (!ipLimiter.consume(ip) || !emailLimiter.consume(input.email.trim().toLowerCase())) {
    return { status: "rate_limited" };
  }
  return withAmapContext(getDatabase(), { amapId: amap.id, userId: null }, (tx, ctx) =>
    submitJoinRequest(tx, ctx, input),
  );
}

type Forbidden = { status: "forbidden" };
const requestsPath = (amap: string) => `/${amap}/admin/foyers?onglet=demandes`;

/** Marque une demande comme contactée, ou la refuse. */
export async function decideJoinRequestAction(
  amap: string,
  input: { requestId: string; decision: "contacted" | "declined" },
): Promise<DecideJoinRequestResult | Forbidden> {
  const outcome = await runAmapAction(amap, requestsPath(amap), (tx, ctx) =>
    decideJoinRequest(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(`/${amap}/admin/foyers`);
  return outcome.result;
}

/** Accepte une demande : crée le foyer et l'adhésion, puis envoie l'invitation. */
export async function acceptJoinRequestAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<(AcceptJoinRequestResult & { failedInvitations?: number }) | Forbidden> {
  const outcome = await runAmapAction(amap, requestsPath(amap), (tx, ctx) =>
    acceptJoinRequest(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  const result = outcome.result;
  if (result.status !== "accepted") return result;
  // Transaction validée : l'invitation peut partir.
  const failedInvitations = await sendInvitations(amap, outcome.ctx, result.invitations);
  revalidatePath(`/${amap}/admin/foyers`);
  return { ...result, failedInvitations };
}
