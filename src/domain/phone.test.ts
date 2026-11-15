import { describe, expect, it } from "vitest";

import { formatPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["06 12 34 56 78", "+33612345678"],
    ["06.12.34.56.78", "+33612345678"],
    ["06-12-34-56-78", "+33612345678"],
    ["0612345678", "+33612345678"],
    ["+33 6 12 34 56 78", "+33612345678"],
    ["+33 (0)6 12 34 56 78", "+33612345678"],
    ["0033 6 12 34 56 78", "+33612345678"],
    ["02 31 12 34 56", "+33231123456"],
    ["+32 470 12 34 56", "+32470123456"],
    [" 06 12 34 56 78 ", "+33612345678"],
  ])("convertit « %s » en %s", (input, expected) => {
    expect(normalizePhone(input)).toEqual({ ok: true, phone: expected });
  });

  it.each(["", "12", "06 12 34", "abc", "+0612345678", "06 12 34 56 78 90 12"])(
    "refuse « %s »",
    (input) => {
      expect(normalizePhone(input)).toEqual({ ok: false });
    },
  );
});

describe("formatPhone", () => {
  it("affiche un numéro français par paires", () => {
    expect(formatPhone("+33612345678")).toBe("06 12 34 56 78");
  });

  it("laisse un numéro étranger tel quel", () => {
    expect(formatPhone("+32470123456")).toBe("+32470123456");
  });
});
