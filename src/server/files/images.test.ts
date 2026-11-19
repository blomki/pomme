import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { reencodeImage } from "./images";

/** Photo de test : JPEG uni, avec des métadonnées (dont une position GPS). */
async function photoWithGps(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#4a7f3a" } })
    .withExif({
      IFD0: { Make: "Téléphone d'essai", Copyright: "Ferme d'essai" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "49/1 8/1 0/1" },
    })
    .jpeg()
    .toBuffer();
}

describe("reencodeImage", () => {
  it("réécrit en WebP, à la taille de l'usage, sans les métadonnées", async () => {
    const input = await photoWithGps(3000, 2000);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const output = await reencodeImage(input, "producer_photo");
    expect(output).toMatchObject({ contentType: "image/webp", width: 1200, height: 800 });
    const meta = await sharp(output.body).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it("n'agrandit pas une petite image", async () => {
    const output = await reencodeImage(await photoWithGps(300, 200), "amap_logo");
    expect(output).toMatchObject({ width: 300, height: 200 });
  });

  it("ne garde rien de ce qui est caché après l'image", async () => {
    const hidden = Buffer.from("<script>alert('piège')</script>");
    const input = Buffer.concat([await photoWithGps(200, 200), hidden]);
    const output = await reencodeImage(input, "product_photo");
    expect(Buffer.from(output.body).includes(hidden)).toBe(false);
  });

  it("refuse ce qui n'est pas une image lisible", async () => {
    await expect(
      reencodeImage(new TextEncoder().encode("pas une image"), "producer_photo"),
    ).rejects.toThrow();
    // Début de JPEG puis rien : fichier tronqué.
    await expect(
      reencodeImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "producer_photo"),
    ).rejects.toThrow();
  });

  it("refuse une image démesurée (bombe de décompression)", async () => {
    // 7 200 × 7 000 points : plus de 50 millions, pour quelques centaines d'octets en PNG.
    const bomb = await sharp({
      create: { width: 7200, height: 7000, channels: 3, background: "#000" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(reencodeImage(bomb, "producer_photo")).rejects.toThrow();
  });
});
