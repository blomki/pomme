"use client";

import Box from "@mui/material/Box";
import { useColorScheme } from "@mui/material/styles";
import { useEffect, useRef } from "react";

type Widget = { reset(): void; destroy(): void };

/**
 * Largeur du widget Friendly Captcha (316 px, fixée par sa bibliothèque, réduite seulement si
 * l'écran est plus étroit). Les formulaires qui l'affichent s'alignent dessus (fiche #123) :
 * leur largeur maximale ne dépend plus d'une valeur choisie au hasard.
 */
export const CAPTCHA_WIDTH = 316;

/**
 * Fond du widget, en clair et en sombre (valeurs de sa bibliothèque). Exception assumée à la
 * règle « pas de couleur en dur » : la carte qui l'entoure doit avoir exactement le même fond,
 * et ce fond n'est pas une couleur de notre thème.
 */
export const CAPTCHA_BACKGROUND = { light: "#fafafa", dark: "#171717" } as const;

/**
 * Widget Friendly Captcha, à placer dans un formulaire public (voir ADR 0007).
 *
 * Il se lance dès qu'on commence à remplir le formulaire (startMode "focus") et place sa réponse
 * dans le champ caché `frc-captcha-response`, vérifié par le serveur. Rien n'est affiché si le
 * captcha est désactivé (sitekey vide : développement, tests).
 *
 * `resetKey` : changer sa valeur (par exemple après une réponse du serveur) redémarre le calcul,
 * car une réponse de captcha ne sert qu'une fois.
 */
export function Captcha({
  sitekey,
  endpoint = "global",
  resetKey,
}: {
  sitekey: string | null;
  /** Point d'accès, le même que celui de la vérification côté serveur (server/captcha.ts). */
  endpoint?: "eu" | "global";
  resetKey?: unknown;
}) {
  const element = useRef<HTMLDivElement>(null);
  const widget = useRef<Widget | null>(null);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? "dark" : "light";

  useEffect(() => {
    if (!sitekey || !element.current) return;
    const mount = element.current;
    let cancelled = false;
    // Chargé seulement dans le navigateur, et seulement sur les pages qui en ont besoin.
    void import("@friendlycaptcha/sdk").then(({ FriendlyCaptchaSDK }) => {
      if (cancelled) return;
      widget.current = new FriendlyCaptchaSDK().createWidget({
        element: mount,
        sitekey,
        apiEndpoint: endpoint,
        language: "fr",
        startMode: "focus",
        theme,
      });
    });
    return () => {
      cancelled = true;
      widget.current?.destroy();
      widget.current = null;
      mount.replaceChildren();
    };
  }, [sitekey, endpoint, theme]);

  useEffect(() => {
    widget.current?.reset();
  }, [resetKey]);

  if (!sitekey) return null;
  return <Box ref={element} className="frc-captcha" sx={{ minHeight: 70 }} />;
}
