"use client";

import Button, { type ButtonProps } from "@mui/material/Button";
import Link from "next/link";

/**
 * Bouton MUI qui est un lien Next (navigation sans rechargement).
 *
 * Pourquoi un composant à part : dans une page serveur, on ne peut pas écrire
 * `<Button component={Link}>` (une fonction ne peut pas passer du serveur au navigateur).
 * Ce composant, lui, s'exécute côté navigateur.
 */
export function LinkButton({ href, ...props }: Omit<ButtonProps, "href"> & { href: string }) {
  return <Button component={Link} href={href} nativeButton={false} {...props} />;
}
