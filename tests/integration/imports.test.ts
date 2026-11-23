import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  auditLog,
  dutyHistory,
  household,
  householdMember,
  membership,
  producer,
  product,
  user,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { ForbiddenError } from "@/server/auth/errors";
import { runImport } from "@/server/imports";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Reprise des données depuis AmapJ (story K1), avec la vraie base et la Row Level Security.
// Uniquement des données fictives (adresses @example.org).
const HOUSEHOLDS = [
  "Foyer;Prénom;Nom;Email;Téléphone;Contact principal;Début adhésion;Fin adhésion;Permanences faites",
  "Foyer Essai;Léa;Essai;lea.essai@example.org;06 12 34 56 78;;01/09/2026;31/08/2027;7",
  "Foyer Essai;Paul;Essai;paul.essai@example.org;;oui;01/09/2026;31/08/2027;2",
  ";Nina;Test;nina.test@example.org;;;;;",
  "Foyer Faux;Zoé;Faux;pas-un-email;;;;;",
  "Foyer Double;Léa;Double;LEA.ESSAI@example.org;;;;;",
].join("\n");

describe("Reprise des données (K1)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let elsewhere: { id: string; email: string };

  const ctxOf = (userId: string, amapId = amapA.id): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const run = (userId: string, kind: string, csv: string, write: boolean, amapId?: string) =>
    withAmapContext(db.app, ctxOf(userId, amapId), (tx, ctx) =>
      runImport(tx, ctx, { kind, csv }, write),
    );

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-k1");
    amapB = await f.createAmap("amap-k1-autre");
    admin = await f.createUser({ firstName: "Alix" });
    referent = await f.createUser({ firstName: "Robin" });
    elsewhere = await f.createUser({ firstName: "Déjà", email: "deja@example.org" });
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapB.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    // « Déjà » est déjà dans un foyer de l'AMAP A.
    const id = uuidv7();
    await db.owner.insert(household).values({ id, amapId: amapA.id, name: "Foyer Existant" });
    await db.owner
      .insert(householdMember)
      .values({ amapId: amapA.id, householdId: id, userId: elsewhere.id, isPrimary: true });
  });

  it("montre l'aperçu sans rien enregistrer, avec les lignes refusées et leurs raisons", async () => {
    const csv = `${HOUSEHOLDS}\nFoyer Autre;Déjà;Là;deja@example.org;;;;;`;
    const preview = await run(admin.id, "households", csv, false);
    expect(preview).toMatchObject({
      status: "ready",
      counts: { create: 3, update: 0, unchanged: 0, refused: 3 },
    });
    if (preview.status !== "ready") return;
    expect(preview.lines.map((l) => [l.line, l.status, l.problems.map((p) => p.code)])).toEqual([
      [2, "create", []],
      [3, "create", []],
      [4, "create", []],
      [5, "refused", ["email"]],
      [6, "refused", ["duplicate_in_file"]],
      [7, "refused", ["member_elsewhere"]],
    ]);
    const users = await db.owner.select().from(user).where(eq(user.email, "lea.essai@example.org"));
    expect(users).toEqual([]);
  });

  it("importe foyers, membres, adhésions et antériorité (accès autorisé)", async () => {
    const report = await run(admin.id, "households", HOUSEHOLDS, true);
    expect(report).toMatchObject({ counts: { create: 3, refused: 2 } });
    const homes = await db.owner
      .select({ id: household.id, name: household.name })
      .from(household)
      .where(eq(household.amapId, amapA.id));
    expect(homes.map((h) => h.name).sort()).toEqual([
      "Foyer Essai",
      "Foyer Existant",
      "Foyer Test",
    ]);
    const essai = homes.find((h) => h.name === "Foyer Essai")!;
    const members = await db.owner
      .select({ email: user.email, isPrimary: householdMember.isPrimary, phone: user.phone })
      .from(householdMember)
      .innerJoin(user, eq(user.id, householdMember.userId))
      .where(eq(householdMember.householdId, essai.id));
    // Paul est marqué « contact principal » dans le fichier.
    expect(members.sort((a, b) => a.email.localeCompare(b.email))).toEqual([
      { email: "lea.essai@example.org", isPrimary: false, phone: "+33612345678" },
      { email: "paul.essai@example.org", isPrimary: true, phone: null },
    ]);
    const periods = await db.owner
      .select()
      .from(membership)
      .where(eq(membership.householdId, essai.id));
    expect(periods.map((p) => [p.startDate, p.endDate])).toEqual([["2026-09-01", "2027-08-31"]]);
    const history = await db.owner
      .select({ n: dutyHistory.importedCount })
      .from(dutyHistory)
      .where(eq(dutyHistory.amapId, amapA.id));
    expect(history.map((h) => h.n).sort()).toEqual([2, 7]);
    const logs = await db.owner
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityType, "import"));
    expect(logs).toEqual([{ action: "import_households" }]);
  });

  it("ne crée aucun doublon au deuxième import ; complète seulement ce qui change", async () => {
    const again = await run(admin.id, "households", HOUSEHOLDS, true);
    expect(again).toMatchObject({ counts: { create: 0, update: 0, unchanged: 3, refused: 2 } });
    const changed = HOUSEHOLDS.replace("31/08/2027;7", "31/08/2027;9");
    expect(await run(admin.id, "households", changed, false)).toMatchObject({
      counts: { create: 0, update: 1, unchanged: 2 },
    });
  });

  it("importe producteurs puis produits ; refuse un produit d'un producteur inconnu", async () => {
    const producers =
      "Producteur;Catégorie;Email;Ordre des chèques\nFerme Essai;Légumes;ferme@example.org;GAEC Essai\nRuche Test;;;";
    expect(await run(admin.id, "producers", producers, true)).toMatchObject({
      counts: { create: 2, refused: 0 },
    });
    expect(await run(admin.id, "producers", producers, true)).toMatchObject({
      counts: { create: 0, unchanged: 2 },
    });
    const links = await db.owner
      .select({ name: producer.name, payee: amapProducer.checkPayee })
      .from(amapProducer)
      .innerJoin(producer, eq(producer.id, amapProducer.producerId))
      .where(eq(amapProducer.amapId, amapA.id));
    expect(links.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "Ferme Essai", payee: "GAEC Essai" },
      { name: "Ruche Test", payee: "Ruche Test" },
    ]);

    const products =
      "Producteur;Produit\nferme essai;Carottes\nFerme Essai;Poireaux\nInconnue;Miel";
    const report = await run(admin.id, "products", products, true);
    expect(report).toMatchObject({ counts: { create: 2, refused: 1 } });
    if (report.status === "ready") {
      expect(report.lines[2]?.problems).toEqual([
        { code: "producer_unknown", producer: "Inconnue" },
      ]);
    }
    expect(await run(admin.id, "products", products, true)).toMatchObject({
      counts: { create: 0, unchanged: 2, refused: 1 },
    });
    expect((await db.owner.select().from(product)).map((p) => p.name).sort()).toEqual([
      "Carottes",
      "Poireaux",
    ]);
  });

  it("signale les colonnes obligatoires absentes et un fichier vide", async () => {
    expect(await run(admin.id, "products", "Produit\nMiel", false)).toEqual({
      status: "missing_columns",
      missing: ["Producteur"],
    });
    expect(await run(admin.id, "products", "Producteur;Produit\n", false)).toEqual({
      status: "empty",
    });
    expect(await run(admin.id, "autre", "a;b\n1;2", false)).toEqual({ status: "invalid" });
  });

  it("refuse un non-admin (accès refusé)", async () => {
    await expect(run(referent.id, "producers", "Producteur\nX", false)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("n'importe que dans l'AMAP courante : rien de A n'est visible ni réutilisé dans B", async () => {
    const report = await run(
      admin.id,
      "products",
      "Producteur;Produit\nFerme Essai;Carottes",
      false,
      amapB.id,
    );
    expect(report).toMatchObject({ counts: { refused: 1 } });
    const inB = await run(admin.id, "producers", "Producteur\nFerme Essai", true, amapB.id);
    // Un producteur du même nom dans une autre AMAP n'est pas rattaché : nouvelle fiche.
    expect(inB).toMatchObject({ counts: { create: 1 } });
  });
});
