import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Règles WCAG vérifiées : niveaux A et AA, versions 2.0 à 2.2 (base du RGAA 4.1). */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Analyse la page avec axe-core et échoue s'il reste une violation « serious » ou « critical »
 * (exigence du cahier technique). Le message d'erreur liste les règles en cause.
 */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
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
