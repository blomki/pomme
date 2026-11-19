import { describe, expect, it } from "vitest";

import { S3FileStore } from "./storage";
import { storageOrigin, storageSettings } from "./settings";

describe("storageSettings", () => {
  it("est éteint sans bucket ni identifiants", () => {
    expect(storageSettings({})).toBeNull();
    expect(storageSettings({ FILES_BUCKET: "pomme" })).toBeNull();
  });

  it("lit les variables de l'add-on Cellar de Clever Cloud", () => {
    expect(
      storageSettings({
        CELLAR_ADDON_HOST: "cellar-c2.services.clever-cloud.com",
        CELLAR_ADDON_KEY_ID: "id",
        CELLAR_ADDON_KEY_SECRET: "secret",
        FILES_BUCKET: "pomme-fichiers",
      }),
    ).toEqual({
      endpoint: "https://cellar-c2.services.clever-cloud.com",
      accessKeyId: "id",
      secretAccessKey: "secret",
      bucket: "pomme-fichiers",
    });
  });

  it("préfère les variables FILES_S3_* (MinIO en local)", () => {
    const settings = storageSettings({
      FILES_S3_ENDPOINT: "http://localhost:9000/",
      FILES_S3_ACCESS_KEY: "pomme",
      FILES_S3_SECRET_KEY: "pomme_dev",
      CELLAR_ADDON_HOST: "ignoré",
      FILES_BUCKET: "pomme-fichiers",
    });
    expect(settings?.endpoint).toBe("http://localhost:9000");
    expect(storageOrigin(settings)).toBe("http://localhost:9000");
    expect(storageOrigin(null)).toBeNull();
  });
});

describe("S3FileStore", () => {
  const store = new S3FileStore({
    endpoint: "http://localhost:9000",
    accessKeyId: "x",
    secretAccessKey: "y",
    bucket: "pomme-fichiers",
  });

  it("donne l'adresse publique d'un fichier, et retrouve sa clé", () => {
    const url = store.publicUrl("producteurs/a.webp");
    expect(url).toBe("http://localhost:9000/pomme-fichiers/producteurs/a.webp");
    expect(store.keyFromUrl(url)).toBe("producteurs/a.webp");
    // Une adresse d'ailleurs n'est jamais prise pour un de nos fichiers (rien à supprimer).
    expect(store.keyFromUrl("https://exemple.org/pomme-fichiers/producteurs/a.webp")).toBeNull();
  });
});
