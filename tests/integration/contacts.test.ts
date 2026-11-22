import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  household,
  householdMember,
  producer,
  referentAssignment,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { ForbiddenError } from "@/server/auth/errors";
import { getProducerContacts } from "@/server/contacts";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Contacts d'un producteur pour les familles (story H4), avec la vraie base et la RLS.
describe("Appeler ou écrire sur Signal (H4)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let family: { id: string };
  let outsider: { id: string };
  let farm: string;

  const as = (userId: string): AmapContext => ({ amapId: amapA.id, userId });
  const contacts = (userId: string, amapProducerId = farm) =>
    withAmapContext(db.app, as(userId), (tx, c) => getProducerContacts(tx, c, amapProducerId));

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    family = await f.createUser();
    outsider = await f.createUser();
    const withPhone = await f.createUser({
      firstName: "Camille",
      lastName: "Référente",
      phone: "+33612345678",
    });
    const withoutPhone = await f.createUser({ firstName: "Dominique", lastName: "Sans" });
    await f.grantRole(amapA.id, withPhone.id, "referent");
    await f.grantRole(amapA.id, withoutPhone.id, "referent");
    await f.grantRole(amapA.id, outsider.id, "referent");
    const home = uuidv7();
    await db.owner.insert(household).values({ id: home, amapId: amapA.id, name: "Foyer Essai" });
    await db.owner
      .insert(householdMember)
      .values({ amapId: amapA.id, householdId: home, userId: family.id, isPrimary: true });
    const producerId = uuidv7();
    await db.owner
      .insert(producer)
      .values({ id: producerId, name: "Ferme d'essai", phone: "+33231000000" });
    farm = uuidv7();
    await db.owner.insert(amapProducer).values({ id: farm, amapId: amapA.id, producerId });
    await db.owner.insert(referentAssignment).values([
      { amapId: amapA.id, amapProducerId: farm, userId: withPhone.id },
      { amapId: amapA.id, amapProducerId: farm, userId: withoutPhone.id },
    ]);
  });

  it("donne les liens des numéros renseignés, rien pour les autres (accès autorisé)", async () => {
    expect(await contacts(family.id)).toEqual([
      {
        name: "Ferme d'essai",
        role: "producer",
        links: { tel: "tel:+33231000000", signal: "https://signal.me/#p/+33231000000" },
      },
      {
        name: "Camille Référente",
        role: "referent",
        links: { tel: "tel:+33612345678", signal: "https://signal.me/#p/+33612345678" },
      },
      { name: "Dominique Sans", role: "referent", links: null },
    ]);
    expect(await contacts(family.id, "pas-un-id")).toEqual([]);
  });

  it("refuse une personne sans foyer dans l'AMAP (accès refusé)", async () => {
    await expect(contacts(outsider.id)).rejects.toThrow(ForbiddenError);
  });
});
