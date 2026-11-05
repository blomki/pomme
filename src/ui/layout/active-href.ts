/**
 * Lien de navigation correspondant à la page courante : le plus long préfixe de l'adresse.
 * « /producteur/catalogue/pommes » active « /producteur/catalogue », pas « /producteur ».
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  const matches = hrefs.filter((href) => pathname === href || pathname.startsWith(`${href}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}
