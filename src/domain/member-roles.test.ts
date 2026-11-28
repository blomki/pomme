import { describe, expect, it } from "vitest";

import {
  planMemberRoles,
  producersLeftWithoutReferent,
  type MemberRolesInput,
} from "./member-roles";

const base: MemberRolesInput = {
  isAdmin: false,
  wantsAdmin: false,
  adminCount: 2,
  isReferent: true,
  followed: ["ruches", "boulangerie"],
  wanted: ["ruches", "boulangerie"],
  followedElsewhere: 0,
};

describe("planMemberRoles", () => {
  it("décocher un seul producteur retire cette affectation et garde les autres", () => {
    expect(planMemberRoles({ ...base, wanted: ["ruches"] })).toEqual({
      status: "ok",
      admin: "keep",
      referent: "keep",
      assign: [],
      unassign: ["boulangerie"],
    });
  });

  it("décocher tous les producteurs retire le rôle de référent", () => {
    expect(planMemberRoles({ ...base, wanted: [] })).toMatchObject({
      referent: "revoke",
      unassign: ["ruches", "boulangerie"],
    });
  });

  it("garde le rôle tant qu'un producteur inactif est encore suivi", () => {
    expect(planMemberRoles({ ...base, wanted: [], followedElsewhere: 1 })).toMatchObject({
      referent: "keep",
    });
  });

  it("cocher un producteur à une personne sans rôle la rend référente de ce producteur", () => {
    expect(
      planMemberRoles({ ...base, isReferent: false, followed: [], wanted: ["ruches"] }),
    ).toEqual({ status: "ok", admin: "keep", referent: "grant", assign: ["ruches"], unassign: [] });
  });

  it("donne ou retire le rôle d'administrateur", () => {
    expect(planMemberRoles({ ...base, wantsAdmin: true })).toMatchObject({ admin: "grant" });
    expect(planMemberRoles({ ...base, isAdmin: true, wantsAdmin: false })).toMatchObject({
      admin: "revoke",
    });
  });

  it("refuse de décocher le dernier administrateur", () => {
    expect(planMemberRoles({ ...base, isAdmin: true, wantsAdmin: false, adminCount: 1 })).toEqual({
      status: "last_admin",
    });
  });
});

describe("producersLeftWithoutReferent", () => {
  it("annonce les producteurs dont la personne était le seul référent", () => {
    const counts = new Map([
      ["ruches", 1],
      ["boulangerie", 2],
    ]);
    expect(producersLeftWithoutReferent(["ruches", "boulangerie"], counts)).toEqual(["ruches"]);
  });
});
