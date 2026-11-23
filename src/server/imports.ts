import { eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  amapProducer,
  dutyHistory,
  household,
  householdMember,
  membership,
  producer,
  product,
  user,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { parseCsv } from "@/domain/csv";
import {
  IMPORT_KINDS,
  mapHeaders,
  parseHouseholdRow,
  parseProducerRow,
  parseProductRow,
  refuseDuplicates,
  type HouseholdRow,
  type ProducerRow,
  type ProductRow,
  type ImportKind,
  type RowProblem,
  type RowResult,
} from "@/domain/imports";

import { writeAuditLog } from "./audit";
import { requireRole } from "./auth/require-role";

// Reprise des données depuis AmapJ (story K1, ADR 0044). L'aperçu et l'import suivent le même
// chemin (`write` faux ou vrai) : l'admin voit exactement ce qui sera fait. Un nouvel import du
// même fichier ne crée rien : les personnes se reconnaissent à leur email, les foyers,
// producteurs et produits à leur nom (sans tenir compte des majuscules).

export type ImportProblem =
  | RowProblem
  | { code: "member_elsewhere"; household: string }
  | { code: "producer_unknown"; producer: string };

export type ImportLine = {
  line: number;
  /** create : ajouté ; update : complété (adhésion, antériorité) ; unchanged : déjà là. */
  status: "create" | "update" | "unchanged" | "refused";
  label: string;
  problems: ImportProblem[];
};

export type ImportReport =
  | {
      status: "ready";
      kind: ImportKind;
      lines: ImportLine[];
      counts: Record<ImportLine["status"], number>;
      ignoredColumns: string[];
    }
  | { status: "missing_columns"; missing: string[] }
  | { status: "empty" | "invalid" };

/** Taille maximale : de quoi reprendre une grande AMAP, pas plus. */
const MAX_LENGTH = 1_000_000;
const MAX_ROWS = 2_000;

const inputSchema = z.object({
  kind: z.enum(IMPORT_KINDS),
  csv: z.string().max(MAX_LENGTH),
});

const key = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Aperçu (`write` faux) ou import (`write` vrai) d'un fichier CSV. Réservé aux admins.
 */
export async function runImport(
  tx: Transaction,
  ctx: AmapContext,
  input: { kind: unknown; csv: unknown },
  write: boolean,
): Promise<ImportReport> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { kind, csv } = parsed.data;
  const table = parseCsv(csv);
  if (table.rows.length === 0) return { status: "empty" };
  if (table.rows.length > MAX_ROWS) return { status: "invalid" };
  const mapping = mapHeaders(kind, table.headers);
  if (mapping.missing.length > 0) return { status: "missing_columns", missing: mapping.missing };

  // Numéro de ligne dans le fichier : l'en-tête est la ligne 1.
  const lines =
    kind === "households"
      ? await importHouseholds(
          tx,
          ctx,
          refuseDuplicates(
            table.rows.map((r, i) => parseHouseholdRow(r, mapping, i + 2)),
            (v) => v.email,
          ),
          write,
        )
      : kind === "producers"
        ? await importProducers(
            tx,
            ctx,
            refuseDuplicates(
              table.rows.map((r, i) => parseProducerRow(r, mapping, i + 2)),
              (v) => key(v.name),
            ),
            write,
          )
        : await importProducts(
            tx,
            ctx,
            refuseDuplicates(
              table.rows.map((r, i) => parseProductRow(r, mapping, i + 2)),
              (v) => `${key(v.producer)}|${key(v.name)}`,
            ),
            write,
          );

  const counts = { create: 0, update: 0, unchanged: 0, refused: 0 };
  for (const l of lines) counts[l.status] += 1;
  if (write && counts.create + counts.update > 0) {
    await writeAuditLog(tx, ctx, {
      entityType: "import",
      entityId: uuidv7(),
      action: `import_${kind}`,
      after: counts,
    });
  }
  return { status: "ready", kind, lines, counts, ignoredColumns: mapping.ignored };
}

const refused = (line: number, label: string, problems: ImportProblem[]): ImportLine => ({
  line,
  status: "refused",
  label,
  problems,
});

// --- Foyers, membres, adhésions, antériorité ---------------------------------------------------

async function importHouseholds(
  tx: Transaction,
  ctx: AmapContext,
  rows: Array<RowResult<HouseholdRow>>,
  write: boolean,
): Promise<ImportLine[]> {
  const amapId = ctx.amapId!;
  // Foyers actifs de l'AMAP, par nom ; membres actifs, par compte.
  const households = new Map(
    (
      await tx
        .select({ id: household.id, name: household.name })
        .from(household)
        .where(isNull(household.archivedAt))
    ).map((h) => [key(h.name), h]),
  );
  const members = await tx
    .select({ userId: householdMember.userId, householdId: householdMember.householdId })
    .from(householdMember)
    .where(isNull(householdMember.archivedAt));
  const memberOf = new Map(members.map((m) => [m.userId, m.householdId]));
  const periods = await tx
    .select({
      householdId: membership.householdId,
      startDate: membership.startDate,
      endDate: membership.endDate,
    })
    .from(membership);
  const histories = new Map(
    (await tx.select().from(dutyHistory)).map((h) => [h.userId, h.importedCount]),
  );

  // Contact principal d'un foyer créé par l'import : la ligne marquée « oui », sinon la première.
  const marked = new Map<string, string>();
  const first = new Map<string, string>();
  for (const r of rows) {
    if (!("value" in r)) continue;
    const k = key(r.value.household);
    if (r.value.primary && !marked.has(k)) marked.set(k, r.value.email);
    if (!first.has(k)) first.set(k, r.value.email);
  }
  const isPrimary = (k: string, email: string) => (marked.get(k) ?? first.get(k)) === email;
  // Foyers créés par cet import : seuls eux reçoivent ici un contact principal ; dans un foyer
  // existant, le contact principal ne change pas.
  const created = new Set<string>();

  const result: ImportLine[] = [];
  for (const row of rows) {
    if (!("value" in row)) {
      result.push(refused(row.line, "", row.problems));
      continue;
    }
    const v = row.value;
    const label = `${v.firstName} ${v.lastName}`.trim() + ` · ${v.household}`;
    const hKey = key(v.household);
    let target = households.get(hKey);

    // Compte existant (même dans une autre AMAP) : fonction de base dédiée (migration 0007).
    const found = await tx.execute<{ id: string | null }>(
      sql`select find_user_id_by_email(${v.email}) as id`,
    );
    const existingId = found.rows[0]?.id ?? null;
    const currentHousehold = existingId ? memberOf.get(existingId) : undefined;
    if (currentHousehold && currentHousehold !== target?.id) {
      const name = [...households.values()].find((h) => h.id === currentHousehold)?.name ?? "";
      result.push(refused(row.line, label, [{ code: "member_elsewhere", household: name }]));
      continue;
    }

    let status: ImportLine["status"] = "unchanged";
    if (!target) {
      target = { id: uuidv7(), name: v.household };
      households.set(hKey, target);
      created.add(target.id);
      if (write) {
        await tx
          .insert(household)
          .values({ id: target.id, amapId, name: v.household, createdBy: ctx.userId });
      }
    }
    const userId = existingId ?? uuidv7();
    if (!currentHousehold) {
      status = "create";
      memberOf.set(userId, target.id);
      if (write) {
        if (!existingId) {
          // Sans RETURNING : la ligne ne sera visible (RLS) qu'une fois la personne dans le foyer.
          await tx.insert(user).values({
            id: userId,
            email: v.email,
            firstName: v.firstName,
            lastName: v.lastName,
            phone: v.phone,
          });
        }
        await tx.insert(householdMember).values({
          amapId,
          householdId: target.id,
          userId,
          isPrimary: created.has(target.id) && isPrimary(hKey, v.email),
          createdBy: ctx.userId,
        });
      }
    }
    if (
      v.membership &&
      !periods.some(
        (p) =>
          p.householdId === target.id &&
          p.startDate === v.membership!.startDate &&
          p.endDate === v.membership!.endDate,
      )
    ) {
      if (status === "unchanged") status = "update";
      periods.push({ householdId: target.id, ...v.membership });
      if (write) {
        await tx.insert(membership).values({
          amapId,
          householdId: target.id,
          ...v.membership,
          createdBy: ctx.userId,
        });
      }
    }
    if (v.dutyCount !== null && histories.get(userId) !== v.dutyCount) {
      if (status === "unchanged") status = "update";
      histories.set(userId, v.dutyCount);
      if (write) {
        await tx
          .insert(dutyHistory)
          .values({ amapId, userId, importedCount: v.dutyCount })
          .onConflictDoUpdate({
            target: [dutyHistory.amapId, dutyHistory.userId],
            set: { importedCount: v.dutyCount, updatedAt: new Date() },
          });
      }
    }
    result.push({ line: row.line, status, label, problems: [] });
  }
  return result;
}

// --- Producteurs --------------------------------------------------------------------------------

async function importProducers(
  tx: Transaction,
  ctx: AmapContext,
  rows: Array<RowResult<ProducerRow>>,
  write: boolean,
): Promise<ImportLine[]> {
  // Producteurs de l'AMAP, par nom. Un producteur d'une autre AMAP n'est jamais rattaché ici :
  // ce serait toucher à sa fiche commune ; l'admin le fait à la main (« Rattacher »).
  const known = new Set(
    (
      await tx
        .select({ name: producer.name })
        .from(amapProducer)
        .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    ).map((p) => key(p.name)),
  );
  const result: ImportLine[] = [];
  for (const row of rows) {
    if (!("value" in row)) {
      result.push(refused(row.line, "", row.problems));
      continue;
    }
    const v = row.value;
    if (known.has(key(v.name))) {
      result.push({ line: row.line, status: "unchanged", label: v.name, problems: [] });
      continue;
    }
    known.add(key(v.name));
    if (write) {
      const producerId = uuidv7();
      // Sans RETURNING : le producteur ne devient visible (RLS) qu'une fois dans l'AMAP.
      await tx.insert(producer).values({
        id: producerId,
        name: v.name,
        category: v.category,
        email: v.email,
        phone: v.phone,
        description: v.description,
        createdBy: ctx.userId,
      });
      await tx.insert(amapProducer).values({
        amapId: ctx.amapId!,
        producerId,
        checkPayee: v.checkPayee,
        createdBy: ctx.userId,
      });
    }
    result.push({ line: row.line, status: "create", label: v.name, problems: [] });
  }
  return result;
}

// --- Produits -----------------------------------------------------------------------------------

async function importProducts(
  tx: Transaction,
  ctx: AmapContext,
  rows: Array<RowResult<ProductRow>>,
  write: boolean,
): Promise<ImportLine[]> {
  const producers = new Map(
    (
      await tx
        .select({ id: producer.id, name: producer.name })
        .from(amapProducer)
        .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    ).map((p) => [key(p.name), p.id]),
  );
  const existing = new Set(
    (
      await tx
        .select({ producerId: product.producerId, name: product.name })
        .from(product)
        .where(isNull(product.archivedAt))
    ).map((p) => `${p.producerId}|${key(p.name)}`),
  );
  const result: ImportLine[] = [];
  for (const row of rows) {
    if (!("value" in row)) {
      result.push(refused(row.line, "", row.problems));
      continue;
    }
    const v = row.value;
    const label = `${v.name} · ${v.producer}`;
    const producerId = producers.get(key(v.producer));
    if (!producerId) {
      result.push(refused(row.line, label, [{ code: "producer_unknown", producer: v.producer }]));
      continue;
    }
    const k = `${producerId}|${key(v.name)}`;
    if (existing.has(k)) {
      result.push({ line: row.line, status: "unchanged", label, problems: [] });
      continue;
    }
    existing.add(k);
    if (write) {
      await tx.insert(product).values({ producerId, name: v.name, createdBy: ctx.userId });
    }
    result.push({ line: row.line, status: "create", label, problems: [] });
  }
  return result;
}
