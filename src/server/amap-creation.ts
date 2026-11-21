import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import type { AmapSettings, AmapTheme } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { checkNewAmap, type NewAmapProblem } from "@/domain/amap-creation";
import { DEFAULT_AMAP_PARAMETERS } from "@/domain/amap-settings";
import { HEADING_FONTS } from "@/ui/theme/key-colors";

import { ForbiddenError, SecondFactorRequiredError, UnauthenticatedError } from "./auth/errors";
import { insufficientPrivilege, uniqueViolation } from "./db-errors";

// Création d'une AMAP par le gestionnaire de la plateforme (story J1, ADR 0031). Tout passe par
// la fonction de base create_amap (migrations 0031 et 0033, qui y ajoute les pages obligatoires
// du site, H2), seule à pouvoir créer une AMAP : elle
// vérifie elle-même que la personne connectée est gestionnaire.

const schema = z.object({
  name: z.string(),
  slug: z.string().trim(),
  primary: z.string().trim(),
  secondary: z.string().trim(),
  tertiary: z.string().trim(),
  headingFont: z.enum(HEADING_FONTS),
  place: z.string(),
  weekday: z.coerce.number(),
  startTime: z.string().trim(),
  endTime: z.string().trim(),
  timezone: z.string(),
  contactEmail: z.union([z.literal(""), z.email()]).default(""),
  admin: z.object({
    email: z.email(),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().max(60).default(""),
  }),
});

/** Champs refusés par le schéma (adresse email, prénom…), en plus des règles du domaine. */
export type FieldProblem =
  | NewAmapProblem
  | {
      field: "contactEmail" | "adminEmail" | "adminFirstName" | "adminLastName" | "headingFont";
      problem: "invalid";
    };

export type CreateAmapResult =
  | { status: "created"; amapId: string; slug: string; adminUserId: string; adminCreated: boolean }
  | { status: "invalid"; problems: FieldProblem[] }
  | { status: "slug_taken" };

const SCHEMA_FIELDS: Record<string, FieldProblem["field"]> = {
  contactEmail: "contactEmail",
  "admin.email": "adminEmail",
  "admin.firstName": "adminFirstName",
  "admin.lastName": "adminLastName",
  headingFont: "headingFont",
};

/**
 * Crée l'AMAP, le compte de son premier administrateur s'il n'existe pas, son rôle admin et la
 * ligne du journal, en une transaction. Réservé aux gestionnaires, après la deuxième
 * vérification. L'invitation part ensuite, une fois la transaction validée (action).
 */
export async function createAmap(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<CreateAmapResult> {
  if (!ctx.userId) throw new UnauthenticatedError();
  if (!ctx.secondFactorVerified) throw new SecondFactorRequiredError();

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const problems = parsed.error.issues.flatMap((issue): FieldProblem[] => {
      const field = SCHEMA_FIELDS[issue.path.join(".")];
      return field ? [{ field, problem: "invalid" } as FieldProblem] : [];
    });
    return { status: "invalid", problems };
  }
  const data = parsed.data;
  const problems = checkNewAmap({
    name: data.name,
    slug: data.slug,
    colors: { primary: data.primary, secondary: data.secondary, tertiary: data.tertiary },
    place: data.place,
    weekday: data.weekday,
    startTime: data.startTime,
    endTime: data.endTime,
    timezone: data.timezone,
  });
  if (problems.length > 0) return { status: "invalid", problems };

  const theme: AmapTheme = {
    primary: data.primary.toLowerCase(),
    secondary: data.secondary.toLowerCase(),
    tertiary: data.tertiary.toLowerCase(),
    headingFont: data.headingFont,
  };
  const settings: AmapSettings = {
    ...DEFAULT_AMAP_PARAMETERS,
    distributionWeekday: data.weekday,
    distributionStartTime: data.startTime,
    distributionEndTime: data.endTime,
  };
  const amapId = uuidv7();
  try {
    // Point de sauvegarde : une adresse déjà prise n'annule pas toute la transaction.
    const rows = await tx.transaction((sub) =>
      sub.execute<{ admin_user_id: string; admin_created: boolean }>(sql`
        select * from create_amap(
          ${amapId}, ${data.slug}, ${data.name}, ${JSON.stringify(theme)}::jsonb,
          ${JSON.stringify(settings)}::jsonb, ${data.place}, ${data.timezone},
          ${data.contactEmail}, ${uuidv7()}, ${data.admin.email}, ${data.admin.firstName},
          ${data.admin.lastName}, ${uuidv7()}, ${uuidv7()}, ${uuidv7()}, ${uuidv7()}
        )`),
    );
    const row = rows.rows[0]!;
    return {
      status: "created",
      amapId,
      slug: data.slug,
      adminUserId: row.admin_user_id,
      adminCreated: row.admin_created,
    };
  } catch (error) {
    if (uniqueViolation(error) === "amap_slug_unique") return { status: "slug_taken" };
    // La fonction de base refuse toute personne qui n'est pas gestionnaire.
    if (insufficientPrivilege(error)) throw new ForbiddenError();
    throw error;
  }
}
