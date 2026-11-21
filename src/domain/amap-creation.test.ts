import { describe, expect, it } from "vitest";

import { checkNewAmap, isHexColor, type NewAmap } from "./amap-creation";

const valid: NewAmap = {
  name: "AMAP des Vergers",
  slug: "amap-des-vergers",
  colors: { primary: "#4f7a28", secondary: "#8c4a2f", tertiary: "#c9a227" },
  place: "Salle des fêtes, 1 place de la Mairie",
  weekday: 4,
  startTime: "18:00",
  endTime: "19:30",
  timezone: "Europe/Paris",
};

describe("checkNewAmap", () => {
  it("accepte une AMAP complète", () => {
    expect(checkNewAmap(valid)).toEqual([]);
  });

  it("refuse un nom ou un lieu vides ou trop longs", () => {
    expect(checkNewAmap({ ...valid, name: "  ", place: "" })).toEqual([
      { field: "name", problem: "required" },
      { field: "place", problem: "required" },
    ]);
    expect(checkNewAmap({ ...valid, name: "x".repeat(81), place: "y".repeat(201) })).toEqual([
      { field: "name", problem: "too_long" },
      { field: "place", problem: "too_long" },
    ]);
  });

  it("refuse une adresse réservée ou mal formée", () => {
    expect(checkNewAmap({ ...valid, slug: "admin" })).toEqual([
      { field: "slug", problem: "reserved" },
    ]);
    expect(checkNewAmap({ ...valid, slug: "Vergers" })).toEqual([
      { field: "slug", problem: "invalid_characters" },
    ]);
  });

  it("refuse une couleur qui n'est pas « #rrggbb »", () => {
    expect(
      checkNewAmap({
        ...valid,
        colors: { primary: "vert", secondary: "#abc", tertiary: "#c9a227" },
      }),
    ).toEqual([
      { field: "primary", problem: "color" },
      { field: "secondary", problem: "color" },
    ]);
  });

  it("contrôle le jour, les horaires et le fuseau", () => {
    expect(
      checkNewAmap({ ...valid, weekday: 8, startTime: "25:00", timezone: "Europe/Berlin" }),
    ).toEqual([
      { field: "weekday", problem: "weekday" },
      { field: "startTime", problem: "time" },
      { field: "timezone", problem: "timezone" },
    ]);
    expect(checkNewAmap({ ...valid, startTime: "19:30", endTime: "18:00" })).toEqual([
      { field: "endTime", problem: "end_before_start" },
    ]);
  });
});

describe("isHexColor", () => {
  it("n'accepte que « #rrggbb »", () => {
    expect(["#4f7a28", "#ABCDEF"].map(isHexColor)).toEqual([true, true]);
    expect(["4f7a28", "#abc", "#4f7a2g", ""].map(isHexColor)).toEqual([false, false, false, false]);
  });
});
