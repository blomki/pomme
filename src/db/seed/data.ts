/**
 * Jeu de données fictif, construit sans base de données (fonction pure, testée).
 *
 * Contenu actuel : 2 AMAP, 6 comptes de démonstration aux adresses fixes (DEMO_ACCOUNTS, dont
 * le gestionnaire de la plateforme), 40 foyers par AMAP (quelques-uns de deux personnes ; les
 * comptes de démonstration ont chacun le leur dans la première AMAP), des administrateurs et
 * des référents, et une personne présente dans les deux AMAP.
 * Producteurs (noms inventés) : 6 dans la première AMAP, dont un sans référent (tâche
 * « Bloquant »), 3 dans la seconde, dont un commun aux deux et un à rattacher à la première.
 * Distributions : le mois du chargement et les deux suivants, au jour habituel de chaque AMAP ;
 * la dernière de décembre est fermée (« Vacances de Noël »).
 * Catalogues : deux produits par producteur (noms et prix inventés), et un brouillon de
 * catalogue par producteur pour le mois du chargement et le suivant, chaque produit disponible
 * à toutes les distributions ouvertes.
 * Commandes (première AMAP) : la période du mois suivant, ouverte depuis 3 jours et jusqu'à
 * dans 5 jours, et des commandes pour 12 foyers sur 40 (deux producteurs chacun, un produit
 * de chaque à la première distribution).
 * À compléter au fil des stories : adhésions (B1)…
 *
 * Toutes les données sont inventées : adresses en @example.org (domaine réservé aux exemples),
 * téléphones dans la tranche 06 39 98 xx xx réservée par l'Arcep à la fiction.
 */
import { validateAmapSlug } from "@/domain/amap-slug";
import { addMonths, distributionDates, type Weekday } from "@/domain/distributions";
import { defaultDutyPlanDays, nextQuarterStart } from "@/domain/duty-plans";
import { addDays, defaultPeriodDays, parisDay, periodInstants } from "@/domain/order-periods";
import type { RichDoc } from "@/domain/pages";
import type { AmapRoleName } from "@/domain/roles";

import type { AmapSettings, AmapTheme } from "../schema";
import { uuidv7 } from "../uuid";

import { createRandom } from "./random";

export const SEED = 20261105;
export const MEMBERS_PER_AMAP = 40;
/** Un foyer sur 8 compte une deuxième personne. */
export const SECOND_MEMBER_EVERY = 8;

export type SeedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  isPlatformAdmin: boolean;
  /** Vrai si la personne s'est déjà connectée (statut « actif » ; sinon « invité »). */
  emailVerified: boolean;
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

export type SeedHousehold = { id: string; amapId: string; name: string };

export type SeedHouseholdMember = {
  id: string;
  amapId: string;
  householdId: string;
  userId: string;
  isPrimary: boolean;
};

export type SeedProducer = {
  id: string;
  name: string;
  category: string;
  shortDescription: string;
  phone: string;
  email: string;
};

export type SeedAmapProducer = {
  id: string;
  amapId: string;
  producerId: string;
  checkPayee: string;
  distanceKm: number;
};

export type SeedReferentAssignment = {
  id: string;
  amapId: string;
  amapProducerId: string;
  userId: string;
};

export type SeedProducerUser = { id: string; producerId: string; userId: string };

export type SeedProduct = { id: string; producerId: string; name: string };
export type SeedCatalog = {
  id: string;
  amapId: string;
  producerId: string;
  month: string;
  status: "draft" | "published";
  publishedAt: Date | null;
};

/**
 * Catalogues laissés en brouillon le mois prochain dans la première AMAP : les tests de bout
 * en bout C2 et C3 les modifient et les publient. Les autres y sont publiés, pour que les
 * familles puissent commander (story D3).
 */
const DRAFT_NEXT_MONTH = ["Les Ruches du Vallon", "Boulangerie des Trois Moulins"];
export type SeedCatalogItem = {
  id: string;
  amapId: string;
  catalogId: string;
  productId: string;
  priceCents: number;
  position: number;
};
export type SeedAvailability = {
  id: string;
  amapId: string;
  catalogItemId: string;
  distributionId: string;
};

export type SeedOrderPeriod = {
  id: string;
  amapId: string;
  month: string;
  opensAt: Date;
  closesAt: Date;
  status: "open" | "closed";
  closedAt: Date | null;
};
// Indisponibilités du trimestre (story G1).
export type SeedDutyPlan = {
  id: string;
  amapId: string;
  quarterStart: string;
  opensAt: Date;
  unavailabilityDeadline: Date;
  openingNoticeAt: Date;
};
export type SeedDutyResponse = {
  id: string;
  amapId: string;
  dutyPlanId: string;
  userId: string;
  answeredAt: Date;
};
export type SeedUnavailability = {
  id: string;
  amapId: string;
  dutyPlanId: string;
  userId: string;
  distributionId: string;
};
export type SeedCheque = {
  id: string;
  amapId: string;
  householdId: string;
  producerId: string;
  orderPeriodId: string;
  grossCents: number;
  creditsCents: number;
  expectedCents: number;
};
export type SeedOrder = { id: string; amapId: string; householdId: string; catalogId: string };
export type SeedOrderLine = {
  id: string;
  amapId: string;
  orderId: string;
  catalogItemId: string;
  distributionId: string;
  quantity: number;
  unitPriceCents: number;
};

export type SeedMembership = {
  id: string;
  amapId: string;
  householdId: string;
  startDate: string;
  endDate: string;
  feeCents: number | null;
  note: string;
};

/** Page du site public (story H2). */
export type SeedPage = {
  id: string;
  amapId: string;
  parentId: string | null;
  role: "home" | "legal" | null;
  title: string;
  slug: string;
  summary: string;
  body: RichDoc;
  status: "draft" | "published";
  publishedOn: string | null;
  inMenu: boolean;
  menuPosition: number;
};

/** Demande d'adhésion (story B2). */
export type SeedJoinRequest = {
  id: string;
  amapId: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
};

export type SeedData = {
  pages: SeedPage[];
  joinRequests: SeedJoinRequest[];
  users: SeedUser[];
  amaps: SeedAmap[];
  roles: SeedRole[];
  households: SeedHousehold[];
  householdMembers: SeedHouseholdMember[];
  producers: SeedProducer[];
  amapProducers: SeedAmapProducer[];
  referentAssignments: SeedReferentAssignment[];
  producerUsers: SeedProducerUser[];
  distributions: SeedDistribution[];
  products: SeedProduct[];
  catalogs: SeedCatalog[];
  catalogItems: SeedCatalogItem[];
  availabilities: SeedAvailability[];
  orderPeriods: SeedOrderPeriod[];
  orders: SeedOrder[];
  orderLines: SeedOrderLine[];
  cheques: SeedCheque[];
  memberships: SeedMembership[];
  dutyPlans: SeedDutyPlan[];
  dutyResponses: SeedDutyResponse[];
  unavailabilities: SeedUnavailability[];
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
  /** Deuxième rôle dans la même AMAP (admin et référent, cas courant). */
  alsoReferent?: boolean;
  isPlatformAdmin?: boolean;
  totp?: boolean;
  /** Compte producteur : nom du producteur (PRODUCERS) ; pas de foyer. */
  producer?: string;
}> = [
  {
    email: "gestionnaire.demo@example.org",
    firstName: "Noa",
    role: null,
    isPlatformAdmin: true,
    totp: true,
  },
  {
    email: "admin.demo@example.org",
    firstName: "Alix",
    role: "admin",
    alsoReferent: true,
    totp: true,
  },
  { email: "admin2.demo@example.org", firstName: "Dominique", role: "admin" },
  // Référents : deuxième vérification obligatoire depuis S10 (application de démonstration).
  { email: "referent.demo@example.org", firstName: "Robin", role: "referent", totp: true },
  // Sans moyen de vérification : invité à en enregistrer un (test de bout en bout S10).
  { email: "referent2.demo@example.org", firstName: "Lou", role: "referent" },
  { email: "amapien.demo@example.org", firstName: "Sasha", role: null },
  { email: "amapien2.demo@example.org", firstName: "Charlie", role: null },
  {
    email: "producteur.demo@example.org",
    firstName: "Ange",
    role: null,
    producer: "Les Ruches du Vallon",
  },
];

/**
 * Producteurs fictifs (noms inventés : jamais les vrais producteurs des maquettes). `amaps` :
 * indices des AMAP livrées ; `withoutReferent` : laissé sans référent dans la première AMAP.
 */
const PRODUCERS: ReadonlyArray<{
  name: string;
  category: string;
  shortDescription: string;
  payee: string;
  amaps: readonly number[];
  withoutReferent?: boolean;
  /** Produits (conditionnement compris) et prix en centimes. */
  products: ReadonlyArray<readonly [string, number]>;
}> = [
  {
    name: "Les Ruches du Vallon",
    products: [
      ["Miel de printemps, pot de 500 g", 900],
      ["Miel de bruyère, pot de 250 g", 650],
    ],
    category: "Miel",
    shortDescription: "Miels de printemps et de bruyère",
    payee: "EARL Les Ruches du Vallon",
    amaps: [0, 1],
  },
  {
    name: "Boulangerie des Trois Moulins",
    products: [
      ["Pain au levain, 1 kg", 520],
      ["Pain aux graines, 500 g", 380],
    ],
    category: "Pains",
    shortDescription: "Pains au levain, cuits au feu de bois",
    payee: "Boulangerie des Trois Moulins",
    amaps: [0],
  },
  {
    name: "Chèvrerie des Hauts Prés",
    products: [
      ["Crottin frais", 280],
      ["Bûche cendrée, 200 g", 550],
    ],
    category: "Fromages de chèvre",
    shortDescription: "Fromages frais et affinés",
    payee: "GAEC des Hauts Prés",
    amaps: [0],
  },
  {
    name: "Laiterie du Pré Vert",
    products: [
      ["Yaourts nature, lot de 4", 320],
      ["Beurre doux, 250 g", 390],
    ],
    category: "Produits laitiers",
    shortDescription: "Yaourts, crème et beurre",
    payee: "SCEA du Pré Vert",
    amaps: [0, 1],
  },
  {
    name: "Ferme du Coteau",
    products: [
      ["Œufs, boîte de 6", 240],
      ["Œufs, boîte de 12", 460],
    ],
    category: "Œufs",
    shortDescription: "Œufs de poules élevées en plein air",
    payee: "Ferme du Coteau",
    amaps: [0],
  },
  {
    name: "Cidrerie du Clos Fictif",
    products: [
      ["Jus de pomme, 1 L", 350],
      ["Cidre brut, 75 cl", 480],
    ],
    category: "Jus de pomme, cidre",
    shortDescription: "Jus de pomme et cidre fermier",
    payee: "Cidrerie du Clos Fictif",
    amaps: [0],
    withoutReferent: true,
  },
  {
    name: "Maraîchage de la Source",
    products: [
      ["Panier de légumes de saison", 1500],
      ["Salade", 150],
    ],
    category: "Légumes",
    shortDescription: "Légumes de saison",
    payee: "Maraîchage de la Source",
    amaps: [1],
  },
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
    // Distribution habituelle : le jeudi (comme à Cambremer), de 18 h à 19 h 30 (horaires fictifs).
    distribution: { weekday: 4, start: "18:00", end: "19:30" },
    admins: 2,
    referents: 6,
  },
  {
    slug: "pays-d-auge-demo",
    name: "AMAP fictive du Pays d'Auge",
    distributionPlace: "Halle du marché (adresse fictive)",
    theme: { primary: "#3f6fb5", secondary: "#7a5c99", tertiary: "#2e8b7a" },
    distribution: { weekday: 5, start: "17:30", end: "19:00" },
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

export type SeedDistribution = {
  id: string;
  amapId: string;
  date: string;
  startTime: string;
  endTime: string;
  isOpen: boolean;
  closedReason: string | null;
};

/**
 * @param today jour de référence : les distributions sont créées pour son mois et les deux
 *   suivants (le jeu de données reste utile quel que soit le jour où on le charge).
 */
export function buildSeedData(today: Date = new Date()): SeedData {
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
      // Trois personnes sur quatre se sont déjà connectées.
      emailVerified: random.next() < 0.75,
    };
  };

  const users: SeedUser[] = [];
  const amaps: SeedAmap[] = [];
  const roles: SeedRole[] = [];
  const households: SeedHousehold[] = [];
  const householdMembers: SeedHouseholdMember[] = [];

  /** Crée un foyer « Foyer <nom> » (nom unique dans l'AMAP) avec ses membres, le premier principal. */
  const usedNames = new Map<string, Set<string>>();
  const addHousehold = (amapId: string, people: SeedUser[]) => {
    const names = usedNames.get(amapId) ?? new Set<string>();
    usedNames.set(amapId, names);
    const [first] = people;
    if (!first) return;
    let name = `Foyer ${first.lastName}`;
    if (names.has(name)) name = `Foyer ${first.lastName} (${first.firstName})`;
    for (let n = 2; names.has(name); n++) name = `Foyer ${first.lastName} ${n}`;
    names.add(name);
    const householdId = nextId();
    households.push({ id: householdId, amapId, name });
    people.forEach((person, index) => {
      householdMembers.push({
        id: nextId(),
        amapId,
        householdId,
        userId: person.id,
        isPrimary: index === 0,
      });
    });
  };

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
      emailVerified: false,
    };
    usedEmails.add(demo.email);
    return { demoUser, role: demo.role, totp: demo.totp ?? false, producer: demo.producer };
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
      settings: {
        ...DEFAULT_SETTINGS,
        distributionWeekday: definition.distribution.weekday,
        distributionStartTime: definition.distribution.start,
        distributionEndTime: definition.distribution.end,
      },
    };
    amaps.push(amapRecord);

    const members = Array.from({ length: MEMBERS_PER_AMAP }, () => makeUser());
    users.push(...members);
    membersByAmap.push(members);

    // Un foyer par amapien ; un foyer sur 8 compte une deuxième personne (même nom de famille).
    members.forEach((member, index) => {
      const people = [member];
      if (index % SECOND_MEMBER_EVERY === 3) {
        const partner = { ...makeUser(), lastName: member.lastName };
        users.push(partner);
        people.push(partner);
      }
      addHousehold(amapRecord.id, people);
    });

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
    for (const { demoUser, role, producer: producerName } of demoUsers) {
      if (role) roles.push({ id: nextId(), amapId: firstAmap.id, userId: demoUser.id, role });
      // Chaque compte de démonstration (sauf le gestionnaire) a son foyer dans la première AMAP.
      if (!demoUser.isPlatformAdmin && !producerName) addHousehold(firstAmap.id, [demoUser]);
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
  // Producteurs : référents pris parmi les personnes qui ont ce rôle, à tour de rôle.
  const producers: SeedProducer[] = [];
  const amapProducers: SeedAmapProducer[] = [];
  const referentAssignments: SeedReferentAssignment[] = [];
  const referentsOf = (amapId: string) =>
    roles.filter((r) => r.amapId === amapId && r.role === "referent").map((r) => r.userId);
  const turn = new Map<string, number>();
  for (const definition of PRODUCERS) {
    phoneCounter += 1;
    const producerRecord: SeedProducer = {
      id: nextId(),
      name: definition.name,
      category: definition.category,
      shortDescription: definition.shortDescription,
      phone: `+3363998${String(phoneCounter).padStart(4, "0")}`,
      email: `${toEmailPart(definition.name)}@example.org`,
    };
    producers.push(producerRecord);
    for (const index of definition.amaps) {
      const amapRecord = amaps[index];
      if (!amapRecord) continue;
      const amapProducerId = nextId();
      amapProducers.push({
        id: amapProducerId,
        amapId: amapRecord.id,
        producerId: producerRecord.id,
        checkPayee: definition.payee,
        distanceKm: 5 + Math.floor(random.next() * 40),
      });
      if (definition.withoutReferent && index === 0) continue;
      const candidates = referentsOf(amapRecord.id);
      const position = turn.get(amapRecord.id) ?? 0;
      turn.set(amapRecord.id, position + 1);
      const userId = candidates[position % candidates.length];
      if (userId) {
        referentAssignments.push({ id: nextId(), amapId: amapRecord.id, amapProducerId, userId });
      }
    }
  }

  // Le référent de démonstration suit deux producteurs de la première AMAP (« Mes producteurs »).
  const demoReferent = demoUsers.find(({ role }) => role === "referent")?.demoUser;
  for (const name of ["Les Ruches du Vallon", "Boulangerie des Trois Moulins"]) {
    const producerId = producers.find((p) => p.name === name)?.id;
    const target = amapProducers.find(
      (ap) => ap.producerId === producerId && ap.amapId === amaps[0]?.id,
    );
    if (!demoReferent || !target) continue;
    const already = referentAssignments.some(
      (r) => r.amapProducerId === target.id && r.userId === demoReferent.id,
    );
    if (!already) {
      referentAssignments.push({
        id: nextId(),
        amapId: target.amapId,
        amapProducerId: target.id,
        userId: demoReferent.id,
      });
    }
  }

  // Comptes producteurs de démonstration.
  const producerUsers: SeedProducerUser[] = demoUsers.flatMap(({ demoUser, producer: name }) => {
    const producerId = producers.find((p) => p.name === name)?.id;
    return producerId ? [{ id: nextId(), producerId, userId: demoUser.id }] : [];
  });

  // Distributions du mois en cours jusqu'à la fin du trimestre suivant (planning des
  // permanences, G1), au moins trois mois ; la dernière de décembre est fermée.
  const distributions: SeedDistribution[] = [];
  const firstMonth = today.toISOString().slice(0, 7);
  const quarterStart = nextQuarterStart(parisDay(today));
  const lastMonth = addMonths(quarterStart.slice(0, 7), 2);
  const seedMonths: string[] = [];
  for (let m = firstMonth; m <= lastMonth || seedMonths.length < 3; m = addMonths(m, 1)) {
    seedMonths.push(m);
  }
  AMAPS.forEach((definition, index) => {
    const amapRecord = amaps[index];
    if (!amapRecord) return;
    for (const month of seedMonths) {
      const dates = distributionDates(month, definition.distribution.weekday as Weekday);
      dates.forEach((date, position) => {
        const christmas = month.endsWith("-12") && position === dates.length - 1;
        distributions.push({
          id: nextId(),
          amapId: amapRecord.id,
          date,
          startTime: definition.distribution.start,
          endTime: definition.distribution.end,
          isOpen: !christmas,
          closedReason: christmas ? "Vacances de Noël" : null,
        });
      });
    }
  });

  const totpUserIds = demoUsers.filter(({ totp }) => totp).map(({ demoUser }) => demoUser.id);
  // Rôles supplémentaires des comptes de démonstration, ajoutés en dernier pour ne rien
  // changer au reste du jeu de données (identifiants, référents des producteurs).
  const demoFirstAmap = amaps[0];
  if (demoFirstAmap) {
    for (const demo of DEMO_ACCOUNTS) {
      const demoUser = demoUsers.find(({ demoUser: u }) => u.email === demo.email)?.demoUser;
      if (demo.alsoReferent && demoUser) {
        roles.push({
          id: nextId(),
          amapId: demoFirstAmap.id,
          userId: demoUser.id,
          role: "referent",
        });
      }
    }
  }

  // Produits, puis un catalogue par producteur et par mois (ce mois-ci et le suivant : en
  // brouillon, sauf le mois prochain dans la première AMAP, voir DRAFT_NEXT_MONTH), chaque produit disponible à toutes les distributions ouvertes du mois. Ajoutés
  // en dernier : les identifiants du reste du jeu de données ne changent pas.
  const products: SeedProduct[] = [];
  const catalogs: SeedCatalog[] = [];
  const catalogItems: SeedCatalogItem[] = [];
  const availabilities: SeedAvailability[] = [];
  for (const definition of PRODUCERS) {
    const producerRecord = producers.find((p) => p.name === definition.name);
    if (!producerRecord) continue;
    const own = definition.products.map(([name, priceCents]) => {
      const record = { id: nextId(), producerId: producerRecord.id, name };
      products.push(record);
      return { record, priceCents };
    });
    for (const ap of amapProducers.filter((a) => a.producerId === producerRecord.id)) {
      for (const month of [0, 1].map((delta) => addMonths(firstMonth, delta))) {
        const catalogId = nextId();
        // Première AMAP : catalogues du mois en cours publiés (commandes déjà clôturées), et
        // ceux du mois prochain sauf DRAFT_NEXT_MONTH.
        const published =
          ap.amapId === amaps[0]?.id &&
          (month === firstMonth ||
            (month === addMonths(firstMonth, 1) && !DRAFT_NEXT_MONTH.includes(definition.name)));
        catalogs.push({
          id: catalogId,
          amapId: ap.amapId,
          producerId: ap.producerId,
          month: `${month}-01`,
          status: published ? "published" : "draft",
          publishedAt: published ? today : null,
        });
        const open = distributions.filter(
          (d) => d.amapId === ap.amapId && d.isOpen && d.date.startsWith(month),
        );
        own.forEach(({ record, priceCents }, position) => {
          const itemId = nextId();
          catalogItems.push({
            id: itemId,
            amapId: ap.amapId,
            catalogId,
            productId: record.id,
            priceCents,
            position,
          });
          for (const d of open) {
            availabilities.push({
              id: nextId(),
              amapId: ap.amapId,
              catalogItemId: itemId,
              distributionId: d.id,
            });
          }
        });
      }
    }
  }

  // Période de commande du mois suivant dans la première AMAP, ouverte en ce moment, et des
  // commandes pour 12 foyers : de quoi voir le bandeau du tableau de bord et essayer la
  // clôture. Ajoutées en dernier, comme les catalogues.
  const orderPeriods: SeedOrderPeriod[] = [];
  const orders: SeedOrder[] = [];
  const orderLines: SeedOrderLine[] = [];
  if (firstAmap) {
    const nextMonth = addMonths(firstMonth, 1);
    const todayInParis = parisDay(today);
    orderPeriods.push({
      id: nextId(),
      amapId: firstAmap.id,
      month: `${nextMonth}-01`,
      ...periodInstants(addDays(todayInParis, -3), addDays(todayInParis, 5)),
      status: "open",
      closedAt: null,
    });
    const nextCatalogs = catalogs.filter(
      (c) => c.amapId === firstAmap.id && c.month === `${nextMonth}-01`,
    );
    const firstDistribution = distributions.find(
      (d) => d.amapId === firstAmap.id && d.isOpen && d.date.startsWith(nextMonth),
    );
    const ordering = households.filter((h) => h.amapId === firstAmap.id).slice(0, 12);
    ordering.forEach((h, index) => {
      if (!firstDistribution) return;
      // Deux producteurs par foyer, en tournant sur la liste.
      for (const c of [0, 1].map((k) => nextCatalogs[(index + k) % nextCatalogs.length])) {
        if (!c) continue;
        const item = catalogItems.find((i) => i.catalogId === c.id);
        if (!item) continue;
        const orderId = nextId();
        orders.push({ id: orderId, amapId: firstAmap.id, householdId: h.id, catalogId: c.id });
        orderLines.push({
          id: nextId(),
          amapId: firstAmap.id,
          orderId,
          catalogItemId: item.id,
          distributionId: firstDistribution.id,
          quantity: 1 + (index % 3),
          unitPriceCents: item.priceCents,
        });
      }
    });
  }

  // Commandes du mois en cours dans la première AMAP, clôturées le mois dernier, avec leurs
  // chèques attendus : de quoi voir un bon de commande clôturé (E1) et pointer des chèques
  // (F1). Deux producteurs par foyer, une quantité à chaque distribution ouverte.
  const cheques: SeedCheque[] = [];
  if (firstAmap) {
    const days = defaultPeriodDays(firstMonth);
    const periodId = nextId();
    const instants = periodInstants(days.opensOn, days.closesOn);
    orderPeriods.push({
      id: periodId,
      amapId: firstAmap.id,
      month: `${firstMonth}-01`,
      ...instants,
      status: "closed",
      closedAt: instants.closesAt,
    });
    const currentCatalogs = catalogs.filter(
      (c) => c.amapId === firstAmap.id && c.month === `${firstMonth}-01`,
    );
    const monthDistributions = distributions.filter(
      (d) => d.amapId === firstAmap.id && d.isOpen && d.date.startsWith(firstMonth),
    );
    // Les mêmes 12 foyers, plus celui de amapien.demo : sa famille a des produits reçus ce mois-ci,
    // à signaler (story F5).
    const demoFamily = demoUsers.find(({ demoUser: u }) => u.email === "amapien.demo@example.org");
    const demoFamilyHousehold = householdMembers.find((m) => m.userId === demoFamily?.demoUser.id);
    const ordering = households
      .filter((h) => h.amapId === firstAmap.id)
      .filter(
        (h, index) =>
          index < 12 || (h.id === demoFamilyHousehold?.householdId && h.amapId === firstAmap.id),
      );
    ordering.forEach((h, index) => {
      for (const c of [0, 1].map(
        (k) => currentCatalogs[(index + 2 * k) % currentCatalogs.length],
      )) {
        if (!c) continue;
        const item = catalogItems.find((i) => i.catalogId === c.id);
        if (!item) continue;
        const orderId = nextId();
        orders.push({ id: orderId, amapId: firstAmap.id, householdId: h.id, catalogId: c.id });
        const quantity = 1 + (index % 2);
        for (const d of monthDistributions) {
          orderLines.push({
            id: nextId(),
            amapId: firstAmap.id,
            orderId,
            catalogItemId: item.id,
            distributionId: d.id,
            quantity,
            unitPriceCents: item.priceCents,
          });
        }
        const grossCents = quantity * item.priceCents * monthDistributions.length;
        cheques.push({
          id: nextId(),
          amapId: firstAmap.id,
          householdId: h.id,
          producerId: c.producerId,
          orderPeriodId: periodId,
          grossCents,
          creditsCents: 0,
          expectedCents: grossCents,
        });
      }
    });
  }

  // Adhésions (story B1), dans chaque AMAP : la plupart actives, et quelques foyers dans
  // chacun des autres états, pour voir le filtre de la liste. Les 12 premiers foyers (ceux qui
  // commandent) sont toujours adhérents.
  const memberships: SeedMembership[] = [];
  // amapien2.demo : adhésion expirée, pour voir la commande refusée ; les autres comptes de
  // démonstration qui ont un foyer : adhésion active (ils peuvent commander, story D3).
  const demoHouseholdState = new Map<string, "active" | "expired">();
  for (const { demoUser } of demoUsers) {
    for (const m of householdMembers.filter((x) => x.userId === demoUser.id)) {
      demoHouseholdState.set(
        m.householdId,
        demoUser.email === "amapien2.demo@example.org" ? "expired" : "active",
      );
    }
  }
  const todayDay = parisDay(today);
  for (const a of amaps) {
    households
      .filter((h) => h.amapId === a.id)
      .forEach((h, index) => {
        const add = (startDate: string, endDate: string) =>
          memberships.push({
            id: nextId(),
            amapId: a.id,
            householdId: h.id,
            startDate,
            endDate,
            feeCents: index % 4 === 0 ? null : 1500,
            note: "",
          });
        // Foyers des comptes de démonstration : état fixé, quel que soit leur rang.
        const demo = demoHouseholdState.get(h.id);
        if (demo === "expired") {
          add(addDays(todayDay, -400), addDays(todayDay, -35));
          return;
        }
        if (demo === "active") {
          add(addDays(todayDay, -100), addDays(todayDay, 264));
          return;
        }
        if (index % 20 === 19) return; // aucune adhésion
        if (index % 15 === 13) {
          add(addDays(todayDay, -352), addDays(todayDay, 12)); // expire bientôt
        } else if (index % 15 === 14) {
          add(addDays(todayDay, -400), addDays(todayDay, -35)); // expirée
        } else if (index === 12) {
          add(addDays(todayDay, 10), addDays(todayDay, 374)); // à venir
        } else {
          const start = addDays(todayDay, -100 - (index % 60));
          add(start, addDays(start, 364));
        }
      });
  }

  // Site public (story H2) : accueil, blog avec un billet publié et un brouillon, mentions
  // légales, dans chaque AMAP. Textes fictifs.
  const paragraphs = (...texts: string[]): RichDoc => ({
    type: "doc",
    content: texts.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
  });
  const pages: SeedPage[] = [];
  for (const a of amaps) {
    const blogId = nextId();
    const base = { amapId: a.id, summary: "", status: "published" as const, menuPosition: 0 };
    pages.push(
      {
        ...base,
        id: nextId(),
        parentId: null,
        role: "home",
        title: "Accueil",
        slug: "accueil",
        body: paragraphs(
          `Bienvenue à ${a.name}, une AMAP fictive qui sert à essayer Pomme.`,
          "Chaque semaine, des familles retrouvent leurs producteurs pour une distribution de légumes, de pain, d'œufs et de miel.",
        ),
        publishedOn: addDays(parisDay(today), -60),
        inMenu: true,
        menuPosition: 1,
      },
      {
        ...base,
        id: blogId,
        parentId: null,
        role: null,
        title: "Le blog",
        slug: "blog",
        body: paragraphs("Les nouvelles de l'AMAP : visites de ferme, fêtes et recettes."),
        publishedOn: addDays(parisDay(today), -60),
        inMenu: true,
        menuPosition: 2,
      },
      {
        ...base,
        id: nextId(),
        parentId: blogId,
        role: null,
        title: "Visite à la ferme d'essai",
        slug: "visite-ferme-essai",
        summary: "Une matinée au champ avec nos producteurs de légumes.",
        body: paragraphs(
          "Samedi dernier, une dizaine de familles ont visité la ferme d'essai.",
          "Merci à tous pour ce beau moment !",
        ),
        publishedOn: addDays(parisDay(today), -10),
        inMenu: false,
      },
      {
        ...base,
        id: nextId(),
        parentId: blogId,
        role: null,
        title: "Fête de fin d'année",
        slug: "fete-fin-annee",
        status: "draft",
        body: paragraphs("Texte à compléter."),
        publishedOn: null,
        inMenu: false,
      },
      {
        ...base,
        id: nextId(),
        parentId: null,
        role: null,
        title: "Nous rejoindre",
        slug: "nous-rejoindre",
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Une distribution par semaine, un engagement pour la saison avec nos producteurs. ",
                },
                {
                  type: "text",
                  text: "Envoyez-nous une demande d'adhésion",
                  marks: [{ type: "link", href: `/${a.slug}/adherer` }],
                },
                { type: "text", text: " : nous vous recontactons." },
              ],
            },
          ],
        },
        publishedOn: addDays(parisDay(today), -60),
        inMenu: true,
        menuPosition: 3,
      },
      {
        ...base,
        id: nextId(),
        parentId: null,
        role: "legal",
        title: "Mentions légales",
        slug: "mentions-legales",
        body: paragraphs(
          `Site de ${a.name}, association fictive du jeu de données de démonstration de Pomme.`,
        ),
        publishedOn: addDays(parisDay(today), -60),
        inMenu: false,
      },
    );
  }

  // Une demande d'adhésion à traiter dans la première AMAP (story B2). Personne fictive.
  const joinRequests: SeedJoinRequest[] = firstAmap
    ? [
        {
          id: nextId(),
          amapId: firstAmap.id,
          name: "Alix Exemple",
          email: "alix.exemple@example.org",
          phone: "+33639989001",
          message: "Bonjour, nous venons d'emménager et aimerions rejoindre l'AMAP.",
        },
      ]
    : [];

  // Disponibilités du prochain trimestre dans la première AMAP : période de réponse ouverte en
  // ce moment, et la réponse de 8 amapiens (pas celle des comptes de démonstration, pour qu'on
  // puisse essayer « Mes disponibilités » de zéro).
  const dutyPlans: SeedDutyPlan[] = [];
  const dutyResponses: SeedDutyResponse[] = [];
  const unavailabilities: SeedUnavailability[] = [];
  if (firstAmap) {
    const todayInParis = parisDay(today);
    const proposed = defaultDutyPlanDays(quarterStart);
    const opensOn = proposed.opensOn < todayInParis ? proposed.opensOn : addDays(todayInParis, -2);
    const latest = addDays(quarterStart, -1);
    const wanted =
      proposed.deadlineOn > addDays(todayInParis, 7)
        ? proposed.deadlineOn
        : addDays(todayInParis, 7);
    const deadlineOn = wanted < latest ? wanted : latest;
    const instants = periodInstants(opensOn, deadlineOn);
    const planId = nextId();
    dutyPlans.push({
      id: planId,
      amapId: firstAmap.id,
      quarterStart,
      opensAt: instants.opensAt,
      unavailabilityDeadline: instants.closesAt,
      openingNoticeAt: instants.opensAt,
    });
    const quarterDays = distributions.filter(
      (d) =>
        d.amapId === firstAmap.id &&
        d.isOpen &&
        d.date >= quarterStart &&
        d.date.slice(0, 7) <= lastMonth,
    );
    const demoIds = new Set(demoUsers.map(({ demoUser }) => demoUser.id));
    const answering = householdMembers
      .filter((m) => m.amapId === firstAmap.id && !demoIds.has(m.userId))
      .slice(0, 8);
    answering.forEach((member, index) => {
      dutyResponses.push({
        id: nextId(),
        amapId: firstAmap.id,
        dutyPlanId: planId,
        userId: member.userId,
        answeredAt: instants.opensAt,
      });
      // Une personne sur deux : une ou deux dates impossibles.
      if (index % 2 === 0) return;
      const picked = index % 3 === 0 ? [index, index + 4] : [index];
      for (const d of picked.map((k) => quarterDays[k])) {
        if (!d) continue;
        unavailabilities.push({
          id: nextId(),
          amapId: firstAmap.id,
          dutyPlanId: planId,
          userId: member.userId,
          distributionId: d.id,
        });
      }
    });
  }

  return {
    pages,
    joinRequests,
    users,
    amaps,
    roles,
    households,
    householdMembers,
    producers,
    amapProducers,
    referentAssignments,
    producerUsers,
    distributions,
    products,
    catalogs,
    catalogItems,
    availabilities,
    orderPeriods,
    orders,
    orderLines,
    cheques,
    memberships,
    dutyPlans,
    dutyResponses,
    unavailabilities,
    totpUserIds,
  };
}
