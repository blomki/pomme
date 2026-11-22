import { describe, expect, it } from "vitest";

import { describeDevice, isDeviceId, shouldAlert } from "./devices";

describe("describeDevice", () => {
  it("reconnaît les navigateurs et systèmes courants", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
      ),
    ).toBe("Firefox sur Windows");
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari sur iPhone ou iPad");
    expect(
      describeDevice(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
      ),
    ).toBe("Chrome sur Android");
    expect(
      describeDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0",
      ),
    ).toBe("Edge sur Mac");
  });

  it("reste prudent sans en-tête", () => {
    expect(describeDevice(null)).toBe("Navigateur inconnu");
  });
});

describe("isDeviceId", () => {
  it("n'accepte qu'un identifiant base64url de longueur raisonnable", () => {
    expect(isDeviceId("abcdefghijklmnopqrstuv")).toBe(true);
    expect(isDeviceId(undefined)).toBe(false);
    expect(isDeviceId("court")).toBe(false);
    expect(isDeviceId("abc;def=ghi jkl mno pqr")).toBe(false);
  });
});

describe("shouldAlert", () => {
  it("alerte pour un nouvel appareil, sauf le tout premier du compte", () => {
    expect(shouldAlert({ known: false, otherDevices: 2 })).toBe(true);
    expect(shouldAlert({ known: false, otherDevices: 0 })).toBe(false);
    expect(shouldAlert({ known: true, otherDevices: 3 })).toBe(false);
  });
});
