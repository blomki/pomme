import { describe, expect, it } from "vitest";

import { amapInitials } from "./initials";

describe("amapInitials", () => {
  it("prend les deux premiers mots qui comptent", () => {
    expect(amapInitials("Hommes de Terre")).toBe("HT");
    expect(amapInitials("AMAP de démonstration de Cambremer")).toBe("DC");
    expect(amapInitials("AMAP fictive du Pays d'Auge")).toBe("FP");
  });

  it("garde une seule lettre pour un nom d'un mot", () => {
    expect(amapInitials("Pommeraie")).toBe("P");
    expect(amapInitials("AMAP")).toBe("A");
  });
});
