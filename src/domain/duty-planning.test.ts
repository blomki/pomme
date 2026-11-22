import { describe, expect, it } from "vitest";

import {
  changedPeople,
  checkRow,
  generatePlanning,
  isExperienced,
  loadSpread,
  type PlanningPerson,
} from "./duty-planning";

const person = (
  userId: string,
  experience: number,
  unavailable: string[] = [],
): PlanningPerson => ({ userId, name: userId, experience, unavailable });

describe("generatePlanning", () => {
  const weeks = ["s1", "s2", "s3", "s4"];

  it("place 3 bénévoles par distribution, chacun une fois au plus par distribution", () => {
    const people = ["a", "b", "c", "d", "e", "f"].map((id) => person(id, 10));
    const plan = generatePlanning({
      distributions: weeks,
      people,
      perDistribution: 3,
      threshold: 6,
    });
    for (const w of weeks) {
      const ids = plan.filter((a) => a.distributionId === w).map((a) => a.userId);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      expect(plan.filter((a) => a.distributionId === w).map((a) => a.position)).toEqual([0, 1, 2]);
    }
  });

  it("répartit équitablement : 12 places pour 6 personnes = 2 chacune", () => {
    const people = ["a", "b", "c", "d", "e", "f"].map((id) => person(id, 10));
    const plan = generatePlanning({
      distributions: weeks,
      people,
      perDistribution: 3,
      threshold: 6,
    });
    const counts = people.map((p) => plan.filter((a) => a.userId === p.userId).length);
    expect(counts).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it("accompagne toujours un nouveau d'un expérimenté", () => {
    // Un seul expérimenté, cinq nouveaux.
    const people = [
      person("vieux", 8),
      ...["n1", "n2", "n3", "n4", "n5"].map((id) => person(id, 0)),
    ];
    const plan = generatePlanning({
      distributions: weeks,
      people,
      perDistribution: 3,
      threshold: 6,
    });
    for (const w of weeks) {
      const ids = plan.filter((a) => a.distributionId === w).map((a) => a.userId);
      expect(ids).toContain("vieux");
    }
  });

  it("garde les expérimentés pour les semaines où ils manquent (2 expérimentés, 4 semaines)", () => {
    const people = [
      person("alix", 10),
      person("bea", 7),
      person("cyril", 0),
      person("dina", 0, ["s1"]),
      person("eli", 0),
      person("fanny", 0),
    ];
    const plan = generatePlanning({
      distributions: weeks,
      people,
      perDistribution: 3,
      threshold: 6,
    });
    expect(people.map((p) => plan.filter((a) => a.userId === p.userId).length)).toEqual([
      2, 2, 2, 2, 2, 2,
    ]);
    for (const w of weeks) {
      const ids = plan.filter((a) => a.distributionId === w).map((a) => a.userId);
      expect(ids.some((id) => id === "alix" || id === "bea")).toBe(true);
    }
  });

  it("respecte les indisponibilités", () => {
    const people = [
      person("a", 10, ["s1", "s2"]),
      person("b", 10),
      person("c", 10),
      person("d", 10),
    ];
    const plan = generatePlanning({
      distributions: weeks,
      people,
      perDistribution: 3,
      threshold: 6,
    });
    expect(plan.some((x) => x.userId === "a" && ["s1", "s2"].includes(x.distributionId))).toBe(
      false,
    );
    // a rattrape ensuite : il est choisi en s3 et s4.
    expect(plan.filter((x) => x.userId === "a").map((x) => x.distributionId)).toEqual(["s3", "s4"]);
  });

  it("tient compte des permanences déjà fixées et laisse des places vides faute de monde", () => {
    const people = [person("a", 10), person("b", 10)];
    const plan = generatePlanning({
      distributions: ["s1"],
      people,
      perDistribution: 3,
      threshold: 6,
      initialLoad: new Map([["a", 3]]),
    });
    expect(plan.map((x) => x.userId)).toEqual(["b", "a"]);
  });
});

describe("checkRow", () => {
  const people = new Map(
    [
      person("vieux", 8),
      person("nouveau", 1),
      person("nouvelle", 0),
      person("absent", 9, ["d1"]),
    ].map((p) => [p.userId, p]),
  );
  const check = (userIds: Array<string | null>) =>
    checkRow({ distributionId: "d1", userIds, people, perDistribution: 3, threshold: 6 });

  it("signale, du plus grave au moins grave, les problèmes d'une ligne", () => {
    expect(check(["absent", "vieux", "vieux"])).toEqual({ kind: "unavailable", userId: "absent" });
    expect(check(["vieux", "vieux", "nouveau"])).toEqual({ kind: "duplicate", userId: "vieux" });
    expect(check(["nouveau", null, null])).toEqual({ kind: "no_experienced" });
    expect(check(["vieux", null, null])).toEqual({ kind: "missing", count: 2 });
  });

  it("valide une ligne complète, avec ou sans nouveau", () => {
    expect(check(["vieux", "nouveau", "nouvelle"])).toEqual({ kind: "accompanied" });
    expect(isExperienced(6, 6)).toBe(true);
    expect(isExperienced(5, 6)).toBe(false);
  });
});

describe("loadSpread", () => {
  it("classe chacun par rapport à la moyenne arrondie", () => {
    const spread = loadSpread(
      new Map([
        ["a", 1],
        ["b", 2],
        ["c", 3],
        ["d", 5],
      ]),
    );
    expect(spread.average).toBe(2.75);
    expect([spread.min, spread.max]).toEqual([1, 5]);
    expect(["a", "b", "c", "d"].map(spread.level)).toEqual(["under", "even", "even", "over"]);
  });
});

describe("changedPeople", () => {
  it("donne les personnes retirées ou ajoutées, pas celles qui changent seulement de place", () => {
    const before = [
      { distributionId: "d1", position: 0, userId: "a" },
      { distributionId: "d1", position: 1, userId: "b" },
    ];
    const after = [
      { distributionId: "d1", position: 0, userId: "b" },
      { distributionId: "d1", position: 1, userId: "c" },
    ];
    expect(changedPeople(before, after).sort()).toEqual(["a", "c"]);
  });
});
