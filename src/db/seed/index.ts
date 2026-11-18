import { symmetricEncrypt } from "better-auth/crypto";
import { inArray } from "drizzle-orm";

import type { Database } from "../client";
import {
  amap,
  amapProducer,
  amapRole,
  catalog,
  catalogItem,
  catalogItemAvailability,
  auditLog,
  cheque,
  credit,
  distribution,
  household,
  householdMember,
  membership,
  notificationLog,
  order,
  orderLine,
  orderPeriod,
  producer,
  producerUser,
  product,
  referentAssignment,
  twoFactor,
  user,
} from "../schema";
import { uuidv7 } from "../uuid";

import { buildSeedData, DEMO_BACKUP_CODES, DEMO_TOTP_SECRET } from "./data";

/**
 * Refuse de charger le jeu de données ailleurs que sur un poste de développement :
 * le chargement commence par TOUT effacer.
 */
export function assertSeedAllowed(databaseUrl: string, env: Record<string, string | undefined>) {
  if (env.NODE_ENV === "production") {
    throw new Error("Chargement du jeu de données interdit en production.");
  }
  const host = new URL(databaseUrl).hostname;
  const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  if (!isLocal && env.SEED_ALLOW_REMOTE !== "1") {
    throw new Error(
      `Base distante (${host}) : chargement refusé. ` +
        "Mettre SEED_ALLOW_REMOTE=1 seulement pour une base jetable (prévisualisation).",
    );
  }
}

/**
 * Efface les données puis charge le jeu fictif, en une seule transaction (tout ou rien).
 * Se connecte avec le rôle propriétaire : la RLS ne s'applique pas, ce qui permet d'écrire
 * dans toutes les AMAP.
 *
 * `authSecret` (BETTER_AUTH_SECRET) : chiffre le secret de l'application d'authentification
 * des comptes de démonstration, comme le ferait Better Auth.
 */
export async function seedDatabase(db: Database, authSecret: string) {
  const data = buildSeedData();
  const secret = await symmetricEncrypt({ key: authSecret, data: DEMO_TOTP_SECRET });
  const backupCodes = await symmetricEncrypt({
    key: authSecret,
    data: JSON.stringify(DEMO_BACKUP_CODES),
  });
  await db.transaction(async (tx) => {
    // Ordre inverse des dépendances (clés étrangères). Effacer les comptes efface aussi leurs
    // sessions, passkeys et applications d'authentification (ON DELETE CASCADE).
    await tx.delete(auditLog);
    await tx.delete(notificationLog);
    await tx.delete(credit);
    await tx.delete(cheque);
    await tx.delete(orderLine);
    await tx.delete(order);
    await tx.delete(orderPeriod);
    await tx.delete(catalogItemAvailability);
    await tx.delete(catalogItem);
    await tx.delete(catalog);
    await tx.delete(product);
    await tx.delete(distribution);
    await tx.delete(producerUser);
    await tx.delete(referentAssignment);
    await tx.delete(amapProducer);
    await tx.delete(producer);
    await tx.delete(membership);
    await tx.delete(householdMember);
    await tx.delete(household);
    await tx.delete(amapRole);
    await tx.delete(amap);
    await tx.delete(user);

    await tx.insert(user).values(data.users);
    await tx.insert(amap).values(data.amaps);
    await tx.insert(amapRole).values(data.roles);
    await tx.insert(household).values(data.households);
    await tx.insert(householdMember).values(data.householdMembers);
    await tx.insert(producer).values(data.producers);
    await tx.insert(amapProducer).values(data.amapProducers);
    await tx.insert(referentAssignment).values(data.referentAssignments);
    await tx.insert(producerUser).values(data.producerUsers);
    await tx.insert(distribution).values(data.distributions);
    await tx.insert(product).values(data.products);
    await tx.insert(catalog).values(data.catalogs);
    await tx.insert(catalogItem).values(data.catalogItems);
    await tx.insert(catalogItemAvailability).values(data.availabilities);
    await tx.insert(orderPeriod).values(data.orderPeriods);
    await tx.insert(order).values(data.orders);
    await tx.insert(orderLine).values(data.orderLines);
    await tx.insert(cheque).values(data.cheques);
    await tx.insert(membership).values(data.memberships);
    if (data.totpUserIds.length > 0) {
      await tx
        .insert(twoFactor)
        .values(data.totpUserIds.map((userId) => ({ id: uuidv7(), userId, secret, backupCodes })));
      await tx
        .update(user)
        .set({ twoFactorEnabled: true })
        .where(inArray(user.id, data.totpUserIds));
    }
  });
  return {
    amaps: data.amaps.length,
    users: data.users.length,
    roles: data.roles.length,
    households: data.households.length,
    producers: data.producers.length,
  };
}
