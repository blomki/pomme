import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Règles WCAG vérifiées : niveaux A et AA, versions 2.0 à 2.2 (base du RGAA 4.1). */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Analyse la page avec axe-core et échoue s'il reste une violation « serious » ou « critical »
 * (exigence du cahier technique). Le message d'erreur liste les règles en cause.
 */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  // Après un clic, la souris reste sur le bouton : son infobulle apparaît en fondu, et axe
  // mesurait parfois le contraste d'un texte encore à moitié transparent (échec au hasard).
  // On écarte la souris et on attend que l'infobulle soit partie : elle n'est pas le contenu
  // de la page, et son contraste une fois affichée est vérifié par le thème (create-theme.ts).
  await page.mouse.move(0, 0);
  await expect(page.locator(".MuiTooltip-popper")).toHaveCount(0);
  // Même cause, autre élément : une puce qui vient de changer d'état (« Contactée »,
  // « Publié ») passe d'une couleur à l'autre en 300 ms. axe mesurait parfois le contraste d'une
  // couleur intermédiaire, surtout avec le build de production, plus rapide. On attend la fin
  // des animations et transitions en cours (les animations infinies, comme un indicateur de
  // chargement, sont ignorées).
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    // Balise ajoutée par Next.js quand une page redirige après avoir commencé à envoyer son HTML
    // (<meta id="__next-page-redirect" http-equiv="refresh">) : filet de secours pour un
    // navigateur sans JavaScript. Avec JavaScript, la redirection est immédiate et la balise
    // reste sans effet. Selon le rythme du serveur, elle apparaît ou non : sans cette
    // exclusion, le test échouait au hasard. La règle meta-refresh reste vérifiée partout
    // ailleurs.
    .exclude("#__next-page-redirect")
    .analyze();
  const blocking = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      rule: violation.id,
      impact: violation.impact,
      help: violation.help,
      elements: violation.nodes.map((node) => node.target.join(" ")),
    }));
  expect(blocking, "Violations d'accessibilité bloquantes").toEqual([]);
}
