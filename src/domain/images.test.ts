import { describe, expect, it } from "vitest";

import {
  checkUpload,
  cleanAltText,
  detectImageFormat,
  MAX_ALT_LENGTH,
  MAX_UPLOAD_BYTES,
} from "./images";

const bytes = (...values: number[]) => new Uint8Array(values);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
// « RIFF », taille, « WEBP ».
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);

describe("detectImageFormat", () => {
  it("reconnaît JPEG, PNG et WebP à leurs premiers octets", () => {
    expect(detectImageFormat(JPEG)).toBe("jpeg");
    expect(detectImageFormat(PNG)).toBe("png");
    expect(detectImageFormat(WEBP)).toBe("webp");
  });

  it("refuse ce qui n'est pas une image acceptée, quel que soit le nom du fichier", () => {
    // Un fichier SVG (peut contenir du script) ou HTML renommé en .jpg.
    expect(detectImageFormat(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    // GIF : pas accepté.
    expect(detectImageFormat(new TextEncoder().encode("GIF89a"))).toBeNull();
    // « RIFF » sans « WEBP » (un fichier son WAV, par exemple).
    expect(
      detectImageFormat(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45)),
    ).toBeNull();
    expect(detectImageFormat(bytes(0xff, 0xd8))).toBeNull();
    expect(detectImageFormat(bytes())).toBeNull();
  });
});

describe("checkUpload", () => {
  it("accepte une image d'un format accepté, jusqu'à la taille maximale", () => {
    expect(checkUpload({ size: 1000, head: JPEG })).toBeNull();
    expect(checkUpload({ size: MAX_UPLOAD_BYTES, head: PNG })).toBeNull();
  });

  it("refuse un fichier vide, trop lourd, ou qui n'est pas une image", () => {
    expect(checkUpload({ size: 0, head: bytes() })).toBe("empty");
    expect(checkUpload({ size: MAX_UPLOAD_BYTES + 1, head: JPEG })).toBe("too_large");
    expect(checkUpload({ size: 20, head: new TextEncoder().encode("%PDF-1.7") })).toBe("not_image");
  });
});

describe("cleanAltText", () => {
  it("retire les espaces en trop", () => {
    expect(cleanAltText("  Marie   dans son verger ")).toBe("Marie dans son verger");
    expect(cleanAltText("   ")).toBe("");
  });

  it("refuse un texte trop long", () => {
    expect(cleanAltText("a".repeat(MAX_ALT_LENGTH))).toHaveLength(MAX_ALT_LENGTH);
    expect(cleanAltText("a".repeat(MAX_ALT_LENGTH + 1))).toBeNull();
  });
});
