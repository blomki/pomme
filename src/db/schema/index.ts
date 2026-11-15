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
} from "drizzle-orm/pg-core";

import { NOTIFICATION_STATUSES } from "@/domain/notifications";
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
    // Toutes les opérations : seulement dans l'AMAP courante (le rôle est vérifié par requireRole).
    pgPolicy("household_isolation", {
      for: "all",
      using: sql`${t.amapId} = ${currentAmapId}`,
      withCheck: sql`${t.amapId} = ${currentAmapId}`,
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
    pgPolicy("household_member_isolation", {
      for: "all",
      using: sql`${t.amapId} = ${currentAmapId}`,
      withCheck: sql`${t.amapId} = ${currentAmapId}`,
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
    check("distribution_times", sql`${t.startTime} < ${t.endTime}`),
    // Fermée = motif obligatoire ; ouverte = pas de motif. coalesce : sans lui, un motif NULL
    // rendrait la condition NULL, et PostgreSQL accepte une contrainte CHECK qui vaut NULL.
    check(
      "distribution_closed_reason",
      sql`(${t.isOpen} and ${t.closedReason} is null)
        or (not ${t.isOpen} and coalesce(length(trim(${t.closedReason})), 0) > 0)`,
    ),
    // Lecture et écriture dans l'AMAP courante (l'écriture est réservée aux admins par
    // requireRole) ; toutes les personnes de l'AMAP liront le calendrier (commandes, planning).
    pgPolicy("distribution_isolation", {
      for: "all",
      using: sql`${t.amapId} = ${currentAmapId}`,
      withCheck: sql`${t.amapId} = ${currentAmapId}`,
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
    // Envoi de photo : fiche dédiée aux fichiers (stockage objet, images ré-encodées).
    photoUrl: text("photo_url"),
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
    pgPolicy("amap_producer_isolation", {
      for: "all",
      using: sql`${t.amapId} = ${currentAmapId}`,
      withCheck: sql`${t.amapId} = ${currentAmapId}`,
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
    pgPolicy("referent_assignment_isolation", {
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
