import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { magicLink, twoFactor } from "better-auth/plugins";

import { createDatabase, type Database } from "@/db/client";
import {
  account,
  passkey as passkeyTable,
  session,
  twoFactor as twoFactorTable,
  user,
  verification,
} from "@/db/schema";
import { canManageFactors } from "@/domain/second-factor";
import { uuidv7 } from "@/db/uuid";

import { magicLinkEmail } from "../email/magic-link-email";
import { sendEmail } from "../email/mailer";

import { AUTH_RATE_LIMIT_FACTOR } from "./rate-limit-factor";
import { loadAccountFactors, markSessionVerified, toFacts } from "./second-factor-facts";

/** Connexions qui valent deuxième vérification : passkey, ou activation de l'application. */
const SECOND_FACTOR_PATHS = new Set([
  "/passkey/verify-authentication",
  "/passkey/authenticate",
  "/two-factor/verify-totp",
]);

/** Ajouter ou retirer un moyen de vérification (voir canManageFactors). */
const FACTOR_MANAGEMENT_PATHS = new Set([
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/register",
  "/passkey/delete-passkey",
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/generate-backup-codes",
]);

/** Fin de l'enregistrement d'une passkey. */
const PASSKEY_REGISTERED_PATHS = new Set(["/passkey/verify-registration", "/passkey/register"]);

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
 * - aucun mot de passe : la connexion email + mot de passe est désactivée ;
 * - deuxième vérification (admins et gestionnaires) : passkey ou application d'authentification
 *   (TOTP), notée sur la session (second_factor_verified_at). Better Auth ne la demande
 *   qu'après un mot de passe : Pomme l'impose elle-même après un lien magique (ADR 0005).
 */
export function createAuth(options: AuthOptions) {
  const url = new URL(options.baseURL);
  return betterAuth({
    appName: "Pomme",
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(options.db, {
      provider: "pg",
      schema: {
        user,
        session,
        account,
        verification,
        passkey: passkeyTable,
        twoFactor: twoFactorTable,
      },
    }),
    // Better Auth attend un champ « name » : on lui donne le prénom.
    user: { fields: { name: "firstName" } },
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: SESSION_DAYS * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      additionalFields: {
        secondFactorVerifiedAt: { type: "date", required: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Une session ouverte par passkey, ou recréée à l'activation de l'application
          // d'authentification (premier code juste), est vérifiée d'emblée.
          before: async (data, ctx) =>
            ctx?.path && SECOND_FACTOR_PATHS.has(ctx.path)
              ? { data: { ...data, secondFactorVerifiedAt: new Date() } }
              : undefined,
        },
      },
    },
    hooks: {
      // Ajouter ou retirer une passkey ou l'application : refusé à un admin qui a déjà un moyen
      // de vérification mais ne s'en est pas servi sur cette session.
      before: createAuthMiddleware(async (ctx) => {
        if (!FACTOR_MANAGEMENT_PATHS.has(ctx.path)) return;
        const current = await getSessionFromCtx(ctx);
        if (!current) return; // Better Auth refusera lui-même (connexion requise)
        const factors = await loadAccountFactors(options.db, current.user.id);
        const verifiedAt = (current.session as { secondFactorVerifiedAt?: Date | null })
          .secondFactorVerifiedAt;
        if (!canManageFactors(toFacts(factors, verifiedAt ?? null))) {
          throw new APIError("FORBIDDEN", { message: "SECOND_FACTOR_REQUIRED" });
        }
      }),
      // Première passkey d'un admin, créée juste après un lien magique : la session est
      // vérifiée (choix validé pour la story A1, voir ADR 0005).
      after: createAuthMiddleware(async (ctx) => {
        if (!PASSKEY_REGISTERED_PATHS.has(ctx.path)) return;
        const current = await getSessionFromCtx(ctx);
        if (!current) return;
        const factors = await loadAccountFactors(options.db, current.user.id);
        if (factors.required && factors.passkeys === 1 && !factors.totp) {
          await markSessionVerified(options.db, current.session.token);
        }
      }),
    },
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
      twoFactor({
        issuer: "Pomme",
        // Pas de mot de passe dans Pomme : l'activation se fait depuis une session ouverte.
        allowPasswordless: true,
        // Codes de secours à usage unique, stockés chiffrés.
        backupCodeOptions: { amount: 10, storeBackupCodes: "encrypted" },
      }),
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
