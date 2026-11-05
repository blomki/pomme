/**
 * Polices servies par l'application elle-même (next/font/local) : aucun appel à Google Fonts,
 * donc aucune donnée de visiteur transmise à un tiers.
 *
 * - Carlito : texte courant, pour toutes les AMAP (mêmes dimensions que Calibri).
 * - Pattaya : titres de l'AMAP de Cambremer (une seule graisse, réservée aux titres).
 * Licence SIL Open Font License 1.1 (fichiers OFL-*.txt). Les fichiers sont les originaux,
 * seulement convertis en WOFF (format compressé) : la licence interdit de les modifier sans
 * les renommer.
 *
 * Chaque police est exposée comme variable CSS sur <html>, et le thème y fait référence.
 * Ce fichier n'est importé que par le gabarit racine (src/app/layout.tsx).
 */
import localFont from "next/font/local";

export const carlito = localFont({
  src: [
    { path: "./fonts/Carlito-Regular.woff", weight: "400", style: "normal" },
    { path: "./fonts/Carlito-Bold.woff", weight: "700", style: "normal" },
  ],
  variable: "--font-carlito",
  display: "swap",
  fallback: ["Calibri", "Arial", "sans-serif"],
});

export const pattaya = localFont({
  src: "./fonts/Pattaya-Regular.woff",
  weight: "400",
  variable: "--font-pattaya",
  display: "swap",
  fallback: ["Georgia", "serif"],
  preload: false, // utilisée par certaines AMAP seulement
});

/** Classes à poser sur <html> pour définir les variables --font-carlito et --font-pattaya. */
export const fontVariables = `${carlito.variable} ${pattaya.variable}`;
