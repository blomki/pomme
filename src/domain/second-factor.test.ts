import { describe, expect, it } from "vitest";

import {
  actionNeedsSecondFactor,
  canManageFactors,
  canResetMemberSecondFactor,
  normalizeBackupCode,
  normalizeTotpCode,
  requiresSecondFactor,
  secondFactorStatus,
} from "./second-factor";

describe("requiresSecondFactor", () => {
  it("exige la deuxième vérification d'un admin d'AMAP", () => {
    expect(requiresSecondFactor({ isPlatformAdmin: false, roles: ["admin"] })).toBe(true);
  });

  it("exige la deuxième vérification d'un gestionnaire de la plateforme", () => {
    expect(requiresSecondFactor({ isPlatformAdmin: true, roles: [] })).toBe(true);
  });

  it("l'exige d'un référent (S10), pas d'une famille", () => {
    expect(requiresSecondFactor({ isPlatformAdmin: false, roles: ["referent"] })).toBe(true);
    expect(requiresSecondFactor({ isPlatformAdmin: false, roles: [] })).toBe(false);
  });
});

describe("secondFactorStatus", () => {
  const at = new Date("2026-11-10T10:00:00Z");

  it("ne demande rien à un compte non soumis", () => {
    expect(secondFactorStatus({ required: false, verifiedAt: null, hasFactor: false })).toBe(
      "not_required",
    );
  });

  it("reconnaît une session déjà vérifiée", () => {
    expect(secondFactorStatus({ required: true, verifiedAt: at, hasFactor: true })).toBe(
      "verified",
    );
  });

  it("demande d'utiliser un moyen existant", () => {
    expect(secondFactorStatus({ required: true, verifiedAt: null, hasFactor: true })).toBe(
      "challenge",
    );
  });

  it("demande d'en créer un s'il n'y en a aucun", () => {
    expect(secondFactorStatus({ required: true, verifiedAt: null, hasFactor: false })).toBe(
      "enroll",
    );
  });
});

describe("canManageFactors", () => {
  it("refuse d'ajouter un moyen à un admin pas encore vérifié qui en a déjà un", () => {
    expect(canManageFactors({ required: true, verifiedAt: null, hasFactor: true })).toBe(false);
  });

  it("autorise le tout premier moyen après un lien magique", () => {
    expect(canManageFactors({ required: true, verifiedAt: null, hasFactor: false })).toBe(true);
  });

  it("autorise une session vérifiée, et tout compte non soumis", () => {
    expect(canManageFactors({ required: true, verifiedAt: new Date(), hasFactor: true })).toBe(
      true,
    );
    expect(canManageFactors({ required: false, verifiedAt: null, hasFactor: true })).toBe(true);
  });
});

describe("actionNeedsSecondFactor", () => {
  it("l'exige quand seul le rôle admin donne accès", () => {
    expect(actionNeedsSecondFactor(["admin"], ["admin"])).toBe(true);
    expect(actionNeedsSecondFactor(["admin", "referent"], ["admin"])).toBe(true);
  });

  it("l'exige aussi des référents depuis S10, quel que soit le rôle qui donne accès", () => {
    expect(actionNeedsSecondFactor(["admin", "referent"], ["admin", "referent"])).toBe(true);
    expect(actionNeedsSecondFactor(["referent"], ["admin", "referent"])).toBe(true);
  });

  it("ne l'exige pas sans rôle autorisé (l'accès sera refusé de toute façon)", () => {
    expect(actionNeedsSecondFactor([], ["admin"])).toBe(false);
  });
});

describe("normalizeTotpCode", () => {
  it("accepte 6 chiffres, avec espaces ou tirets", () => {
    expect(normalizeTotpCode("123456")).toBe("123456");
    expect(normalizeTotpCode(" 123 456 ")).toBe("123456");
    expect(normalizeTotpCode("123-456")).toBe("123456");
  });

  it("refuse le reste", () => {
    expect(normalizeTotpCode("12345")).toBeNull();
    expect(normalizeTotpCode("abcdef")).toBeNull();
    expect(normalizeTotpCode("")).toBeNull();
  });
});

describe("normalizeBackupCode", () => {
  it("remet le tiret et garde la casse", () => {
    expect(normalizeBackupCode("aBcDe12345")).toBe("aBcDe-12345");
    expect(normalizeBackupCode(" aBcDe-12345 ")).toBe("aBcDe-12345");
  });

  it("refuse un format inattendu", () => {
    expect(normalizeBackupCode("abc-123")).toBeNull();
    expect(normalizeBackupCode("abcde-1234!")).toBeNull();
  });
});

describe("canResetMemberSecondFactor", () => {
  const referent = {
    isSelf: false,
    isPlatformAdmin: false,
    roles: ["referent"] as const,
    hasFactor: true,
  };

  it("propose la réinitialisation pour un admin ou un référent qui a un moyen de vérification", () => {
    expect(canResetMemberSecondFactor(referent)).toBe(true);
    expect(canResetMemberSecondFactor({ ...referent, roles: ["admin"] })).toBe(true);
  });

  it("ne propose rien quand il n'y a rien à réinitialiser", () => {
    expect(canResetMemberSecondFactor({ ...referent, hasFactor: false })).toBe(false);
  });

  it("ne propose rien pour soi-même, un gestionnaire de la plateforme ou un membre sans rôle", () => {
    expect(canResetMemberSecondFactor({ ...referent, isSelf: true })).toBe(false);
    expect(canResetMemberSecondFactor({ ...referent, isPlatformAdmin: true })).toBe(false);
    expect(canResetMemberSecondFactor({ ...referent, roles: [] })).toBe(false);
  });
});
