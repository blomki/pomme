import { describe, expect, it } from "vitest";

import { DONE_TASKS_SHOWN, membershipProgress, splitTasks } from "./admin-tasks";

const task = (id: string, over: Partial<Parameters<typeof splitTasks>[0][number]> = {}) => ({
  id,
  kind: "distribution_closed" as const,
  dueDate: null,
  createdAt: new Date("2026-11-01T10:00:00Z"),
  doneAt: null,
  ...over,
});

describe("splitTasks", () => {
  it("à faire : échéance la plus proche d'abord, sans échéance à la fin, puis la plus ancienne", () => {
    const { todo, done } = splitTasks([
      task("sans-date-recente", { createdAt: new Date("2026-11-10T10:00:00Z") }),
      task("decembre", { dueDate: "2026-12-24" }),
      task("sans-date-ancienne"),
      task("novembre", { dueDate: "2026-11-26" }),
    ]);
    expect(todo.map((t) => t.id)).toEqual([
      "novembre",
      "decembre",
      "sans-date-ancienne",
      "sans-date-recente",
    ]);
    expect(done).toEqual([]);
  });

  it("terminées : les plus récentes d'abord, en nombre limité", () => {
    const many = Array.from({ length: DONE_TASKS_SHOWN + 5 }, (_, i) =>
      task(`t${i}`, { doneAt: new Date(Date.UTC(2026, 10, 1, i)) }),
    );
    const { todo, done } = splitTasks(many);
    expect(todo).toEqual([]);
    expect(done).toHaveLength(DONE_TASKS_SHOWN);
    expect(done[0]!.id).toBe(`t${DONE_TASKS_SHOWN + 4}`);
  });
});

describe("membershipProgress", () => {
  it("compte les adhésions en cours, dont celles qui expirent bientôt", () => {
    expect(
      membershipProgress(["active", "expiring", "expired", "upcoming", "none", "active"]),
    ).toEqual({ active: 3, expiring: 1, total: 6 });
    expect(membershipProgress([])).toEqual({ active: 0, expiring: 0, total: 0 });
  });
});
