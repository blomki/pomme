import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { createDatabase, type Database } from "@/db/client";
import { account, passkey as passkeyTable, session, user, verification } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";

import { magicLinkEmail } from "../email/magic-link-email";
import { sendEmail } from "../email/mailer";

import { AUTH_RATE_LIMIT_FACTOR } from "./rate-limit-factor";

/** Durée de validité d'un lien de connexion : 15 minutes. */
export const MAGIC_LINK_TTL_MINUTES = 15;
/** Durée d'une session sans activité avant reconnexion : 30 jours, prolongée chaque jour d'usage. */
const SESSION_DAYS = 30;

export type AuthOptions = {
  /** Connexion avec le rôle pomme_auth (seul à lire les tables de connexion). */
  db: Database;
  /** Adresse publique de l'application, ex. http://localhost:3000. */
  baseURL: string;
  /** Clé de signature des cookies (32 caractères au moins). */
  secret: string;
  sendMagicLink: (email: string, url: string) => Promise<void>;
};

/**
 * Configuration de Better Auth : connexion sans mot de passe (voir ADR 0005).
 *
 * - lien magique : à usage unique, valable 15 minutes, jeton stocké haché ; jamais de création
 *   de compte par ce biais (les comptes sont créés par les admins : invitations, story A2) ;
 * - passkeys : clé enregistrée sur l'appareil (empreinte, visage, code du téléphone) ;
 * - sessions : cookie HttpOnly, SameSite=Lax, Secure en HTTPS ; nouvelle session (nouveau
 *   jeton) à chaque connexion ;
 * - aucun mot de passe : la connexion email + mot de passe est désactivée.
 */
export function createAuth(options: AuthOptions) {
  const url = new URL(options.baseURL);
  return betterAuth({
    appName: "Pomme",
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(options.db, {
      provider: "pg",
      schema: { user, session, account, verification, passkey: passkeyTable },
    }),
    // Better Auth attend un champ « name » : on lui donne le prénom.
    user: { fields: { name: "firstName" } },
    emailAndPassword: { enabled: false },
    session: { expiresIn: SESSION_DAYS * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    advanced: {
      cookiePrefix: "pomme",
      useSecureCookies: url.protocol === "https:",
      database: { generateId: () => uuidv7() },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_MINUTES * 60,
        disableSignUp: true,
        storeToken: "hashed",
        sendMagicLink: ({ email, url: link }) => options.sendMagicLink(email, link),
        // Limiteur propre à Better Auth, actif en production seulement : 5 ouvertures de lien
        // par minute et par adresse IP (contre les essais de jetons au hasard). Assoupli comme
        // le nôtre pour les tests de bout en bout, qui tournent avec `pnpm start` en CI.
        rateLimit: { window: 60, max: 5 * AUTH_RATE_LIMIT_FACTOR },
      }),
      passkey({ rpID: url.hostname, rpName: "Pomme", origin: url.origin }),
      // Permet aux Server Actions de poser et d'effacer les cookies de session.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} n'est pas défini (voir .env.example).`);
  return value;
}

let instance: { auth: Auth; db: Database } | undefined;

/** Instance de l'application, créée au premier usage (le build n'a besoin d'aucune variable). */
export function getAuthInstance(): { auth: Auth; db: Database } {
  if (!instance) {
    const db = createDatabase(requireEnv("DATABASE_AUTH_URL"));
    const auth = createAuth({
      db,
      baseURL: requireEnv("BETTER_AUTH_URL"),
      secret: requireEnv("BETTER_AUTH_SECRET"),
      sendMagicLink: (email, link) =>
        sendEmail(email, magicLinkEmail(link, MAGIC_LINK_TTL_MINUTES)),
    });
    instance = { auth, db };
  }
  return instance;
}

export const getAuth = (): Auth => getAuthInstance().auth;
