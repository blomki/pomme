import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { amap, household, householdMember, producer, producerUser } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { listMySpaces } from "@/server/spaces";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Espaces d'un compte toutes AMAP confondues (fonction list_my_spaces), avec le rôle de
// l'application : chacun ne voit que les siens.
describe("listMySpaces", () => {
  let db: TestDatabase;
  let camille: { id: string };
  let dominique: { id: string };
  let amapB: { id: string };

  const addToHousehold = async (amapId: string, userId: string) => {
    const householdId = uuidv7();
    await db.owner.insert(household).values({ id: householdId, amapId, name: "Foyer test" });
    await db.owner
      .insert(householdMember)
      .values({ id: uuidv7(), amapId, householdId, userId, isPrimary: true });
    return householdId;
  };

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    const amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    camille = await f.createUser();
    dominique = await f.createUser();
    await f.grantRole(amapA.id, camille.id, "referent");
    await f.grantRole(amapB.id, camille.id, "admin");
    await addToHousehold(amapA.id, camille.id);
    await f.grantRole(amapA.id, dominique.id, "admin");
  });

  afterAll(async () => {
    await db?.stop();
  });

  it("liste les rôles et le foyer du compte, dans toutes ses AMAP", async () => {
    const { amapSpaces: spaces } = await listMySpaces(camille.id, db.app);
    expect(spaces.map((s) => `${s.amapSlug}/${s.kind}`)).toEqual([
      "amap-a/referent",
      "amap-a/famille",
      "amap-b/admin",
    ]);
  });

  it("ne montre jamais les espaces d'un autre compte", async () => {
    const { amapSpaces: spaces } = await listMySpaces(dominique.id, db.app);
    expect(spaces.map((s) => `${s.amapSlug}/${s.kind}`)).toEqual(["amap-a/admin"]);
  });

  it("indique un compte lié à un producteur", async () => {
    expect((await listMySpaces(dominique.id, db.app)).isProducer).toBe(false);
    const producerId = uuidv7();
    await db.owner.insert(producer).values({ id: producerId, name: "Ferme test" });
    await db.owner.insert(producerUser).values({ id: uuidv7(), producerId, userId: dominique.id });
    expect((await listMySpaces(dominique.id, db.app)).isProducer).toBe(true);
    expect((await listMySpaces(camille.id, db.app)).isProducer).toBe(false);
  });

  it("ignore une AMAP archivée", async () => {
    await db.owner.update(amap).set({ archivedAt: new Date() }).where(eq(amap.id, amapB.id));
    const { amapSpaces: spaces } = await listMySpaces(camille.id, db.app);
    expect(spaces.some((s) => s.amapSlug === "amap-b")).toBe(false);
  });
});
