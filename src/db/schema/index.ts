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
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  integer,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { JOIN_REQUEST_STATUSES } from "@/domain/join-requests";
import { EMAIL_AUDIENCES } from "@/domain/email-campaigns";
import { NOTIFICATION_STATUSES } from "@/domain/notifications";
import { ORDER_PERIOD_STATUSES } from "@/domain/order-periods";
import { CHILDREN_ORDERS, PAGE_ROLES, PAGE_STATUSES, type RichDoc } from "@/domain/pages";
import { REPORT_REASONS, REPORT_STATUSES } from "@/domain/reports";
import { ADMIN_TASK_KINDS } from "@/domain/admin-tasks";
import { DUTY_PLAN_STATUSES } from "@/domain/duty-plans";
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

/** L'utilisateur connecté est admin de l'AMAP courante (amap_role est filtrée par sa RLS). */
const isCurrentAmapAdmin = sql`exists (
  select 1 from amap_role where amap_role.user_id = ${currentUserId} and amap_role.role = 'admin'
)`;

/**
 * L'utilisateur connecté est admin ou référent de l'AMAP courante : l'équipe, qui voit les
 * foyers (story S13, ADR 0035).
 */
const isCurrentAmapStaff = sql`exists (
  select 1 from amap_role where amap_role.user_id = ${currentUserId}
    and amap_role.role in ('admin', 'referent')
)`;

/** Accès sans compte posé par le code serveur : « closing_job » ou « order_form_link ». */
const trustedAccess = sql`coalesce(current_setting('app.trusted', true), '')`;

/** L'utilisateur connecté est membre (non archivé) de ce foyer. */
const isMemberOf = (householdId: unknown) => sql`exists (
  select 1 from household_member
  where household_member.household_id = ${householdId}
    and household_member.user_id = ${currentUserId}
    and household_member.archived_at is null
)`;

/**
 * La personne (ligne de la table user) appartient à l'AMAP courante : elle y a un rôle, elle est
 * membre d'un foyer, ou elle a le compte d'un producteur qui livre l'AMAP. Les trois tables sont
 * filtrées par leur propre RLS.
 */
const isInCurrentAmap = sql`(
  exists (select 1 from amap_role where amap_role.user_id = "user"."id")
  or exists (select 1 from household_member where household_member.user_id = "user"."id")
  or exists (select 1 from producer_user where producer_user.user_id = "user"."id")
)`;

/** L'utilisateur connecté est référent du producteur dans l'AMAP courante (tables filtrées). */
const isReferentOf = (producerId: unknown) => sql`exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = ${producerId}
    and referent_assignment.user_id = ${currentUserId}
)`;

/** L'utilisateur connecté a un compte de ce producteur (table producer_user). */
const isProducerAccount = (producerId: unknown) => sql`exists (
  select 1 from producer_user
  where producer_user.producer_id = ${producerId} and producer_user.user_id = ${currentUserId}
)`;

/**
 * Peut modifier le catalogue de ce producteur dans l'AMAP courante (story C2) : son référent, ou
 * le producteur lui-même. Ni l'admin ni les familles.
 */
const isCatalogEditor = (producerId: unknown) =>
  sql`(${isReferentOf(producerId)} or ${isProducerAccount(producerId)})`;

/** Politiques d'écriture d'une table du catalogue, toutes avec la même condition. */
function editorPolicies(
  table: string,
  condition: SQL,
  operations: ReadonlyArray<"insert" | "update" | "delete">,
) {
  return operations.map((operation) =>
    pgPolicy(`${table}_${operation}`, {
      for: operation,
      ...(operation === "insert" ? {} : { using: condition }),
      ...(operation === "delete" ? {} : { withCheck: condition }),
    }),
  );
}

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
  orderReminderDays?: number; // rappel aux familles 2 jours avant la clôture (0 : aucun)
  /** Distribution habituelle (story D1) : jour (1 = lundi … 7 = dimanche) et horaires « HH:MM ». */
  distributionWeekday?: number;
  distributionStartTime?: string;
  distributionEndTime?: string;
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
    lastName: text("last_name").notNull().default(""),
    // Format international (+33…) : nécessaire pour les liens « Écrire sur Signal ».
    phone: text("phone"),
    // Noms de propriétés imposés par Better Auth (emailVerified, image).
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Application d'authentification (TOTP) activée : nom imposé par le plugin twoFactor.
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    // Mode choisi dans « Mon profil » (story A3), par exemple « hommesdeterre/referent » :
    // l'espace ouvert après la connexion. Ignoré s'il n'est plus un espace du compte.
    preferredSpace: text("preferred_space"),
    // AMAP courante de l'espace producteur (story C4) : le lien producteur–AMAP choisi dans la
    // liste de l'accueil. Gardé avec le compte, pour le retrouver sur un autre appareil. Vide,
    // ou lien qui n'est plus le sien : l'application prend la première AMAP de sa liste.
    currentAmapProducerId: uuid("current_amap_producer_id").references(
      (): AnyPgColumn => amapProducer.id,
      { onDelete: "set null" },
    ),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("user_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("user_phone_international", sql`${t.phone} ~ '^\\+[1-9][0-9]{6,14}$'`),
    // Lecture : soi-même, et les personnes de l'AMAP courante (un rôle, ou membre d'un
    // foyer). Les sous-requêtes sur amap_role et household_member sont elles-mêmes filtrées par
    // leur RLS : elles ne voient que l'AMAP courante.
    pgPolicy("user_select", {
      for: "select",
      using: sql`"user"."id" = ${currentUserId} or ${isInCurrentAmap}`,
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
    // Correction de l'email d'un membre par un admin de l'AMAP courante (story A1). Les
    // sous-requêtes sont filtrées par la RLS de leur table : elles ne voient que l'AMAP courante.
    // Le compte d'un gestionnaire de la plateforme ne peut pas être modifié ainsi.
    pgPolicy("user_update_by_amap_admin", {
      for: "update",
      using: sql`${isCurrentAmapAdmin} and ${isInCurrentAmap}
        and "user"."is_platform_admin" = false`,
      withCheck: sql`${isCurrentAmapAdmin} and ${isInCurrentAmap}
        and "user"."is_platform_admin" = false`,
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
    // Logo (fiche S11, ADR 0022) : adresse publique de l'image ré-encodée ; texte alternatif :
    // le nom de l'AMAP. Envoi prévu avec la fiche A4.
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
    // Modification : l'AMAP courante, par ses admins (S13). Création : aucune politique, donc
    // interdite au rôle applicatif ; elle passe par la fonction dédiée create_amap, réservée au
    // gestionnaire de la plateforme (story J1).
    pgPolicy("amap_update", {
      for: "update",
      using: sql`${t.id} = ${currentAmapId} and ${isCurrentAmapAdmin}`,
      withCheck: sql`${t.id} = ${currentAmapId} and ${isCurrentAmapAdmin}`,
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
    // Lecture : toute l'AMAP courante (savoir qui est admin, qui est référent). Écriture
    // (S13) : les admins seulement ; la création d'une AMAP passe par create_amap.
    ...scopedPolicies("amap_role", t.amapId, {
      select: sql`true`,
      insert: isCurrentAmapAdmin,
      update: isCurrentAmapAdmin,
      delete: isCurrentAmapAdmin,
    }),
    // Lecture seule pour la connexion : savoir si un compte est admin d'au moins une AMAP,
    // donc soumis à la deuxième vérification.
    pgPolicy("amap_role_auth_select", { for: "select", to: authRole, using: sql`true` }),
  ],
);

// --- household : foyer ----------------------------------------------------------------------
// L'unité qui commande et paie. Un foyer appartient à une seule AMAP : une personne membre de
// deux AMAP a deux foyers, rattachés au même compte (modèle de données, section 4).

export const household = pgTable(
  "household",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    name: text("name").notNull(), // « Foyer Martin »
    createdBy: uuid("created_by").references(() => user.id),
    archivedAt: archivedAt(),
    // Anonymisation RGPD (irréversible) : voir la fonction anonymize_household (migration 0009).
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Nom unique dans l'AMAP, sans tenir compte des majuscules, parmi les foyers non archivés :
    // un nom se libère quand son foyer est archivé.
    uniqueIndex("household_name_unique")
      .on(t.amapId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    // Cible de la clé étrangère composée de household_member (même AMAP garantie par la base).
    unique("household_amap_unique").on(t.id, t.amapId),
    check("household_name_not_blank", sql`length(trim(${t.name})) > 0`),
    // Lecture (S13) : ses membres, l'équipe (admins, référents), le producteur pour les foyers
    // qui lui ont commandé ou dont il attend un chèque (les tables order et cheque sont filtrées
    // par leur propre RLS), les accès de
    // confiance (S12). Jamais un visiteur anonyme. Écriture : les admins.
    ...scopedPolicies("household", t.amapId, {
      select: sql`(${isMemberOf(t.id)} or ${isCurrentAmapStaff}
        or exists (select 1 from "order" where "order".household_id = ${t.id})
        or exists (select 1 from cheque where cheque.household_id = ${t.id})
        or ${trustedAccess} <> '')`,
      insert: isCurrentAmapAdmin,
      update: isCurrentAmapAdmin,
    }),
  ],
);

// --- household_member : membre d'un foyer ----------------------------------------------------
// Rattache un compte à un foyer. amap_id est recopié du foyer (le modèle ne le prévoyait pas) :
// la Row Level Security peut ainsi isoler les AMAP sans jointure, comme pour toutes les tables.

export const householdMember = pgTable(
  "household_member",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    householdId: uuid("household_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    // Contact principal du foyer : un seul par foyer.
    isPrimary: boolean("is_primary").notNull().default(false),
    createdBy: uuid("created_by").references(() => user.id),
    // Recopié du foyer quand il est archivé : la personne peut alors rejoindre un autre foyer.
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Le foyer et le membre sont dans la même AMAP : garanti par la base.
    foreignKey({
      name: "household_member_household_fk",
      columns: [t.householdId, t.amapId],
      foreignColumns: [household.id, household.amapId],
    }),
    unique("household_member_unique").on(t.householdId, t.userId),
    // Une personne appartient à un seul foyer actif par AMAP.
    uniqueIndex("household_member_one_household_idx")
      .on(t.amapId, t.userId)
      .where(sql`${t.archivedAt} is null`),
    // Un seul contact principal par foyer.
    uniqueIndex("household_member_one_primary_idx")
      .on(t.householdId)
      .where(sql`${t.isPrimary}`),
    index("household_member_user_idx").on(t.userId),
    // Lecture (S13) : soi-même, les autres membres de son foyer (fonction my_household_ids,
    // migration 0036, pour éviter que la politique ne s'interroge elle-même), l'équipe, les
    // accès de confiance. Écriture : les admins.
    ...scopedPolicies("household_member", t.amapId, {
      select: sql`(${t.userId} = ${currentUserId}
        or ${t.householdId} in (select my_household_ids())
        or ${isCurrentAmapStaff} or ${trustedAccess} <> '')`,
      insert: isCurrentAmapAdmin,
      update: isCurrentAmapAdmin,
      delete: isCurrentAmapAdmin,
    }),
  ],
);

// --- membership : adhésion ------------------------------------------------------------------
// Adhésion d'un foyer pour une durée : jours de début et de fin inclus (story B1). Le statut
// (active, expire bientôt, expirée…) se calcule, il n'est jamais enregistré
// (domain/memberships.ts). Deux adhésions d'un même foyer ne se chevauchent pas : contrainte
// d'exclusion ajoutée à la main dans la migration (Drizzle ne sait pas la décrire, ADR 0017).
// Une adhésion saisie par erreur est archivée, jamais supprimée.

export const membership = pgTable(
  "membership",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    householdId: uuid("household_id").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    // Cotisation facultative, en centimes (pas de paiement en ligne : simple trace).
    feeCents: integer("fee_cents"),
    note: text("note").notNull().default(""),
    createdBy: uuid("created_by").references(() => user.id),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "membership_household_fk",
      columns: [t.householdId, t.amapId],
      foreignColumns: [household.id, household.amapId],
    }),
    check("membership_dates", sql`${t.endDate} > ${t.startDate}`),
    check("membership_fee", sql`${t.feeCents} is null or ${t.feeCents} >= 0`),
    index("membership_household_idx").on(t.householdId),
    // Lecture (S13) : le foyer, l'équipe, les accès de confiance. Écriture : les admins.
    ...scopedPolicies("membership", t.amapId, {
      select: sql`(${isMemberOf(t.householdId)} or ${isCurrentAmapStaff} or ${trustedAccess} <> '')`,
      insert: isCurrentAmapAdmin,
      update: isCurrentAmapAdmin,
    }),
  ],
);

// --- distribution : distribution ------------------------------------------------------------
// Une par semaine, le jour habituel de l'AMAP (story D1). Pas de lien direct avec la période de
// commande : une distribution appartient à la période de son mois (écart n°8, ADR 0012).

export const distribution = pgTable(
  "distribution",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    // Jour du calendrier, sans heure ni fuseau (« 2026-12-08 »).
    date: date("date", { mode: "string" }).notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    // Fermée (vacances, jour férié…) : n'apparaît ni dans les commandes ni sur l'émargement.
    isOpen: boolean("is_open").notNull().default(true),
    closedReason: text("closed_reason"),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("distribution_amap_date_unique").on(t.amapId, t.date),
    // Cible des clés étrangères composées (disponibilités du catalogue, même AMAP garantie).
    unique("distribution_amap_unique").on(t.id, t.amapId),
    check("distribution_times", sql`${t.startTime} < ${t.endTime}`),
    // Fermée = motif obligatoire ; ouverte = pas de motif. coalesce : sans lui, un motif NULL
    // rendrait la condition NULL, et PostgreSQL accepte une contrainte CHECK qui vaut NULL.
    check(
      "distribution_closed_reason",
      sql`(${t.isOpen} and ${t.closedReason} is null)
        or (not ${t.isOpen} and coalesce(length(trim(${t.closedReason})), 0) > 0)`,
    ),
    // Lecture : toute l'AMAP, visiteurs compris (calendrier, site public). Écriture (S13) : les
    // admins.
    ...scopedPolicies("distribution", t.amapId, {
      select: sql`true`,
      insert: isCurrentAmapAdmin,
      update: isCurrentAmapAdmin,
    }),
  ],
);

// --- producer : producteur ------------------------------------------------------------------
// Commun à la plateforme : un même producteur livre plusieurs AMAP, avec une seule fiche
// (modèle de données, section 5). Ses réglages propres à une AMAP sont dans amap_producer.

export const producer = pgTable(
  "producer",
  {
    id: id(),
    name: text("name").notNull(),
    category: text("category").notNull().default(""), // « Produits laitiers »
    shortDescription: text("short_description").notNull().default(""),
    description: text("description").notNull().default(""),
    // Format international (+33…), comme pour les comptes : liens « Appeler » et Signal.
    phone: text("phone"),
    email: text("email"),
    // Photo (fiche S11, ADR 0022) : adresse publique de l'image ré-encodée dans le stockage
    // objet, et son texte alternatif (vide : « Photo de <nom> » à l'affichage).
    photoUrl: text("photo_url"),
    photoAlt: text("photo_alt").notNull().default(""),
    createdBy: uuid("created_by").references(() => user.id),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("producer_name_not_blank", sql`length(trim(${t.name})) > 0`),
    check("producer_phone_international", sql`${t.phone} ~ '^\\+[1-9][0-9]{6,14}$'`),
    check("producer_email_lowercase", sql`${t.email} = lower(${t.email})`),
    // Lecture : les producteurs de l'AMAP courante (amap_producer est filtrée par sa RLS). Pour
    // retrouver un producteur d'une autre AMAP, voir la fonction search_producers (migration).
    // Lecture aussi par le producteur lui-même (son compte, table producer_user).
    pgPolicy("producer_select", {
      for: "select",
      using: sql`exists (select 1 from amap_producer where amap_producer.producer_id = ${t.id})
        or exists (select 1 from producer_user where producer_user.producer_id = ${t.id}
          and producer_user.user_id = ${currentUserId})`,
    }),
    // Création et modification : un admin de l'AMAP courante ; modification seulement d'un
    // producteur de cette AMAP. La fiche étant commune, une modification vaut pour toutes les
    // AMAP du producteur (ADR 0011).
    pgPolicy("producer_insert", { for: "insert", withCheck: isCurrentAmapAdmin }),
    pgPolicy("producer_update", {
      for: "update",
      using: sql`${isCurrentAmapAdmin}
        and exists (select 1 from amap_producer where amap_producer.producer_id = ${t.id})`,
      withCheck: sql`${isCurrentAmapAdmin}
        and exists (select 1 from amap_producer where amap_producer.producer_id = ${t.id})`,
    }),
    // Modification aussi par un référent de ce producteur dans l'AMAP courante (écran R5) :
    // referent_assignment et amap_producer sont filtrées par leur RLS.
    pgPolicy("producer_update_by_referent", {
      for: "update",
      using: sql`${isReferentOf(t.id)}`,
      withCheck: sql`${isReferentOf(t.id)}`,
    }),
  ],
);

// --- product : fiche produit ----------------------------------------------------------------
// Commune au producteur, donc à toutes ses AMAP (modèle de données, section 5). Le nom contient
// le conditionnement (« Œufs, boîte de 6 ») : un seul champ, comme à l'écran (décision du
// 2026-11-15). Le prix et la disponibilité sont propres à chaque AMAP et à chaque mois.

export const product = pgTable(
  "product",
  {
    id: id(),
    producerId: uuid("producer_id")
      .notNull()
      .references(() => producer.id),
    name: text("name").notNull(),
    // Photo (fiche S11, ADR 0022), comme celle du producteur ; envoi prévu avec les fiches produit.
    photoUrl: text("photo_url"),
    photoAlt: text("photo_alt").notNull().default(""),
    createdBy: uuid("created_by").references(() => user.id),
    // Produit qui n'est plus fabriqué du tout (C3) ; il reste lisible dans les catalogues passés.
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("product_name_not_blank", sql`length(trim(${t.name})) > 0`),
    index("product_producer_idx").on(t.producerId),
    // Lecture : produits d'un producteur qui livre l'AMAP courante, ou de son propre producteur.
    pgPolicy("product_select", {
      for: "select",
      using: sql`exists (select 1 from amap_producer where amap_producer.producer_id = ${t.producerId})
        or ${isProducerAccount(t.producerId)}`,
    }),
    // Création et modification : le référent du producteur dans l'AMAP courante, ou le
    // producteur lui-même. La fiche étant commune, une modification vaut pour toutes ses AMAP.
    pgPolicy("product_insert", { for: "insert", withCheck: isCatalogEditor(t.producerId) }),
    // Reprise des données (story K1, ADR 0044) : un admin crée les produits d'un producteur de
    // son AMAP. Création seulement ; la modification reste au référent et au producteur.
    pgPolicy("product_insert_by_admin", {
      for: "insert",
      withCheck: sql`${isCurrentAmapAdmin}
        and exists (select 1 from amap_producer where amap_producer.producer_id = ${t.producerId})`,
    }),
    pgPolicy("product_update", {
      for: "update",
      using: isCatalogEditor(t.producerId),
      withCheck: isCatalogEditor(t.producerId),
    }),
  ],
);

// --- catalog : catalogue du mois -------------------------------------------------------------
// Un par AMAP, producteur et mois. Rattaché à son MOIS, comme les distributions (ADR 0012), et
// non à une période de commande. Brouillon tant qu'il n'est pas publié (publication : C3).

export const catalogStatus = pgEnum("catalog_status", ["draft", "published"]);

export const catalog = pgTable(
  "catalog",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    producerId: uuid("producer_id")
      .notNull()
      .references(() => producer.id),
    // Premier jour du mois (« 2026-12-01 »).
    month: date("month", { mode: "string" }).notNull(),
    status: catalogStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("catalog_unique").on(t.amapId, t.producerId, t.month),
    unique("catalog_amap_unique").on(t.id, t.amapId),
    check("catalog_month_first_day", sql`extract(day from ${t.month}) = 1`),
    // Lecture : toute l'AMAP courante (les familles liront les catalogues publiés, D3 ; le
    // masquage des brouillons est fait par l'application). Écriture : création et
    // modification par le référent ou le producteur ; jamais de suppression.
    pgPolicy("catalog_select", { for: "select", using: sql`${t.amapId} = ${currentAmapId}` }),
    ...editorPolicies(
      "catalog",
      sql`${t.amapId} = ${currentAmapId} and ${isCatalogEditor(t.producerId)}`,
      ["insert", "update"],
    ),
  ],
);

/** L'utilisateur peut modifier le catalogue de cette ligne (jointure sur catalog, filtrée). */
const isEditorOfCatalog = (catalogId: unknown) => sql`exists (
  select 1 from catalog where catalog.id = ${catalogId} and ${isCatalogEditor(sql`catalog.producer_id`)}
)`;

// --- catalog_item : produit au catalogue -----------------------------------------------------

export const catalogItem = pgTable(
  "catalog_item",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    catalogId: uuid("catalog_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    priceCents: integer("price_cents").notNull(),
    // Minimum de commande : possible techniquement, jamais affiché (cahier des charges).
    minQuantity: integer("min_quantity"),
    position: integer("position").notNull().default(0),
    // Retiré de CE catalogue (« Produits retirés ») : la fiche produit, commune, n'est pas
    // touchée, et les autres AMAP non plus (décision du 2026-11-16).
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "catalog_item_catalog_fk",
      columns: [t.catalogId, t.amapId],
      foreignColumns: [catalog.id, catalog.amapId],
    }),
    unique("catalog_item_unique").on(t.catalogId, t.productId),
    unique("catalog_item_amap_unique").on(t.id, t.amapId),
    check("catalog_item_price_positive", sql`${t.priceCents} > 0`),
    check("catalog_item_min_quantity", sql`${t.minQuantity} is null or ${t.minQuantity} > 0`),
    pgPolicy("catalog_item_select", {
      for: "select",
      using: sql`${t.amapId} = ${currentAmapId}`,
    }),
    ...editorPolicies(
      "catalog_item",
      sql`${t.amapId} = ${currentAmapId} and ${isEditorOfCatalog(t.catalogId)}`,
      ["insert", "update"],
    ),
  ],
);

// --- catalog_item_availability : disponibilité -----------------------------------------------
// Une ligne = ce produit est disponible à cette distribution.

export const catalogItemAvailability = pgTable(
  "catalog_item_availability",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    catalogItemId: uuid("catalog_item_id").notNull(),
    distributionId: uuid("distribution_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "catalog_item_availability_item_fk",
      columns: [t.catalogItemId, t.amapId],
      foreignColumns: [catalogItem.id, catalogItem.amapId],
    }).onDelete("cascade"),
    foreignKey({
      name: "catalog_item_availability_distribution_fk",
      columns: [t.distributionId, t.amapId],
      foreignColumns: [distribution.id, distribution.amapId],
    }),
    unique("catalog_item_availability_unique").on(t.catalogItemId, t.distributionId),
    pgPolicy("catalog_item_availability_select", {
      for: "select",
      using: sql`${t.amapId} = ${currentAmapId}`,
    }),
    ...editorPolicies(
      "catalog_item_availability",
      sql`${t.amapId} = ${currentAmapId} and exists (
        select 1 from catalog_item where catalog_item.id = ${t.catalogItemId}
          and ${isEditorOfCatalog(sql`catalog_item.catalog_id`)})`,
      ["insert", "delete"],
    ),
  ],
);

/**
 * Politiques d'une table de l'AMAP, une condition par opération (story S13, ADR 0035), toujours
 * en plus de « dans l'AMAP courante ». Une opération absente est interdite au rôle de
 * l'application (pas de politique = refus).
 */
function scopedPolicies(
  table: string,
  amapId: unknown,
  conditions: Partial<Record<"select" | "insert" | "update" | "delete", SQL>>,
) {
  const inAmap = sql`${amapId} = ${currentAmapId}`;
  return (
    Object.entries(conditions) as Array<["select" | "insert" | "update" | "delete", SQL]>
  ).map(([operation, condition]) => {
    const full = sql`${inAmap} and ${condition}`;
    return pgPolicy(`${table}_${operation}`, {
      for: operation,
      ...(operation === "insert" ? {} : { using: full }),
      ...(operation === "select" || operation === "delete" ? {} : { withCheck: full }),
    });
  });
}

// --- order_period : période de commande -----------------------------------------------------
// Une par mois et par AMAP, commune à tous les producteurs (story D2, ADR 0015). L'admin fixe
// des jours ; on garde les instants exacts (0 h à l'ouverture, minuit à la clôture, Paris).
// status suit les passages faits par la tâche planifiée ou par l'admin ; entre deux passages,
// l'heure fait foi (domain/order-periods.ts, effectiveStatus).

export const orderPeriodStatus = pgEnum("order_period_status", ORDER_PERIOD_STATUSES);

export const orderPeriod = pgTable(
  "order_period",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    // Premier jour du mois commandé (« 2026-12-01 »).
    month: date("month", { mode: "string" }).notNull(),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    status: orderPeriodStatus("status").notNull().default("scheduled"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("order_period_month_unique").on(t.amapId, t.month),
    unique("order_period_amap_unique").on(t.id, t.amapId),
    check("order_period_month_first_day", sql`extract(day from ${t.month}) = 1`),
    check("order_period_dates", sql`${t.opensAt} < ${t.closesAt}`),
    // Lecture par toute l'AMAP (accueil des familles) ; écriture réservée aux admins par
    // requireRole, ou faite par la tâche planifiée. Jamais supprimée.
    // Lecture : toute l'AMAP. Écriture (S13) : les admins, et la tâche horaire qui ouvre et
    // clôture les périodes (accès de confiance « closing_job »).
    ...scopedPolicies("order_period", t.amapId, {
      select: sql`true`,
      insert: isCurrentAmapAdmin,
      update: sql`(${isCurrentAmapAdmin} or ${trustedAccess} = 'closing_job')`,
    }),
  ],
);

// --- Isolation des commandes par foyer (fiche S12, ADR 0021) --------------------------------
// Dans l'AMAP courante, une commande, ses lignes et ses chèques ne sont visibles que :
// - du foyer lui-même (un membre non archivé) ;
// - des admins de l'AMAP ;
// - du référent du producteur, et du compte du producteur (lecture seule pour lui) ;
// - d'un accès « de confiance » sans compte connecté, posé explicitement par le code serveur :
//   la tâche horaire de clôture et le lien signé du bon de commande (app.trusted, voir
//   src/db/context.ts). Un visiteur anonyme des pages publiques n'a rien de tout cela.

/** Producteur du catalogue de la commande, via la table catalog (filtrée par sa RLS). */
const catalogProducerMatches = (catalogId: unknown, test: (producerId: SQL) => SQL) => sql`exists (
  select 1 from catalog where catalog.id = ${catalogId} and ${test(sql`catalog.producer_id`)}
)`;

/** Peut écrire dans une commande : le foyer, un admin, ou le référent du producteur (D7). */
const canWriteOrder = (householdId: unknown, catalogId: unknown) =>
  sql`(${isMemberOf(householdId)} or ${isCurrentAmapAdmin}
    or ${catalogProducerMatches(catalogId, isReferentOf)})`;

/** Peut lire une commande : ceux qui l'écrivent, le compte du producteur, un accès de confiance. */
const canReadOrder = (householdId: unknown, catalogId: unknown) =>
  sql`(${canWriteOrder(householdId, catalogId)}
    or ${catalogProducerMatches(catalogId, isProducerAccount)} or ${trustedAccess} <> '')`;

/** Politiques d'une table de commande : l'AMAP courante, puis la condition de lecture ou d'écriture. */
function orderPolicies(
  table: string,
  amapId: unknown,
  read: SQL,
  write: SQL,
  operations: ReadonlyArray<"select" | "insert" | "update" | "delete">,
) {
  const inAmap = sql`${amapId} = ${currentAmapId}`;
  return operations.map((operation) => {
    const condition = sql`${inAmap} and ${operation === "select" ? read : write}`;
    return pgPolicy(`${table}_${operation}`, {
      for: operation,
      ...(operation === "insert" ? {} : { using: condition }),
      ...(operation === "select" || operation === "delete" ? {} : { withCheck: condition }),
    });
  });
}

// --- order : commande -------------------------------------------------------------------------
// Pour un foyer, les lignes d'un catalogue (donc d'un producteur et d'un mois). Saisie : D3.

export const order = pgTable(
  "order",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    householdId: uuid("household_id").notNull(),
    catalogId: uuid("catalog_id").notNull(),
    // « Rien ce mois-ci » chez ce producteur : choix explicite du foyer (story D3), effacé dès
    // qu'une quantité est saisie. Sans ce choix ni quantité : producteur « à compléter ».
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => user.id),
    updatedBy: uuid("updated_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "order_household_fk",
      columns: [t.householdId, t.amapId],
      foreignColumns: [household.id, household.amapId],
    }),
    foreignKey({
      name: "order_catalog_fk",
      columns: [t.catalogId, t.amapId],
      foreignColumns: [catalog.id, catalog.amapId],
    }),
    unique("order_household_catalog_unique").on(t.householdId, t.catalogId),
    unique("order_amap_unique").on(t.id, t.amapId),
    index("order_catalog_idx").on(t.catalogId),
    // Qui peut voir ou modifier quelle commande : voir plus haut (S12).
    ...orderPolicies(
      "order",
      t.amapId,
      canReadOrder(t.householdId, t.catalogId),
      canWriteOrder(t.householdId, t.catalogId),
      ["select", "insert", "update"],
    ),
  ],
);

// --- order_line : ligne de commande -----------------------------------------------------------
// Une quantité d'un produit du catalogue pour une distribution. Le prix est gardé au moment de
// la commande (décision du 2026-11-15, ADR 0015) : un nouveau prix au catalogue ne touche pas
// les commandes déjà enregistrées.

export const orderLine = pgTable(
  "order_line",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    orderId: uuid("order_id").notNull(),
    catalogItemId: uuid("catalog_item_id").notNull(),
    distributionId: uuid("distribution_id").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "order_line_order_fk",
      columns: [t.orderId, t.amapId],
      foreignColumns: [order.id, order.amapId],
    }),
    foreignKey({
      name: "order_line_catalog_item_fk",
      columns: [t.catalogItemId, t.amapId],
      foreignColumns: [catalogItem.id, catalogItem.amapId],
    }),
    foreignKey({
      name: "order_line_distribution_fk",
      columns: [t.distributionId, t.amapId],
      foreignColumns: [distribution.id, distribution.amapId],
    }),
    unique("order_line_unique").on(t.orderId, t.catalogItemId, t.distributionId),
    check("order_line_quantity", sql`${t.quantity} >= 0`),
    check("order_line_price_positive", sql`${t.unitPriceCents} > 0`),
    // Les droits de la commande de la ligne (S12) : la table order est lue avec sa propre RLS.
    ...orderPolicies(
      "order_line",
      t.amapId,
      sql`exists (select 1 from "order" where "order".id = ${t.orderId})`,
      sql`exists (
        select 1 from "order" where "order".id = ${t.orderId}
          and ${canWriteOrder(sql`"order".household_id`, sql`"order".catalog_id`)}
      )`,
      ["select", "insert", "update", "delete"],
    ),
  ],
);

// --- cheque : chèque attendu, puis reçu et remis --------------------------------------------
// Un par foyer, producteur et période. Créé à la clôture avec son montant attendu (total
// commandé − avoirs, jamais négatif), complété au pointage (F1) et à la remise (F3). Un chèque
// qui n'a plus de commande après une réouverture est archivé, jamais supprimé.

export const chequeStatus = pgEnum("cheque_status", ["expected", "received", "handed_over"]);

export const cheque = pgTable(
  "cheque",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    householdId: uuid("household_id").notNull(),
    producerId: uuid("producer_id")
      .notNull()
      .references(() => producer.id),
    orderPeriodId: uuid("order_period_id").notNull(),
    grossCents: integer("gross_cents").notNull(),
    creditsCents: integer("credits_cents").notNull().default(0),
    expectedCents: integer("expected_cents").notNull(),
    status: chequeStatus("status").notNull().default("expected"),
    receivedCents: integer("received_cents"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivedBy: uuid("received_by").references(() => user.id),
    handedOverAt: timestamp("handed_over_at", { withTimezone: true }),
    handedOverBy: uuid("handed_over_by").references(() => user.id),
    // Facultatif ; ni émetteur ni banque (décision du 2026-11-04).
    chequeNumber: text("cheque_number"),
    // Écart (reçu ≠ attendu) traité par le référent : complément reçu, avoir prévu… (F1). Tant
    // que ces colonnes sont vides, l'écart reste signalé.
    gapSettledAt: timestamp("gap_settled_at", { withTimezone: true }),
    gapSettledBy: uuid("gap_settled_by").references(() => user.id),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "cheque_household_fk",
      columns: [t.householdId, t.amapId],
      foreignColumns: [household.id, household.amapId],
    }),
    foreignKey({
      name: "cheque_order_period_fk",
      columns: [t.orderPeriodId, t.amapId],
      foreignColumns: [orderPeriod.id, orderPeriod.amapId],
    }),
    unique("cheque_unique").on(t.householdId, t.producerId, t.orderPeriodId),
    unique("cheque_amap_unique").on(t.id, t.amapId),
    index("cheque_period_idx").on(t.orderPeriodId),
    check(
      "cheque_amounts",
      sql`${t.grossCents} >= 0 and ${t.creditsCents} >= 0
        and ${t.expectedCents} = ${t.grossCents} - ${t.creditsCents} and ${t.expectedCents} >= 0`,
    ),
    check("cheque_received_cents", sql`${t.receivedCents} is null or ${t.receivedCents} >= 0`),
    // Journal financier : jamais supprimé (pas de politique DELETE). Lecture : le foyer, l'admin,
    // le référent et le compte du producteur, un accès de confiance (S12). Écriture : la clôture
    // (admin ou tâche horaire) et le pointage (référent du producteur ou admin, F1).
    ...orderPolicies(
      "cheque",
      t.amapId,
      sql`(${isMemberOf(t.householdId)} or ${isCurrentAmapAdmin} or ${isReferentOf(t.producerId)}
        or ${isProducerAccount(t.producerId)} or ${trustedAccess} <> '')`,
      sql`(${isCurrentAmapAdmin} or ${isReferentOf(t.producerId)}
        or ${trustedAccess} = 'closing_job')`,
      ["select", "insert", "update"],
    ),
  ],
);

// --- report : signalement ------------------------------------------------------------------
// Un produit manquant ou abîmé sur une ligne de commande d'une distribution passée (story F5,
// ADR 0024). Signalé par la famille, ou par l'admin d'après la feuille d'émargement ; traité par
// le référent du producteur ou un admin : avoir (F2) ou rejet. Jamais supprimé.

export const reportReason = pgEnum("report_reason", REPORT_REASONS);
export const reportSource = pgEnum("report_source", ["family", "admin"]);
export const reportStatus = pgEnum("report_status", REPORT_STATUSES);

/** Le référent du producteur de cette ligne de commande (via sa commande et son catalogue). */
const isReferentOfLine = (orderLineId: unknown) => sql`exists (
  select 1 from order_line
  join "order" on "order".id = order_line.order_id
  where order_line.id = ${orderLineId}
    and ${catalogProducerMatches(sql`"order".catalog_id`, isReferentOf)}
)`;

export const report = pgTable(
  "report",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    householdId: uuid("household_id").notNull(),
    orderLineId: uuid("order_line_id")
      .notNull()
      .references(() => orderLine.id),
    quantity: integer("quantity").notNull(),
    reason: reportReason("reason").notNull(),
    comment: text("comment").notNull().default(""),
    source: reportSource("source").notNull(),
    status: reportStatus("status").notNull().default("open"),
    // Décision : qui, quand, et pourquoi en cas de rejet (montré à la famille).
    decisionNote: text("decision_note").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => user.id),
    createdBy: uuid("created_by").references(() => user.id),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "report_household_fk",
      columns: [t.householdId, t.amapId],
      foreignColumns: [household.id, household.amapId],
    }),
    index("report_open_idx")
      .on(t.amapId)
      .where(sql`${t.status} = 'open'`),
    index("report_order_line_idx").on(t.orderLineId),
    check("report_quantity_positive", sql`${t.quantity} > 0`),
    check(
      "report_other_needs_comment",
      sql`${t.reason} <> 'other' or length(trim(${t.comment})) > 0`,
    ),
    check("report_decided", sql`(${t.status} = 'open') = (${t.decidedAt} is null)`),
    // Lecture : le foyer, un admin, le référent du producteur (pas le producteur lui-même).
    pgPolicy("report_select", {
      for: "select",
      using: sql`${t.amapId} = ${currentAmapId} and (${isMemberOf(t.householdId)}
        or ${isCurrentAmapAdmin} or ${isReferentOfLine(t.orderLineId)})`,
    }),
    // Création : la famille pour son foyer (ouvert, en son nom), ou un admin (feuille
    // d'émargement).
    pgPolicy("report_insert", {
      for: "insert",
      withCheck: sql`${t.amapId} = ${currentAmapId} and (${isCurrentAmapAdmin}
        or (${isMemberOf(t.householdId)} and ${t.source} = 'family' and ${t.status} = 'open'
          and ${t.createdBy} = ${currentUserId}))`,
    }),
    // Décision : le référent du producteur ou un admin.
    pgPolicy("report_update", {
      for: "update",
      using: sql`${t.amapId} = ${currentAmapId} and (${isCurrentAmapAdmin}
        or ${isReferentOfLine(t.orderLineId)})`,
      withCheck: sql`${t.amapId} = ${currentAmapId} and (${isCurrentAmapAdmin}
        or ${isReferentOfLine(t.orderLineId)})`,
    }),
  ],
);

// --- credit : avoir ---------------------------------------------------------------------------
// Montant dû à un foyer par un producteur (produit manquant ou abîmé, F2). En attente (created)
// jusqu'à la clôture suivante où le foyer commande chez ce producteur : il est alors déduit de
// ce chèque (deducted). Créé à partir d'un signalement (F2, ADR 0025).

export const creditStatus = pgEnum("credit_status", ["created", "deducted"]);

export const credit = pgTable(
  "credit",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    householdId: uuid("household_id").notNull(),
    producerId: uuid("producer_id")
      .notNull()
      .references(() => producer.id),
    amountCents: integer("amount_cents").notNull(),
    status: creditStatus("status").notNull().default("created"),
    deductedOnChequeId: uuid("deducted_on_cheque_id"),
    // Reste d'un avoir déduit en partie (plus grand que la commande) : avoir d'origine.
    splitFromCreditId: uuid("split_from_credit_id"),
    // Signalement d'où vient l'avoir (story F2) ; vide pour le reste d'un avoir partagé.
    reportId: uuid("report_id").references(() => report.id),
    createdBy: uuid("created_by").references(() => user.id),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "credit_household_fk",
      columns: [t.householdId, t.amapId],
      foreignColumns: [household.id, household.amapId],
    }),
    foreignKey({
      name: "credit_cheque_fk",
      columns: [t.deductedOnChequeId, t.amapId],
      foreignColumns: [cheque.id, cheque.amapId],
    }),
    foreignKey({
      name: "credit_split_from_fk",
      columns: [t.splitFromCreditId],
      foreignColumns: [t.id],
    }),
    index("credit_pending_idx")
      .on(t.householdId, t.producerId)
      .where(sql`${t.status} = 'created'`),
    check("credit_amount_positive", sql`${t.amountCents} > 0`),
    // Déduit ⇔ rattaché à un chèque. coalesce inutile : les deux côtés sont des booléens non NULL.
    check(
      "credit_deducted_on_cheque",
      sql`(${t.status} = 'deducted') = (${t.deductedOnChequeId} is not null)`,
    ),
    // Un seul avoir par signalement.
    uniqueIndex("credit_report_unique").on(t.reportId),
    // Comme les chèques (S12) : lu par le foyer, l'admin, le référent et le compte du producteur,
    // la tâche de clôture ; écrit par l'admin, le référent du producteur (F2) et la clôture.
    ...orderPolicies(
      "credit",
      t.amapId,
      sql`(${isMemberOf(t.householdId)} or ${isCurrentAmapAdmin} or ${isReferentOf(t.producerId)}
        or ${isProducerAccount(t.producerId)} or ${trustedAccess} <> '')`,
      sql`(${isCurrentAmapAdmin} or ${isReferentOf(t.producerId)}
        or ${trustedAccess} = 'closing_job')`,
      ["select", "insert", "update"],
    ),
  ],
);

// --- producer_user : compte producteur ------------------------------------------------------
// Rattache un compte Pomme à un producteur (un producteur peut avoir plusieurs comptes). Commun
// à la plateforme, comme le producteur : un seul compte pour toutes les AMAP qu'il livre.

export const producerUser = pgTable(
  "producer_user",
  {
    id: id(),
    producerId: uuid("producer_id")
      .notNull()
      .references(() => producer.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("producer_user_unique").on(t.producerId, t.userId),
    index("producer_user_user_idx").on(t.userId),
    // Lecture : comptes des producteurs qui livrent l'AMAP courante, et son propre compte.
    pgPolicy("producer_user_select", {
      for: "select",
      using: sql`${t.userId} = ${currentUserId}
        or exists (select 1 from amap_producer where amap_producer.producer_id = ${t.producerId})`,
    }),
    // Invitation : un admin de l'AMAP courante, pour un producteur qui la livre.
    pgPolicy("producer_user_insert", {
      for: "insert",
      withCheck: sql`${isCurrentAmapAdmin}
        and exists (select 1 from amap_producer where amap_producer.producer_id = ${t.producerId})`,
    }),
  ],
);

// --- amap_producer : producteur dans l'AMAP --------------------------------------------------

export const amapProducer = pgTable(
  "amap_producer",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    producerId: uuid("producer_id")
      .notNull()
      .references(() => producer.id),
    // Ordre des chèques : le nom exact à écrire sur le chèque (« Payable à … »).
    checkPayee: text("check_payee").notNull().default(""),
    distanceKm: integer("distance_km"),
    // Inactif : ne livre plus pour l'instant (pas de catalogue), mais reste dans la liste.
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => user.id),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("amap_producer_unique").on(t.amapId, t.producerId),
    // Cible de la clé étrangère composée de referent_assignment.
    unique("amap_producer_amap_unique").on(t.id, t.amapId),
    check(
      "amap_producer_distance",
      sql`${t.distanceKm} is null or ${t.distanceKm} between 0 and 1000`,
    ),
    index("amap_producer_producer_idx").on(t.producerId),
    // Lecture : toute l'AMAP, visiteurs compris (producteurs du site public). Écriture (S13) :
    // les admins ; le référent du producteur change aussi l'ordre de ses chèques (C1).
    ...scopedPolicies("amap_producer", t.amapId, {
      select: sql`true`,
      insert: isCurrentAmapAdmin,
      // Pas isReferentOf : sa sous-requête joint amap_producer, et ce nom y désignerait la table
      // de la sous-requête, pas la ligne vérifiée. On compare directement à son identifiant.
      update: sql`(${isCurrentAmapAdmin} or exists (
        select 1 from referent_assignment
        where referent_assignment.amap_producer_id = ${t.id}
          and referent_assignment.user_id = ${currentUserId}
      ))`,
    }),
  ],
);

// --- referent_assignment : référent d'un producteur ------------------------------------------
// amap_id recopié (le modèle ne le prévoyait pas) : isolation par la RLS sans jointure, et clé
// étrangère composée pour garantir que l'affectation et le producteur sont dans la même AMAP.
// Le rôle « referent » de la personne est vérifié par l'application (src/server/producers.ts).

export const referentAssignment = pgTable(
  "referent_assignment",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    amapProducerId: uuid("amap_producer_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "referent_assignment_amap_producer_fk",
      columns: [t.amapProducerId, t.amapId],
      foreignColumns: [amapProducer.id, amapProducer.amapId],
    }),
    unique("referent_assignment_unique").on(t.amapProducerId, t.userId),
    index("referent_assignment_user_idx").on(t.userId),
    // Lecture : toute l'AMAP (les politiques des commandes et des chèques s'en servent).
    // Écriture (S13) : les admins.
    ...scopedPolicies("referent_assignment", t.amapId, {
      select: sql`true`,
      insert: isCurrentAmapAdmin,
      delete: isCurrentAmapAdmin,
    }),
  ],
);

// --- admin_task : tâche « À suivre » du tableau de bord ----------------------------------------
// Rappel pour les admins, créé par l'application à un moment précis (distribution fermée,
// signalement reporté de la feuille d'émargement…) et coché à la main (story H3, ADR 0030). Les
// tâches « Bloquant », elles, se calculent à l'affichage et ne sont jamais enregistrées. Une seule
// tâche par sujet (kind, related_id) : pas de doublon. Le texte n'est pas stocké : il se compose
// à l'affichage, en français, à partir de `details` (fr.json).

export const adminTaskKind = pgEnum("admin_task_kind", ADMIN_TASK_KINDS);

export const adminTask = pgTable(
  "admin_task",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    kind: adminTaskKind("kind").notNull(),
    // Ce dont parle la tâche : distribution, signalement… (selon kind).
    relatedId: uuid("related_id").notNull(),
    // Valeurs affichées dans le texte de la tâche (date, motif, producteur…).
    details: jsonb("details").notNull().default({}),
    dueDate: date("due_date", { mode: "string" }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: uuid("done_by").references(() => user.id),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("admin_task_subject_unique").on(t.amapId, t.kind, t.relatedId),
    check("admin_task_done", sql`(${t.doneAt} is null) = (${t.doneBy} is null)`),
    // Réservé aux admins de l'AMAP courante. Jamais supprimée : archivée.
    ...orderPolicies("admin_task", t.amapId, isCurrentAmapAdmin, isCurrentAmapAdmin, [
      "select",
      "insert",
      "update",
    ]),
  ],
);

// --- page : page du site public -------------------------------------------------------------
// Un seul type de contenu (story H2, ADR 0033) : la page, avec un seul niveau de sous-pages (le
// blog est une page principale dont les sous-pages sont les billets). Brouillon, publiée ou
// dépubliée : jamais supprimée. Accueil et mentions légales obligatoires (role). Le texte est
// gardé au format de l'éditeur (JSON), déjà nettoyé par le serveur (domain/pages, cleanRichText).

export const pageStatus = pgEnum("page_status", PAGE_STATUSES);
export const pageRole = pgEnum("page_role", PAGE_ROLES);
export const pageChildrenOrder = pgEnum("page_children_order", CHILDREN_ORDERS);

export const page = pgTable(
  "page",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    // Page principale à laquelle elle appartient ; vide pour une page principale.
    parentId: uuid("parent_id"),
    // Accueil ou mentions légales : une de chaque par AMAP, toujours principales.
    role: pageRole("role"),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    // Résumé : liste des sous-pages, accueil, description de partage par défaut.
    summary: text("summary").notNull().default(""),
    body: jsonb("body").$type<RichDoc>().notNull().default({ type: "doc", content: [] }),
    imageUrl: text("image_url"),
    imageAlt: text("image_alt").notNull().default(""),
    status: pageStatus("status").notNull().default("draft"),
    publishedOn: date("published_on", { mode: "string" }),
    // Menu du site : pages principales seulement, dans l'ordre de menu_position.
    inMenu: boolean("in_menu").notNull().default(false),
    menuPosition: integer("menu_position").notNull().default(0),
    // Ordre des sous-pages : par date (blog) ou manuel (position).
    childrenOrder: pageChildrenOrder("children_order").notNull().default("date_desc"),
    position: integer("position").notNull().default(0),
    // Partage (Open Graph) et référencement ; vides, ils reprennent le titre et le résumé.
    ogTitle: text("og_title").notNull().default(""),
    ogDescription: text("og_description").notNull().default(""),
    createdBy: uuid("created_by").references(() => user.id),
    updatedBy: uuid("updated_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("page_amap_unique").on(t.id, t.amapId),
    foreignKey({
      name: "page_parent_fk",
      columns: [t.parentId, t.amapId],
      foreignColumns: [t.id, t.amapId],
    }),
    // Une adresse par niveau : deux pages principales (parent vide) ne partagent pas une adresse.
    unique("page_slug_unique").on(t.amapId, t.parentId, t.slug).nullsNotDistinct(),
    uniqueIndex("page_role_unique")
      .on(t.amapId, t.role)
      .where(sql`${t.role} is not null`),
    check("page_role_top_level", sql`${t.role} is null or ${t.parentId} is null`),
    check("page_not_own_parent", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    check("page_published_date", sql`${t.status} <> 'published' or ${t.publishedOn} is not null`),
    index("page_parent_idx").on(t.parentId),
    // Lecture : les pages publiées, par tout le monde (site public) ; les autres, par les admins
    // de l'AMAP. Écriture : les admins. Pas de suppression (dépublier).
    ...orderPolicies(
      "page",
      t.amapId,
      sql`(${t.status} = 'published' or ${isCurrentAmapAdmin})`,
      isCurrentAmapAdmin,
      ["select", "insert", "update"],
    ),
  ],
);

// --- page_redirect : ancienne adresse d'une page -------------------------------------------
// Adresse changée après publication : l'ancienne mène à la page (redirection 301, story H2).

export const pageRedirect = pgTable(
  "page_redirect",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    pageId: uuid("page_id").notNull(),
    // Chemin sous l'adresse de l'AMAP : « /blog/ancienne-adresse ».
    fromPath: text("from_path").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "page_redirect_page_fk",
      columns: [t.pageId, t.amapId],
      foreignColumns: [page.id, page.amapId],
    }),
    unique("page_redirect_path_unique").on(t.amapId, t.fromPath),
    // Lecture par tout le monde (site public) ; écriture et suppression par les admins (une page
    // qui reprend une ancienne adresse retire la redirection).
    ...orderPolicies("page_redirect", t.amapId, sql`true`, isCurrentAmapAdmin, [
      "select",
      "insert",
      "update",
      "delete",
    ]),
  ],
);

// --- join_request : demande d'adhésion ---------------------------------------------------------
// Envoyée par un visiteur depuis « Nous rejoindre » (story B2, ADR 0034). Un administrateur
// écrit ou appelle, puis l'accepte (le foyer est créé : household_id) ou la refuse. Jamais
// supprimée : une demande close reste dans l'historique.

export const joinRequestStatus = pgEnum("join_request_status", JOIN_REQUEST_STATUSES);

export const joinRequest = pgTable(
  "join_request",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message").notNull().default(""),
    status: joinRequestStatus("status").notNull().default("new"),
    // Foyer créé quand la demande est acceptée.
    householdId: uuid("household_id"),
    handledBy: uuid("handled_by").references(() => user.id),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "join_request_household_fk",
      columns: [t.householdId, t.amapId],
      foreignColumns: [household.id, household.amapId],
    }),
    check(
      "join_request_accepted",
      sql`(${t.status} = 'accepted') = (${t.householdId} is not null)`,
    ),
    index("join_request_status_idx").on(t.amapId, t.status),
    // Création : tout visiteur de l'AMAP courante, seulement une demande nouvelle, rattachée à
    // rien (le captcha et la limite de débit sont dans l'action). Lecture et suite : les admins.
    pgPolicy("join_request_insert", {
      for: "insert",
      withCheck: sql`${t.amapId} = ${currentAmapId} and ${t.status} = 'new'
        and ${t.householdId} is null and ${t.handledBy} is null`,
    }),
    pgPolicy("join_request_select", {
      for: "select",
      using: sql`${t.amapId} = ${currentAmapId} and ${isCurrentAmapAdmin}`,
    }),
    pgPolicy("join_request_update", {
      for: "update",
      using: sql`${t.amapId} = ${currentAmapId} and ${isCurrentAmapAdmin}`,
      withCheck: sql`${t.amapId} = ${currentAmapId} and ${isCurrentAmapAdmin}`,
    }),
  ],
);

// --- known_device : appareil connu d'un compte ------------------------------------------------
// Story S10, ADR 0041 : une connexion depuis un appareil jamais vu envoie une alerte par email.
// On garde l'empreinte (SHA-256) du cookie de l'appareil, jamais le cookie lui-même. Lié au
// compte, pas à une AMAP : chaque personne ne voit que ses propres appareils.

export const knownDevice = pgTable(
  "known_device",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    deviceHash: text("device_hash").notNull(),
    // Description lisible au moment de la première connexion (« Firefox sur Windows »).
    label: text("label").notNull().default(""),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("known_device_unique").on(t.userId, t.deviceHash),
    pgPolicy("known_device_own", {
      for: "all",
      using: sql`${t.userId} = ${currentUserId}`,
      withCheck: sql`${t.userId} = ${currentUserId}`,
    }),
  ],
);

// --- duty_plan, duty_response, unavailability : indisponibilités du trimestre -----------------
// Story G1, ADR 0042 ; modèle de données, section 8. Le planning des permanences est
// trimestriel : duty_plan porte la période de réponse (ouverture, date limite), duty_response
// dit qui a répondu (une réponse sans rien coché compte : « toujours disponible ») et quand il a
// été relancé, unavailability garde les dates cochées. Une réponse par personne, pas par foyer.

export const dutyPlanStatus = pgEnum("duty_plan_status", DUTY_PLAN_STATUSES);

export const dutyPlan = pgTable(
  "duty_plan",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    // Premier jour du trimestre (« 2027-01-01 »).
    quarterStart: date("quarter_start", { mode: "string" }).notNull(),
    // Instants exacts : 0 h le jour d'ouverture, minuit à la fin de la date limite (Paris).
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    unavailabilityDeadline: timestamp("unavailability_deadline", { withTimezone: true }).notNull(),
    autoReminder: boolean("auto_reminder").notNull().default(true),
    status: dutyPlanStatus("status").notNull().default("collecting"),
    // Email d'ouverture envoyé à tous les amapiens (tâche horaire).
    openingNoticeAt: timestamp("opening_notice_at", { withTimezone: true }),
    // Dernière relance groupée, manuelle ou automatique.
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Personnes concernées par des changements enregistrés sans prévenir (story G2).
    pendingNotice: jsonb("pending_notice").$type<string[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("duty_plan_quarter_unique").on(t.amapId, t.quarterStart),
    unique("duty_plan_amap_unique").on(t.id, t.amapId),
    check(
      "duty_plan_quarter_first_day",
      sql`extract(day from ${t.quarterStart}) = 1 and extract(month from ${t.quarterStart}) in (1, 4, 7, 10)`,
    ),
    check("duty_plan_dates", sql`${t.opensAt} < ${t.unavailabilityDeadline}`),
    // Lecture : toute l'AMAP (accueil et écran « Mes disponibilités »). Écriture : les admins,
    // et la tâche horaire qui note l'email d'ouverture et la relance (« closing_job »).
    ...scopedPolicies("duty_plan", t.amapId, {
      select: sql`true`,
      insert: isCurrentAmapAdmin,
      update: sql`(${isCurrentAmapAdmin} or ${trustedAccess} = 'closing_job')`,
    }),
  ],
);

/** Ligne visible et modifiable par la personne elle-même, les admins et la tâche horaire. */
const ownOrAdminOrJob = (userId: unknown) =>
  sql`(${userId} = ${currentUserId} or ${isCurrentAmapAdmin} or ${trustedAccess} = 'closing_job')`;

export const dutyResponse = pgTable(
  "duty_response",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    dutyPlanId: uuid("duty_plan_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    // Vide : pas encore répondu (la ligne existe alors pour noter une relance).
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "duty_response_plan_fk",
      columns: [t.dutyPlanId, t.amapId],
      foreignColumns: [dutyPlan.id, dutyPlan.amapId],
    }),
    unique("duty_response_unique").on(t.dutyPlanId, t.userId),
    ...scopedPolicies("duty_response", t.amapId, {
      select: ownOrAdminOrJob(t.userId),
      insert: ownOrAdminOrJob(t.userId),
      update: ownOrAdminOrJob(t.userId),
    }),
  ],
);

export const unavailability = pgTable(
  "unavailability",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    dutyPlanId: uuid("duty_plan_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    distributionId: uuid("distribution_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "unavailability_plan_fk",
      columns: [t.dutyPlanId, t.amapId],
      foreignColumns: [dutyPlan.id, dutyPlan.amapId],
    }),
    foreignKey({
      name: "unavailability_distribution_fk",
      columns: [t.distributionId, t.amapId],
      foreignColumns: [distribution.id, distribution.amapId],
    }),
    unique("unavailability_unique").on(t.userId, t.distributionId),
    // Lecture : soi-même et les admins (planning). Écriture : soi-même seulement ; les dates
    // sont remplacées à chaque envoi (suppression puis ajout), d'où la politique delete.
    ...scopedPolicies("unavailability", t.amapId, {
      select: sql`(${t.userId} = ${currentUserId} or ${isCurrentAmapAdmin})`,
      insert: sql`${t.userId} = ${currentUserId}`,
      delete: sql`${t.userId} = ${currentUserId}`,
    }),
  ],
);

// --- duty_slot, duty_history : planning des permanences ---------------------------------------
// Story G2, ADR 0043 ; modèle de données, section 8. Une ligne de duty_slot = une personne de
// permanence à une distribution, à une place (1, 2, 3…). Les personnes à prévenir d'un
// changement sont gardées sur le planning (duty_plan.pending_notice), pas sur la case : une
// personne retirée n'a plus de case, mais doit être prévenue. duty_history : permanences faites
// avant Pomme (reprise AmapJ), comptées dans l'expérience.

export const dutySlot = pgTable(
  "duty_slot",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    dutyPlanId: uuid("duty_plan_id").notNull(),
    distributionId: uuid("distribution_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    position: integer("position").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "duty_slot_plan_fk",
      columns: [t.dutyPlanId, t.amapId],
      foreignColumns: [dutyPlan.id, dutyPlan.amapId],
    }),
    foreignKey({
      name: "duty_slot_distribution_fk",
      columns: [t.distributionId, t.amapId],
      foreignColumns: [distribution.id, distribution.amapId],
    }),
    unique("duty_slot_person_unique").on(t.distributionId, t.userId),
    unique("duty_slot_position_unique").on(t.distributionId, t.position),
    check("duty_slot_position", sql`${t.position} >= 1`),
    // Lecture : toute l'AMAP (les noms des bénévoles sont affichés et imprimés). Écriture :
    // les admins seulement (éditeur du planning).
    ...scopedPolicies("duty_slot", t.amapId, {
      select: sql`true`,
      insert: isCurrentAmapAdmin,
      update: isCurrentAmapAdmin,
      delete: isCurrentAmapAdmin,
    }),
  ],
);

export const dutyHistory = pgTable(
  "duty_history",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    importedCount: integer("imported_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("duty_history_unique").on(t.amapId, t.userId),
    check("duty_history_count", sql`${t.importedCount} >= 0`),
    // Lecture : la personne et les admins. Écriture : les admins (import AmapJ, story K1).
    ...scopedPolicies("duty_history", t.amapId, {
      select: sql`(${t.userId} = ${currentUserId} or ${isCurrentAmapAdmin})`,
      insert: isCurrentAmapAdmin,
      update: isCurrentAmapAdmin,
    }),
  ],
);

// --- household_invitation : invitation dans un foyer ------------------------------------------
// Story A3, ADR 0045. Un membre invite une personne dans son foyer : elle reçoit un lien
// valable 7 jours et ne rejoint le foyer qu'en l'acceptant, connectée avec cet email (ce qui
// prouve que l'adresse est la sienne). On garde l'empreinte du jeton, jamais le jeton.

export const householdInvitation = pgTable(
  "household_invitation",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    householdId: uuid("household_id").notNull(),
    email: text("email").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => user.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "household_invitation_household_fk",
      columns: [t.householdId, t.amapId],
      foreignColumns: [household.id, household.amapId],
    }),
    check("household_invitation_email_lowercase", sql`${t.email} = lower(${t.email})`),
    index("household_invitation_household_idx").on(t.householdId),
    // Lecture et annulation : les membres du foyer et les admins. Création : un membre du
    // foyer, en son nom. L'acceptation passe par la fonction accept_household_invitation.
    ...scopedPolicies("household_invitation", t.amapId, {
      select: sql`(${t.householdId} in (select my_household_ids()) or ${isCurrentAmapAdmin})`,
      insert: sql`(${t.householdId} in (select my_household_ids())
        and ${t.invitedBy} = ${currentUserId})`,
      update: sql`(${t.householdId} in (select my_household_ids()) or ${isCurrentAmapAdmin})`,
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

// --- email_campaign : envoi groupé ------------------------------------------------------------
// Story H1, ADR 0046 ; modèle de données, section 9. Une ligne par envoi groupé : email écrit
// par un admin (tous les adhérents, clients d'un producteur) ou envoi automatique (rappels,
// disponibilités, planning). Chaque email envoyé est relié à son envoi (notification_log.
// campaign_id) : l'historique en tire « Tout distribué » ou « N adresses en échec ».

export const emailCampaignAudience = pgEnum("email_campaign_audience", EMAIL_AUDIENCES);

export const emailCampaign = pgTable(
  "email_campaign",
  {
    id: id(),
    amapId: uuid("amap_id")
      .notNull()
      .references(() => amap.id),
    audience: emailCampaignAudience("audience").notNull(),
    // Clients de ce producteur (audience producer_customers).
    producerId: uuid("producer_id").references(() => producer.id),
    subject: text("subject").notNull(),
    // Texte écrit par l'admin, balises comprises ; vide pour un envoi automatique.
    body: text("body").notNull().default(""),
    // Toujours une personne : l'admin qui envoie, ou celle qui a programmé l'envoi automatique
    // (vide seulement si on ne la connaît pas, par exemple pour les données de démonstration).
    sentBy: uuid("sent_by").references(() => user.id),
    automatic: boolean("automatic").notNull().default(false),
    recipientCount: integer("recipient_count").notNull().default(0),
    householdCount: integer("household_count"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("email_campaign_amap_idx").on(t.amapId, t.sentAt),
    // Lecture : les admins (historique). Écriture : les admins, et les tâches automatiques
    // (accès de confiance « closing_job »).
    ...scopedPolicies("email_campaign", t.amapId, {
      select: isCurrentAmapAdmin,
      insert: sql`(${isCurrentAmapAdmin} or ${trustedAccess} = 'closing_job')`,
      update: sql`(${isCurrentAmapAdmin} or ${trustedAccess} = 'closing_job')`,
    }),
  ],
);

// --- notification_log : journal des emails --------------------------------------------------
// Une ligne par email envoyé (ou tenté) : sert à tracer les envois et à ne jamais relancer deux
// fois (index unique sur la clé de dédoublonnage). Jamais supprimée ni archivée : c'est un
// journal, comme audit_log. Le contenu de l'email n'est pas conservé (il peut contenir un lien
// de connexion).

export const notificationStatus = pgEnum("notification_status", NOTIFICATION_STATUSES);

export const notificationLog = pgTable(
  "notification_log",
  {
    id: id(),
    // Vide pour les emails de la plateforme (lien de connexion), qui ne dépendent d'aucune AMAP.
    amapId: uuid("amap_id").references(() => amap.id),
    // Destinataire (compte), s'il est connu.
    userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
    template: text("template").notNull(), // ex. "magic_link", "order_reminder"
    // Même clé = même email pour la même occasion : envoyé une seule fois (voir domain/notifications).
    dedupeKey: text("dedupe_key"),
    status: notificationStatus("status").notNull().default("pending"),
    providerId: text("provider_id"), // identifiant du message chez Brevo
    // Envoi groupé dont fait partie cet email (story H1), s'il y en a un.
    campaignId: uuid("campaign_id").references(() => emailCampaign.id),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("notification_log_dedupe_idx")
      .on(t.amapId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null and ${t.status} in ('pending', 'sent')`),
    index("notification_log_user_idx").on(t.userId),
    // Emails d'une AMAP : seulement dans l'AMAP courante. Pas de suppression (journal).
    pgPolicy("notification_log_select", {
      for: "select",
      using: sql`${t.amapId} = ${currentAmapId}`,
    }),
    pgPolicy("notification_log_insert", {
      for: "insert",
      withCheck: sql`${t.amapId} = ${currentAmapId}`,
    }),
    pgPolicy("notification_log_update", {
      for: "update",
      using: sql`${t.amapId} = ${currentAmapId}`,
      withCheck: sql`${t.amapId} = ${currentAmapId}`,
    }),
    // Emails de la plateforme (connexion) : écrits par Better Auth, rôle pomme_auth.
    pgPolicy("notification_log_platform_auth", {
      for: "all",
      to: authRole,
      using: sql`${t.amapId} is null`,
      withCheck: sql`${t.amapId} is null`,
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
    // Deuxième vérification faite sur cette session (passkey, code TOTP ou code de secours) ;
    // vide après un simple lien magique. Exigée des admins et gestionnaires (story A1).
    secondFactorVerifiedAt: timestamp("second_factor_verified_at", { withTimezone: true }),
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
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("verification_identifier_idx").on(t.identifier),
    authFullAccess("verification_auth"),
  ],
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
    // Dernière connexion avec cette passkey (story A3), notée par un crochet de Better Auth.
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("passkey_user_idx").on(t.userId), authFullAccess("passkey_auth")],
);

/**
 * Application d'authentification (TOTP) d'un utilisateur, gérée par le plugin twoFactor.
 * Secret et codes de secours chiffrés avec BETTER_AUTH_SECRET.
 */
export const twoFactor = pgTable(
  "two_factor",
  {
    id: uuid("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Faux tant que le premier code n'a pas été saisi (activation en cours).
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [
    index("two_factor_user_idx").on(t.userId),
    index("two_factor_secret_idx").on(t.secret),
    authFullAccess("two_factor_auth"),
  ],
);
