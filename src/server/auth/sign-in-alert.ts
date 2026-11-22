import { cookies, headers } from "next/headers";

import { getDatabase } from "@/db/client";
import { DEVICE_COOKIE, isDeviceId } from "@/domain/devices";

import { sendNotification } from "../email/notify";

import { getAuthInstance } from "./auth";
import { recordSignIn } from "./devices";

/**
 * Note l'appareil d'une connexion qui vient d'aboutir, et prévient la personne si l'appareil
 * est nouveau (story S10, ADR 0041). Appelée par les pages d'arrivée après un lien magique
 * (/connexion/bienvenue, avant même la deuxième vérification) et après une passkey
 * (/connexion/suite). Un échec ne bloque jamais la connexion : il est seulement signalé.
 */
export async function noteSignInDevice(user: { id: string; email: string; name: string }) {
  const deviceId = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!isDeviceId(deviceId)) return;
  const userAgent = (await headers()).get("user-agent");
  try {
    await recordSignIn(
      getDatabase(),
      {
        userId: user.id,
        email: user.email,
        firstName: user.name,
        deviceId,
        userAgent,
        baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
        secret: process.env.BETTER_AUTH_SECRET ?? "",
      },
      // Email de la plateforme (aucune AMAP) : tracé avec la connexion de Better Auth.
      (notification) => sendNotification(getAuthInstance().db, notification),
    );
  } catch (error) {
    console.error("Alerte de connexion : échec", error);
  }
}
