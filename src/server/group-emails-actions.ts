"use server";

import { revalidatePath } from "next/cache";
import { createTranslator } from "next-intl";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import messages from "@/i18n/messages/fr.json";

import { runAmapAction } from "./amap-action";
import { getAmapBySlug } from "./amap";
import { sendCampaign } from "./email/campaigns";
import { sendNotification } from "./email/notify";
import {
  groupEmailContent,
  prepareGroupEmail,
  recipientValues,
  type GroupEmailInput,
} from "./group-emails";
import { getMyProfile } from "./my-account";

// Actions de l'écran « Envoyer un email » (story H1, ADR 0046).

type Forbidden = { status: "forbidden" };
type Refused = { status: "invalid" | "no_subject" | "blocked" | "no_recipient" };

const emailsPath = (amap: string) => `/${amap}/admin/emails`;

/** Pied et lien communs aux emails groupés de l'AMAP. */
async function emailFrame(slug: string) {
  const amapRow = await getAmapBySlug(slug);
  const t = createTranslator({ locale: "fr", messages, namespace: "Admin.emails" });
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return {
    amap: { name: amapRow?.name ?? "", theme: amapRow?.theme ?? null },
    footer: t("footer", { amap: amapRow?.name ?? "" }),
    spaceLabel: t("spaceLink"),
    spaceUrl: new URL(`/${slug}/famille`, baseUrl).toString(),
  };
}

export type SendGroupEmailResult =
  { status: "sent"; recipientCount: number; sent: number; failed: number } | Refused | Forbidden;

/** « Envoyer à N destinataires » : un email personnel à chacun ; inscrit dans l'historique. */
export async function sendGroupEmailAction(
  amap: string,
  input: GroupEmailInput,
): Promise<SendGroupEmailResult> {
  const outcome = await runAmapAction(amap, emailsPath(amap), (tx, ctx) =>
    prepareGroupEmail(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  const { ctx, result: prepared } = outcome;
  if (prepared.status !== "ready") return prepared;
  const frame = await emailFrame(amap);
  const notifications = prepared.recipients.map((person) => ({
    amapId: ctx.amapId!,
    userId: person.userId,
    template: "group_email" as const,
    to: person.email,
    content: groupEmailContent({
      ...frame,
      subject: prepared.subject,
      body: prepared.body,
      values: recipientValues(prepared.values, person),
    }),
  }));
  const counts = await sendCampaign(
    getDatabase(),
    ctx,
    {
      audience: prepared.audience,
      producerId: prepared.producerId,
      subject: prepared.subject,
      body: prepared.body,
      sentBy: ctx.userId,
      automatic: false,
      householdCount: prepared.householdCount,
    },
    notifications,
  );
  revalidatePath(emailsPath(amap));
  return {
    status: "sent",
    recipientCount: notifications.length,
    sent: counts.sent,
    failed: counts.failed,
  };
}

export type TestEmailResult =
  { status: "sent"; to: string } | { status: "failed" } | Refused | Forbidden;

/**
 * « M'envoyer un test » : l'email tel que le recevra la personne choisie dans « Vu par »,
 * envoyé à l'adresse de l'administrateur. Pas inscrit dans l'historique.
 */
export async function sendTestEmailAction(
  amap: string,
  input: GroupEmailInput,
  viewerId: string | null,
): Promise<TestEmailResult> {
  const outcome = await runAmapAction(amap, emailsPath(amap), async (tx, ctx) => ({
    prepared: await prepareGroupEmail(tx, ctx, input),
    me: await getMyProfile(tx, ctx),
  }));
  if ("status" in outcome) return outcome;
  const { ctx, result } = outcome;
  const { prepared, me } = result;
  if (prepared.status !== "ready") return prepared;
  const person = prepared.recipients.find((r) => r.userId === viewerId) ?? prepared.recipients[0]!;
  const frame = await emailFrame(amap);
  const sent = await withAmapContext(getDatabase(), ctx, (tx) =>
    sendNotification(tx, {
      amapId: ctx.amapId,
      userId: ctx.userId,
      template: "group_email_test",
      to: me.email,
      content: groupEmailContent({
        ...frame,
        subject: `[Test] ${prepared.subject}`,
        body: prepared.body,
        values: recipientValues(prepared.values, person),
      }),
    }),
  );
  return sent.status === "sent" ? { status: "sent", to: me.email } : { status: "failed" };
}
