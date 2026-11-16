import { describe, expect, it } from "vitest";

import {
  maskEmails,
  scrubEvent,
  sentryDsn,
  sentryOptions,
  sentryOrigin,
  stripQuery,
} from "./sentry";

const EU_DSN = "https://abc123@o4507.ingest.de.sentry.io/4508";

describe("sentryDsn", () => {
  it("accepte une clé de la région UE", () => {
    expect(sentryDsn(EU_DSN)).toBe(EU_DSN);
  });

  it("refuse une clé hors UE, mal formée ou vide", () => {
    expect(sentryDsn("https://abc123@o4507.ingest.us.sentry.io/4508")).toBeNull();
    expect(sentryDsn("https://abc123@o4507.ingest.sentry.io/4508")).toBeNull();
    expect(sentryDsn("http://abc123@o4507.ingest.de.sentry.io/4508")).toBeNull();
    expect(sentryDsn("https://o4507.ingest.de.sentry.io/4508")).toBeNull();
    expect(sentryDsn("https://abc@o1.ingest.de.sentry.io.attaquant.example/1")).toBeNull();
    expect(sentryDsn("pas une adresse")).toBeNull();
    expect(sentryDsn("")).toBeNull();
    expect(sentryDsn(undefined)).toBeNull();
  });
});

describe("sentryOrigin", () => {
  it("donne l'origine à autoriser dans la CSP", () => {
    expect(sentryOrigin(EU_DSN)).toBe("https://o4507.ingest.de.sentry.io");
    expect(sentryOrigin(null)).toBeNull();
  });
});

describe("maskEmails et stripQuery", () => {
  it("masque les adresses email", () => {
    expect(maskEmails("Échec pour sasha.demo@example.org (foyer 3)")).toBe(
      "Échec pour [email] (foyer 3)",
    );
  });

  it("retire les paramètres et l'ancre d'une adresse", () => {
    expect(stripQuery("https://pomme.cloud/api/auth/verify?token=secret#x")).toBe(
      "https://pomme.cloud/api/auth/verify",
    );
    expect(stripQuery("/hommesdeterre/admin")).toBe("/hommesdeterre/admin");
  });
});

describe("scrubEvent", () => {
  it("retire tout ce qui peut désigner une personne et garde l'erreur", () => {
    const event = scrubEvent({
      user: { id: "u1", email: "a@example.org", ip_address: "1.2.3.4" },
      breadcrumbs: [{ message: "saisie" }],
      extra: { body: "…" },
      message: "Refus pour a@example.org",
      request: {
        url: "https://pomme.cloud/connexion?email=a%40example.org",
        cookies: { session: "s" },
        headers: { cookie: "s" },
        data: { email: "a@example.org" },
        query_string: "email=a%40example.org",
      },
      exception: { values: [{ value: "Doublon : b@example.org" }, {}] },
    });

    expect(event).toEqual({
      message: "Refus pour [email]",
      request: { url: "https://pomme.cloud/connexion" },
      exception: { values: [{ value: "Doublon : [email]" }, {}] },
    });
  });

  it("accepte un événement presque vide", () => {
    expect(scrubEvent({})).toEqual({});
  });
});

describe("sentryOptions", () => {
  it("laisse Sentry éteint sans clé valable", () => {
    expect(sentryOptions({})).toBeNull();
    expect(
      sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: "https://a@o1.ingest.us.sentry.io/1" }),
    ).toBeNull();
  });

  it("allume Sentry sans données personnelles ni mesure de performance", () => {
    const options = sentryOptions({
      NEXT_PUBLIC_SENTRY_DSN: EU_DSN,
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "preprod",
    });
    expect(options).toMatchObject({
      dsn: EU_DSN,
      environment: "preprod",
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      tracesSampleRate: 0,
    });
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: EU_DSN })?.environment).toBe("production");
  });
});
