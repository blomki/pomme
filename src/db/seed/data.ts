/**
 * Jeu de données fictif, construit sans base de données (fonction pure, testée).
 *
 * Contenu actuel : 2 AMAP, 1 gestionnaire de la plateforme, 40 amapiens par AMAP,
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

export type SeedData = { users: SeedUser[]; amaps: SeedAmap[]; roles: SeedRole[] };

const FIRST_NAMES = [
  "Camille", "Léa", "Manon", "Chloé", "Inès", "Jade", "Louise", "Alice", "Lina", "Rose",
  "Anna", "Juliette", "Zoé", "Emma", "Sarah", "Lucas", "Hugo", "Louis", "Gabriel", "Arthur",
  "Jules", "Adam", "Léo", "Raphaël", "Paul", "Nathan", "Tom", "Noé", "Sacha", "Martin",
] as const;

const LAST_NAMES = [
  "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy",
  "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand", "Roux",
  "Vincent", "Fournier", "Morel", "Girard", "André", "Mercier", "Dupont", "Lambert", "Bonnet",
  "François", "Martinez", "Lemaire",
] as const;

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
      primary: "#E8722A",
      secondary: "#5B8C3A",
      tertiary: "#C9A227",
      headingFont: "Pattaya",
    },
    admins: 2,
    referents: 6,
  },
  {
    slug: "pays-d-auge-demo",
    name: "AMAP fictive du Pays d'Auge",
    distributionPlace: "Halle du marché (adresse fictive)",
    theme: { primary: "#3F6FB5", secondary: "#7A5C99", tertiary: "#2E8B7A" },
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
  const makeUser = (isPlatformAdmin = false): SeedUser => {
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
      isPlatformAdmin,
    };
  };

  const users: SeedUser[] = [];
  const amaps: SeedAmap[] = [];
  const roles: SeedRole[] = [];

  const platformAdmin = makeUser(true);
  users.push(platformAdmin);

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
  return { users, amaps, roles };
}
