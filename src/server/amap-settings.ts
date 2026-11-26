import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amap, type AmapSettings, type AmapTheme } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import {
  checkAmapSettings,
  effectiveParameters,
  type AmapParameter,
  type AmapSettingsProblem,
} from "@/domain/amap-settings";
import { isBannerGroup, type BannerGroup, type BannerImages } from "@/domain/banner-images";
import { checkUpload, IMAGE_USAGES, MAX_UPLOAD_BYTES, type UploadProblem } from "@/domain/images";
import { HEADING_FONTS, resolveThemeConfig, type HeadingFont } from "@/ui/theme/key-colors";

import { writeAuditLog } from "./audit";
import { requireRole } from "./auth/require-role";
import { reencodeImage } from "./files/images";
import type { FileStore } from "./files/storage";

// Réglages de l'AMAP (story A4, ADR 0032), réservés à ses administrateurs (requireRole, et la
// Row Level Security ne laisse modifier que l'AMAP courante). Chaque modification est
// journalisée, avec l'avant et l'après. L'adresse (slug) ne se change pas ici.

export type AmapSettingsView = {
  name: string;
  slug: string;
  logoUrl: string | null;
  /** Images des bandeaux, par famille d'écrans (story S14). */
  bannerImages: BannerImages;
  colors: { primary: string; secondary: string; tertiary: string };
  headingFont: HeadingFont;
  contactEmail: string;
  parameters: Record<AmapParameter, number>;
  /** Distribution habituelle (réglée depuis le planning, story D1), pour mémoire. */
  distribution: { place: string | null; weekday?: number; startTime?: string; endTime?: string };
};

async function loadAmap(tx: Transaction, ctx: AmapContext) {
  const [row] = await tx.select().from(amap).where(eq(amap.id, ctx.amapId!));
  if (!row) throw new Error("AMAP courante introuvable.");
  return row;
}

export async function getAmapSettings(
  tx: Transaction,
  ctx: AmapContext,
): Promise<AmapSettingsView> {
  await requireRole(tx, ctx, ["admin"]);
  const row = await loadAmap(tx, ctx);
  // Couleurs enregistrées, complétées par celles de la plateforme si elles manquent.
  const theme = resolveThemeConfig(row.theme);
  return {
    name: row.name,
    slug: row.slug,
    logoUrl: row.logoUrl,
    bannerImages: row.bannerImages,
    colors: {
      primary: theme.keyColors.primary,
      secondary: theme.keyColors.secondary,
      tertiary: theme.keyColors.tertiary,
    },
    headingFont: theme.headingFont,
    contactEmail: row.contactEmail ?? "",
    parameters: effectiveParameters(row.settings),
    distribution: {
      place: row.distributionPlace,
      weekday: row.settings.distributionWeekday,
      startTime: row.settings.distributionStartTime,
      endTime: row.settings.distributionEndTime,
    },
  };
}

const schema = z.object({
  name: z.string(),
  primary: z.string().trim(),
  secondary: z.string().trim(),
  tertiary: z.string().trim(),
  headingFont: z.enum(HEADING_FONTS),
  contactEmail: z.union([z.literal(""), z.email()]),
  volunteersPerDistribution: z.coerce.number(),
  experiencedThreshold: z.coerce.number(),
  membershipExpiryAlertDays: z.coerce.number(),
  orderReminderDays: z.coerce.number(),
});

export type SaveSettingsProblem =
  AmapSettingsProblem | { field: "contactEmail" | "headingFont"; problem: "invalid" };

export type SaveSettingsResult =
  { status: "saved" } | { status: "invalid"; problems: SaveSettingsProblem[] };

/** Enregistre le nom, le thème, l'email de contact et les paramètres ; journalisé. */
export async function saveAmapSettings(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SaveSettingsResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const problems = parsed.error.issues.flatMap((issue): SaveSettingsProblem[] => {
      const field = issue.path[0];
      return field === "contactEmail" || field === "headingFont"
        ? [{ field, problem: "invalid" }]
        : [];
    });
    return { status: "invalid", problems };
  }
  const data = parsed.data;
  const parameters = {
    volunteersPerDistribution: data.volunteersPerDistribution,
    experiencedThreshold: data.experiencedThreshold,
    membershipExpiryAlertDays: data.membershipExpiryAlertDays,
    orderReminderDays: data.orderReminderDays,
  };
  const problems = checkAmapSettings({
    name: data.name,
    colors: { primary: data.primary, secondary: data.secondary, tertiary: data.tertiary },
    parameters,
  });
  if (problems.length > 0) return { status: "invalid", problems };

  const before = await loadAmap(tx, ctx);
  const theme: AmapTheme = {
    ...before.theme,
    primary: data.primary.toLowerCase(),
    secondary: data.secondary.toLowerCase(),
    tertiary: data.tertiary.toLowerCase(),
    headingFont: data.headingFont,
  };
  const settings: AmapSettings = { ...before.settings, ...parameters };
  const contactEmail = data.contactEmail.trim().toLowerCase() || null;
  await tx
    .update(amap)
    .set({ name: data.name.trim(), theme, settings, contactEmail })
    .where(eq(amap.id, ctx.amapId!));
  await writeAuditLog(tx, ctx, {
    entityType: "amap",
    entityId: ctx.amapId!,
    action: "update_settings",
    before: {
      name: before.name,
      theme: before.theme,
      settings: before.settings,
      contactEmail: before.contactEmail,
    },
    after: { name: data.name.trim(), theme, settings, contactEmail },
  });
  return { status: "saved" };
}

export type SaveLogoResult =
  | {
      status: "saved";
      logoUrl: string;
      /** Ancien logo, à supprimer du stockage une fois la transaction validée. */
      previousUrl: string | null;
    }
  | { status: UploadProblem | "no_file" | "unavailable" };

/**
 * Enregistre le logo : type et taille contrôlés, image ré-encodée (512 points au plus), stockée
 * hors du serveur web. Journalisé. Le texte alternatif du logo est le nom de l'AMAP.
 */
export async function saveAmapLogo(
  tx: Transaction,
  ctx: AmapContext,
  input: { file: Blob | null },
  store: FileStore | null,
): Promise<SaveLogoResult> {
  await requireRole(tx, ctx, ["admin"]);
  if (!store) return { status: "unavailable" };
  if (!input.file || input.file.size === 0) return { status: "no_file" };
  if (input.file.size > MAX_UPLOAD_BYTES) return { status: "too_large" };
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const problem = checkUpload({ size: bytes.length, head: bytes.subarray(0, 16) });
  if (problem) return { status: problem };
  let image;
  try {
    image = await reencodeImage(bytes, "amap_logo");
  } catch {
    return { status: "not_image" };
  }
  const before = await loadAmap(tx, ctx);
  const key = `${IMAGE_USAGES.amap_logo.folder}/${uuidv7()}.webp`;
  await store.put(key, image.body, image.contentType);
  const logoUrl = store.publicUrl(key);
  try {
    await tx.update(amap).set({ logoUrl }).where(eq(amap.id, ctx.amapId!));
    await writeAuditLog(tx, ctx, {
      entityType: "amap",
      entityId: ctx.amapId!,
      action: "update_logo",
      before: { logoUrl: before.logoUrl },
      after: { logoUrl },
    });
  } catch (error) {
    // Pas d'orphelin dans le stockage si l'enregistrement échoue.
    await store.delete(key).catch(() => undefined);
    throw error;
  }
  return { status: "saved", logoUrl, previousUrl: before.logoUrl };
}

/** Retire le logo ; journalisé. L'image est supprimée du stockage après la transaction. */
export async function removeAmapLogo(
  tx: Transaction,
  ctx: AmapContext,
): Promise<{ status: "removed"; previousUrl: string | null }> {
  await requireRole(tx, ctx, ["admin"]);
  const before = await loadAmap(tx, ctx);
  await tx.update(amap).set({ logoUrl: null }).where(eq(amap.id, ctx.amapId!));
  await writeAuditLog(tx, ctx, {
    entityType: "amap",
    entityId: ctx.amapId!,
    action: "remove_logo",
    before: { logoUrl: before.logoUrl },
    after: { logoUrl: null },
  });
  return { status: "removed", previousUrl: before.logoUrl };
}

export type SaveBannerImageResult =
  | {
      status: "saved";
      url: string;
      /** Image remplacée, à supprimer du stockage une fois la transaction validée. */
      previousUrl: string | null;
    }
  | { status: UploadProblem | "no_file" | "unavailable" | "invalid" };

/**
 * Enregistre l'image du bandeau d'une famille d'écrans (story S14, ADR 0049) : mêmes contrôles
 * et même ré-encodage que le logo, 512 points au plus. Journalisé.
 */
export async function saveBannerImage(
  tx: Transaction,
  ctx: AmapContext,
  input: { group: unknown; file: Blob | null },
  store: FileStore | null,
): Promise<SaveBannerImageResult> {
  await requireRole(tx, ctx, ["admin"]);
  if (!isBannerGroup(input.group)) return { status: "invalid" };
  const group: BannerGroup = input.group;
  if (!store) return { status: "unavailable" };
  if (!input.file || input.file.size === 0) return { status: "no_file" };
  if (input.file.size > MAX_UPLOAD_BYTES) return { status: "too_large" };
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const problem = checkUpload({ size: bytes.length, head: bytes.subarray(0, 16) });
  if (problem) return { status: problem };
  let image;
  try {
    image = await reencodeImage(bytes, "banner_image");
  } catch {
    return { status: "not_image" };
  }
  const before = await loadAmap(tx, ctx);
  const key = `${IMAGE_USAGES.banner_image.folder}/${uuidv7()}.webp`;
  await store.put(key, image.body, image.contentType);
  const url = store.publicUrl(key);
  const previousUrl = before.bannerImages[group] ?? null;
  try {
    await tx
      .update(amap)
      .set({ bannerImages: { ...before.bannerImages, [group]: url } })
      .where(eq(amap.id, ctx.amapId!));
    await writeAuditLog(tx, ctx, {
      entityType: "amap",
      entityId: ctx.amapId!,
      action: "update_banner_image",
      before: { group, url: previousUrl },
      after: { group, url },
    });
  } catch (error) {
    // Pas d'orphelin dans le stockage si l'enregistrement échoue.
    await store.delete(key).catch(() => undefined);
    throw error;
  }
  return { status: "saved", url, previousUrl };
}

/**
 * Retire l'image du bandeau d'une famille : le bandeau reprend le logo. Journalisé ; l'image est
 * supprimée du stockage après la transaction.
 */
export async function removeBannerImage(
  tx: Transaction,
  ctx: AmapContext,
  input: { group: unknown },
): Promise<{ status: "removed"; previousUrl: string | null } | { status: "invalid" }> {
  await requireRole(tx, ctx, ["admin"]);
  if (!isBannerGroup(input.group)) return { status: "invalid" };
  const group: BannerGroup = input.group;
  const before = await loadAmap(tx, ctx);
  const { [group]: previousUrl = null, ...rest } = before.bannerImages;
  await tx.update(amap).set({ bannerImages: rest }).where(eq(amap.id, ctx.amapId!));
  await writeAuditLog(tx, ctx, {
    entityType: "amap",
    entityId: ctx.amapId!,
    action: "remove_banner_image",
    before: { group, url: previousUrl },
    after: { group, url: null },
  });
  return { status: "removed", previousUrl };
}
