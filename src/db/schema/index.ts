/**
 * Schéma de la base (Drizzle ORM). Source de vérité des tables : « pnpm db:generate » en déduit
 * les migrations SQL de src/db/migrations.
 *
 * Conventions (modèle de données, section 1) :
 * - tables et colonnes en anglais, snake_case, au singulier ;
 * - identifiants UUID v7, générés par l'application (voir ../uuid.ts) ;
 * - montants en centimes entiers (colonnes *_cents) ;
 * - created_at et updated_at partout (sauf audit_log, jamais modifié) ;
 * - archivage (archived_at) plutôt que suppression.
 *
 * Isolation entre AMAP : chaque table porte des politiques de Row Level Security (RLS).
 * PostgreSQL filtre lui-même les lignes selon l'AMAP et l'utilisateur fixés au début de chaque
 * transaction (voir ../context.ts et docs/adr/0003-isolation-par-amap-rls.md). Une table
 * avec RLS et sans politique pour une opération refuse cette opération.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  integer,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { AMAP_ROLES } from "@/domain/roles";

import { uuidv7 } from "../uuid";

// --- Contexte de la transaction --------------------------------------------------------------
// Variables posées par withAmapContext() au début de chaque transaction. current_setting(…, true)
// renvoie NULL si la variable n'existe pas : sans contexte, aucune ligne n'est visible.

/** AMAP dans laquelle l'utilisateur navigue. */
const currentAmapId = sql`nullif(current_setting('app.amap_id', true), '')::uuid`;
/** Utilisateur connecté. */
const currentUserId = sql`nullif(current_setting('app.user_id', true), '')::uuid`;

/**
 * Rôle PostgreSQL de Better Auth (comptes, sessions, passkeys), créé par « pnpm db:setup ».
 * Seul à pouvoir lire les tables de connexion : même une faille dans le reste de
 * l'application (rôle pomme_app) ne donnerait pas accès aux jetons de session.
 */
export const authRole = pgRole("pomme_auth").existing();

/** Accès complet pour Better Auth, qui gère lui-même les comptes et les sessions. */
const authFullAccess = (name: string) =>
  pgPolicy(name, { for: "all", to: authRole, using: sql`true`, withCheck: sql`true` });

// --- Colonnes communes -----------------------------------------------------------------------

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

const archivedAt = () => timestamp("archived_at", { withTimezone: true });

// --- Types des colonnes JSON -----------------------------------------------------------------

/** Thème d'une AMAP : couleurs clés Material Design 3 et police des titres (fiche S4). */
export type AmapTheme = {
  primary?: string;
  secondary?: string;
  tertiary?: string;
  neutral?: string;
  neutralVariant?: string;
  headingFont?: string;
};

/** Réglages d'une AMAP (story A4). */
export type AmapSettings = {
  volunteersPerDistribution?: number; // 3 bénévoles par distribution
  experiencedThreshold?: number; // expérimenté à partir de 6 permanences
  membershipExpiryAlertDays?: number; // alerte 30 jours avant la fin d'adhésion
};

// --- user : utilisateur ----------------------------------------------------------------------
// Compte unique sur la plateforme, partagé entre AMAP. Better Auth lit et met à jour cette
// table (connexion) ; ses sessions et jetons sont dans les tables de la fin de ce fichier.

export const user = pgTable(
  "user",
  {
    id: id(),
    email: text("email").notNull().unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    // Format international (+33…) : nécessaire pour les liens « Écrire sur Signal ».
    phone: text("phone"),
    // Noms de propriétés imposés par Better Auth (emailVerified, image).
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("user_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("user_phone_international", sql`${t.phone} ~ '^\\+[1-9][0-9]{6,14}$'`),
    // Lecture : soi-même, et les personnes qui ont un rôle dans l'AMAP courante.
    // (La sous-requête sur amap_role est elle-même filtrée par sa RLS : elle ne voit que
    // l'AMAP courante.) Les membres des foyers s'ajouteront avec la story A2.
    pgPolicy("user_select", {
      for: "select",
      using: sql`"user"."id" = ${currentUserId}
        or exists (select 1 from amap_role where amap_role.user_id = "user"."id")`,
    }),
    // Création : inscription ou invitation, jamais d'un gestionnaire de la plateforme.
    pgPolicy("user_insert", {
      for: "insert",
      withCheck: sql`"user"."is_platform_admin" = false`,
    }),
    // Modification : uniquement son propre compte, sans pouvoir se rendre gestionnaire.
    pgPolicy("user_update", {
      for: "update",
      using: sql`"user"."id" = ${currentUserId}`,
      withCheck: sql`"user"."id" = ${currentUserId} and "user"."is_platform_admin" = false`,
    }),
    // Better Auth retrouve un compte par son email avant toute connexion (sans contexte).
    authFullAccess("user_auth"),
  ],
);

// --- amap : AMAP -----------------------------------------------------------------------------

export const amap = pgTable(
  "amap",
  {
    id: id(),
    slug: text("slug").notNull().unique(), // adresse : [domaine]/hommesdeterre
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    theme: jsonb("theme").$type<AmapTheme>().notNull().default({}),
    contactEmail: text("contact_email"),
    distributionPlace: text("distribution_place"),
    timezone: text("timezone").notNull().default("Europe/Paris"),
    settings: jsonb("settings").$type<AmapSettings>().notNull().default({}),
    createdBy: uuid("created_by").references(() => user.id),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Même règle que validateAmapSlug (src/domain/amap-slug.ts), garantie aussi par la base.
    check(
      "amap_slug_format",
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(${t.slug}) between 3 and 40`,
    ),
    // Lecture : tout le monde. Nom, adresse et thème d'une AMAP sont publics (page publique).
    pgPolicy("amap_select", { for: "select", using: sql`true` }),
    // Modification : seulement l'AMAP courante (le rôle admin est vérifié par requireRole).
    // Création : aucune politique, donc interdite au rôle applicatif ; elle passera par une
    // fonction dédiée réservée au gestionnaire de la plateforme (story J1).
    pgPolicy("amap_update", {
      for: "update",
      using: sql`${t.id} = ${currentAmapId}`,
      withCheck: sql`${t.id} = ${currentAmapId}`,
    }),
  ],
);

// --- amap_role : rôle dans une AMAP ----------------------------------------------------------

export const amapRoleName = pgEnum("amap_role_name", AMAP_ROLES);

export const amapRole = pgTable(
  "amap_role",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    role: amapRoleName("role").notNull(),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("amap_role_unique").on(t.amapId, t.userId, t.role),
    index("amap_role_user_idx").on(t.userId),
    // Toutes les opérations : seulement dans l'AMAP courante.
    pgPolicy("amap_role_isolation", {
      for: "all",
      using: sql`${t.amapId} = ${currentAmapId}`,
      withCheck: sql`${t.amapId} = ${currentAmapId}`,
    }),
  ],
);

// --- audit_log : journal ---------------------------------------------------------------------
// Une ligne par action financière ou correction, écrite dans la même transaction que l'action
// (voir src/server/audit.ts). Jamais modifiée ni supprimée : pas de politique UPDATE ou DELETE.

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    actorUserId: uuid("actor_user_id").references(() => user.id), // vide = tâche automatique
    entityType: text("entity_type").notNull(), // ex. "cheque", "credit_note"
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(), // ex. "create", "update", "archive"
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.amapId, t.entityType, t.entityId),
    pgPolicy("audit_log_select", {
      for: "select",
      using: sql`${t.amapId} = ${currentAmapId}`,
    }),
    // Écriture : dans l'AMAP courante, au nom de l'utilisateur connecté (pas d'un autre).
    pgPolicy("audit_log_insert", {
      for: "insert",
      withCheck: sql`${t.amapId} = ${currentAmapId}
        and ${t.actorUserId} is not distinct from ${currentUserId}`,
    }),
  ],
);

// --- Tables de Better Auth (connexion) -------------------------------------------------------
// Structure imposée par Better Auth (noms de propriétés), colonnes en snake_case.
// RLS : seul le rôle pomme_auth y a accès ; le rôle de l'application, aucun.

/** Session ouverte sur un appareil (cookie HttpOnly). */
export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId), authFullAccess("session_auth")],
);

/** Moyens de connexion rattachés à un compte (Better Auth en a besoin même sans mot de passe). */
export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    // Toujours vide : Pomme n'utilise aucun mot de passe. Colonne exigée par Better Auth.
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId), authFullAccess("account_auth")],
);

/** Jetons à usage unique (liens magiques), stockés hachés. */
export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier), authFullAccess("verification_auth")],
);

/** Passkey enregistrée par un utilisateur (clé publique seulement : la clé privée reste sur l'appareil). */
export const passkey = pgTable(
  "passkey",
  {
    id: uuid("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull().unique(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    aaguid: text("aaguid"),
    createdAt: timestamp("created_at", { withTimezone: true }),
  },
  (t) => [index("passkey_user_idx").on(t.userId), authFullAccess("passkey_auth")],
);
