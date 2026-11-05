import { describe, expect, it } from "vitest";

import { uuidv7, uuidv7Timestamp } from "./uuid";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  it("produit un UUID version 7 bien formé", () => {
    expect(uuidv7()).toMatch(UUID_V7);
  });

  it("contient l'heure de création", () => {
    const now = Date.UTC(2026, 10, 5, 9, 30);
    expect(uuidv7Timestamp(uuidv7({ now }))).toBe(now);
  });

  it("se trie dans l'ordre de création", () => {
    const first = uuidv7({ now: 1_000 });
    const second = uuidv7({ now: 2_000 });
    expect([second, first].sort()).toEqual([first, second]);
  });

  it("donne deux identifiants différents à la même milliseconde", () => {
    expect(uuidv7({ now: 1_000 })).not.toBe(uuidv7({ now: 1_000 }));
  });

  it("est reproductible avec une source d'aléa fixe", () => {
    const zeros = (size: number) => new Uint8Array(size);
    expect(uuidv7({ now: 0, randomBytes: zeros })).toBe("00000000-0000-7000-8000-000000000000");
  });
});
