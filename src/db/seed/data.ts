/**
 * Jeu de données fictif, construit sans base de données (fonction pure, testée).
 *
 * Contenu actuel : 2 AMAP, 6 comptes de démonstration aux adresses fixes (DEMO_ACCOUNTS, dont
 * le gestionnaire de la plateforme), 40 amapiens par AMAP,
 * des administrateurs et des référents, et une personne présente dans les deux AMAP.
 * À compléter au fil des stories : foyers et adhésions (40 par AMAP, A2/B1),
 * producteurs (6, C1), catalogues, commandes…
 *
 * Toutes les données sont inventées : adresses en @example.org (domaine réservé aux exemples),
 * téléphones dans la tranche 06 39 98 xx xx réservée par l'Arcep à la fiction.
 */
import { validateAmapSlug } from "@/domain/amap-slug";
import type { AmapRoleName } from "@/domain/roles";

import type { AmapSettings, AmapTheme } from "../schema";
import { uuidv7 } from "../uuid";

import { createRandom } from "./random";

export const SEED = 20261105;
export const MEMBERS_PER_AMAP = 40;

export type SeedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  isPlatformAdmin: boolean;
};

export type SeedAmap = {
  id: string;
  slug: string;
  name: string;
  distributionPlace: string;
  theme: AmapTheme;
  settings: AmapSettings;
};

export type SeedRole = { id: string; amapId: string; userId: string; role: AmapRoleName };

export type SeedData = {
  users: SeedUser[];
  amaps: SeedAmap[];
  roles: SeedRole[];
  /** Comptes dont l'application d'authentification est activée avec DEMO_TOTP_SECRET. */
  totpUserIds: string[];
};

/**
 * Secret de l'application d'authentification des comptes de démonstration admin et
 * gestionnaire. PUBLIC, connu de tous : uniquement pour des données fictives, en local et dans
 * les tests. Clé à saisir dans une application (Base32) : voir le README.
 */
export const DEMO_TOTP_SECRET = "PommeDemoTotpNePasUtiliserEnProd";

/** Codes de secours des mêmes comptes (tout aussi publics). */
export const DEMO_BACKUP_CODES = Array.from(
  { length: 10 },
  (_, i) => `DEMO0-${String(i + 1).padStart(5, "0")}`,
);

const FIRST_NAMES = [
  "Camille",
  "Léa",
  "Manon",
  "Chloé",
  "Inès",
  "Jade",
  "Louise",
  "Alice",
  "Lina",
  "Rose",
  "Anna",
  "Juliette",
  "Zoé",
  "Emma",
  "Sarah",
  "Lucas",
  "Hugo",
  "Louis",
  "Gabriel",
  "Arthur",
  "Jules",
  "Adam",
  "Léo",
  "Raphaël",
  "Paul",
  "Nathan",
  "Tom",
  "Noé",
  "Sacha",
  "Martin",
] as const;

const LAST_NAMES = [
  "Martin",
  "Bernard",
  "Dubois",
  "Thomas",
  "Robert",
  "Richard",
  "Petit",
  "Durand",
  "Leroy",
  "Moreau",
  "Simon",
  "Laurent",
  "Lefebvre",
  "Michel",
  "Garcia",
  "David",
  "Bertrand",
  "Roux",
  "Vincent",
  "Fournier",
  "Morel",
  "Girard",
  "André",
  "Mercier",
  "Dupont",
  "Lambert",
  "Bonnet",
  "François",
  "Martinez",
  "Lemaire",
] as const;

/**
 * Comptes de démonstration (rôles dans la première AMAP). Les amapiens n'ont pas de rôle : ils
 * en auront un par leur foyer (story A2).
 * - admin.demo et gestionnaire.demo : application d'authentification déjà activée
 *   (DEMO_TOTP_SECRET) pour passer la deuxième vérification ;
 * - admin2.demo : admin sans moyen de vérification, pour tester sa création.
 */
export const DEMO_ACCOUNTS: ReadonlyArray<{
  email: string;
  firstName: string;
  role: AmapRoleName | null;
  isPlatformAdmin?: boolean;
  totp?: boolean;
}> = [
  {
    email: "gestionnaire.demo@example.org",
    firstName: "Noa",
    role: null,
    isPlatformAdmin: true,
    totp: true,
  },
  { email: "admin.demo@example.org", firstName: "Alix", role: "admin", totp: true },
  { email: "admin2.demo@example.org", firstName: "Dominique", role: "admin" },
  { email: "referent.demo@example.org", firstName: "Robin", role: "referent" },
  { email: "amapien.demo@example.org", firstName: "Sasha", role: null },
  { email: "amapien2.demo@example.org", firstName: "Charlie", role: null },
];

const DEFAULT_SETTINGS: AmapSettings = {
  volunteersPerDistribution: 3,
  experiencedThreshold: 6,
  membershipExpiryAlertDays: 30,
};

const AMAPS = [
  {
    slug: "hommesdeterre",
    name: "AMAP de démonstration de Cambremer",
    distributionPlace: "Salle des fêtes (adresse fictive)",
    theme: {
      primary: "#e8722a",
      secondary: "#5b8c3a",
      tertiary: "#c9a227",
      headingFont: "Pattaya",
    },
    admins: 2,
    referents: 6,
  },
  {
    slug: "pays-d-auge-demo",
    name: "AMAP fictive du Pays d'Auge",
    distributionPlace: "Halle du marché (adresse fictive)",
    theme: { primary: "#3f6fb5", secondary: "#7a5c99", tertiary: "#2e8b7a" },
    admins: 1,
    referents: 3,
  },
] as const;

/** Minuscules sans accents ni espaces, pour fabriquer les adresses email. */
function toEmailPart(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function buildSeedData(): SeedData {
  const random = createRandom(SEED);
  let clock = Date.UTC(2026, 0, 1);
  // Identifiants reproductibles : heure fixe qui avance d'une seconde, aléa à graine fixe.
  const nextId = () => uuidv7({ now: (clock += 1000), randomBytes: random.bytes });

  const usedEmails = new Set<string>();
  let phoneCounter = 0;
  const makeUser = (): SeedUser => {
    const firstName = random.pick(FIRST_NAMES);
    const lastName = random.pick(LAST_NAMES);
    const base = `${toEmailPart(firstName)}.${toEmailPart(lastName)}`;
    let email = `${base}@example.org`;
    for (let n = 2; usedEmails.has(email); n++) email = `${base}${n}@example.org`;
    usedEmails.add(email);
    phoneCounter += 1;
    return {
      id: nextId(),
      email,
      firstName,
      lastName,
      phone: `+3363998${String(phoneCounter).padStart(4, "0")}`,
      isPlatformAdmin: false,
    };
  };

  const users: SeedUser[] = [];
  const amaps: SeedAmap[] = [];
  const roles: SeedRole[] = [];

  // Comptes de démonstration aux adresses fixes, pour se connecter facilement en local et dans
  // les tests de bout en bout (lien reçu dans Mailpit, http://localhost:8025).
  const demoUsers = DEMO_ACCOUNTS.map((demo) => {
    phoneCounter += 1;
    const demoUser: SeedUser = {
      id: nextId(),
      email: demo.email,
      firstName: demo.firstName,
      lastName: "Démo",
      phone: `+3363998${String(phoneCounter).padStart(4, "0")}`,
      isPlatformAdmin: demo.isPlatformAdmin ?? false,
    };
    usedEmails.add(demo.email);
    return { demoUser, role: demo.role, totp: demo.totp ?? false };
  });
  users.push(...demoUsers.map(({ demoUser }) => demoUser));

  const membersByAmap: SeedUser[][] = [];
  for (const definition of AMAPS) {
    const amapRecord: SeedAmap = {
      id: nextId(),
      slug: definition.slug,
      name: definition.name,
      distributionPlace: definition.distributionPlace,
      theme: { ...definition.theme },
      settings: DEFAULT_SETTINGS,
    };
    amaps.push(amapRecord);

    const members = Array.from({ length: MEMBERS_PER_AMAP }, () => makeUser());
    users.push(...members);
    membersByAmap.push(members);

    // Les premiers membres sont administrateurs, les suivants référents.
    members.slice(0, definition.admins).forEach((member) => {
      roles.push({ id: nextId(), amapId: amapRecord.id, userId: member.id, role: "admin" });
    });
    members.slice(definition.admins, definition.admins + definition.referents).forEach((member) => {
      roles.push({ id: nextId(), amapId: amapRecord.id, userId: member.id, role: "referent" });
    });
  }

  const firstAmap = amaps[0];
  if (firstAmap) {
    for (const { demoUser, role } of demoUsers) {
      if (role) roles.push({ id: nextId(), amapId: firstAmap.id, userId: demoUser.id, role });
    }
  }

  // Cas multi-AMAP : le premier administrateur de la première AMAP est aussi référent
  // dans la seconde, avec le même compte.
  const sharedUser = membersByAmap[0]?.[0];
  const secondAmap = amaps[1];
  if (sharedUser && secondAmap) {
    roles.push({ id: nextId(), amapId: secondAmap.id, userId: sharedUser.id, role: "referent" });
  }

  for (const amapRecord of amaps) {
    if (validateAmapSlug(amapRecord.slug)) throw new Error(`Adresse invalide : ${amapRecord.slug}`);
  }
  const totpUserIds = demoUsers.filter(({ totp }) => totp).map(({ demoUser }) => demoUser.id);
  return { users, amaps, roles, totpUserIds };
}
