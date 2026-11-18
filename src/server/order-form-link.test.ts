import { describe, expect, it } from "vitest";

import { linkExpiry, signOrderFormLink, verifyOrderFormLink } from "./order-form-link";

const SECRET = "secret-de-test-assez-long-pour-hmac";
const NOW = new Date("2026-11-26T10:00:00Z");
const target = { amapProducerId: "019b0000-0000-7000-8000-000000000001", month: "2026-12" };

describe("lien signé du bon de commande", () => {
  const token = signOrderFormLink({ ...target, now: NOW }, SECRET);

  it("ouvre ce bon de commande, pendant 60 jours", () => {
    expect(verifyOrderFormLink(token, { ...target, now: NOW }, SECRET)).toBe(true);
    expect(linkExpiry(token)).toEqual(new Date("2027-01-25T10:00:00Z"));
    expect(
      verifyOrderFormLink(token, { ...target, now: new Date("2027-01-26T10:00:00Z") }, SECRET),
    ).toBe(false);
  });

  it("n'ouvre ni un autre producteur, ni un autre mois", () => {
    expect(verifyOrderFormLink(token, { ...target, month: "2027-01", now: NOW }, SECRET)).toBe(
      false,
    );
    expect(
      verifyOrderFormLink(
        token,
        { amapProducerId: "019b0000-0000-7000-8000-000000000002", month: "2026-12", now: NOW },
        SECRET,
      ),
    ).toBe(false);
  });

  it("refuse une clé modifiée, mal formée, ou signée avec un autre secret", () => {
    const [expires, sig] = token.split(".");
    // Repousser l'expiration sans connaître le secret ne marche pas.
    expect(
      verifyOrderFormLink(`${Number(expires) + 1}.${sig}`, { ...target, now: NOW }, SECRET),
    ).toBe(false);
    expect(verifyOrderFormLink("n'importe quoi", { ...target, now: NOW }, SECRET)).toBe(false);
    expect(verifyOrderFormLink(token, { ...target, now: NOW }, "un-autre-secret")).toBe(false);
    expect(verifyOrderFormLink(token, { ...target, now: NOW }, "")).toBe(false);
    expect(linkExpiry("abc")).toBeNull();
  });
});
