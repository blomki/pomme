import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amapProducer, producer, referentAssignment } from "@/db/schema";
import { referentOrAdminAccess } from "@/domain/roles";

import { ForbiddenError, SecondFactorRequiredError } from "./errors";
import { requireRole } from "./require-role";

/**
 * Accès réservé au référent qui suit ce producteur, ou à un admin de l'AMAP (deuxième
 * vérification exigée quand seul son rôle d'admin lui donne accès). Sert à corriger une commande
 * (D7), changer la photo du producteur (S11), pointer ses chèques (F1). Renvoie le producteur.
 *
 * @throws ForbiddenError ou SecondFactorRequiredError
 */
export async function requireReferentOrAdmin(
  tx: Transaction,
  ctx: AmapContext,
  amapProducerId: string,
): Promise<{ amapProducerId: string; producerId: string; producerName: string }> {
  const roles = await requireRole(tx, ctx, ["referent", "admin"]);
  if (!z.uuid().safeParse(amapProducerId).success) throw new ForbiddenError();
  const [target] = await tx
    .select({ producerId: amapProducer.producerId, producerName: producer.name })
    .from(amapProducer)
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(eq(amapProducer.id, amapProducerId));
  if (!target) throw new ForbiddenError();

  const [follows] = roles.includes("referent")
    ? await tx
        .select({ id: referentAssignment.id })
        .from(referentAssignment)
        .where(
          and(
            eq(referentAssignment.amapProducerId, amapProducerId),
            eq(referentAssignment.userId, ctx.userId!),
          ),
        )
    : [];
  const access = referentOrAdminAccess({
    roles,
    followsProducer: Boolean(follows),
    secondFactorVerified: Boolean(ctx.secondFactorVerified),
  });
  if (access === "second_factor") throw new SecondFactorRequiredError();
  if (access === "forbidden") throw new ForbiddenError();
  return { amapProducerId, ...target };
}
