import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amapProducer, producer, referentAssignment, user } from "@/db/schema";
import { contactLinks } from "@/domain/phone";

import { ForbiddenError } from "./auth/errors";
import { myHousehold } from "./orders";

// Contacts d'un producteur pour les familles (story H4, ADR 0040) : le producteur et ses
// référents, avec « Appeler » et « Écrire sur Signal » quand leur numéro est au format
// international. Réservé aux membres d'un foyer de l'AMAP.

export type Contact = {
  name: string;
  role: "producer" | "referent";
  links: { tel: string; signal: string } | null;
};

export async function getProducerContacts(
  tx: Transaction,
  ctx: AmapContext,
  amapProducerId: string,
): Promise<Contact[]> {
  if (!(await myHousehold(tx, ctx))) throw new ForbiddenError();
  if (!z.uuid().safeParse(amapProducerId).success) return [];
  const [target] = await tx
    .select({ name: producer.name, phone: producer.phone })
    .from(amapProducer)
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(eq(amapProducer.id, amapProducerId));
  if (!target) return [];
  const referents = await tx
    .select({ firstName: user.firstName, lastName: user.lastName, phone: user.phone })
    .from(referentAssignment)
    .innerJoin(user, eq(user.id, referentAssignment.userId))
    .where(and(eq(referentAssignment.amapProducerId, amapProducerId)))
    .orderBy(asc(user.firstName));
  return [
    { name: target.name, role: "producer" as const, links: contactLinks(target.phone) },
    ...referents.map((r) => ({
      name: `${r.firstName} ${r.lastName}`.trim(),
      role: "referent" as const,
      links: contactLinks(r.phone),
    })),
  ];
}
