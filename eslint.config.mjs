// Configuration ESLint (format « flat config », ESLint 9).
// Ordre : règles Next.js et React → TypeScript → accessibilité → sécurité → Prettier en dernier,
// pour que Prettier désactive les règles de mise en forme qui feraient doublon.
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import security from "eslint-plugin-security";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "playwright-report/**", "next-env.d.ts"],
  },
  ...nextVitals,
  ...nextTypescript,
  // eslint-config-next déclare déjà le plugin jsx-a11y mais n'active que quelques règles :
  // on ajoute l'ensemble recommandé (objectif RGAA 4.1 / WCAG 2.2 AA) sans redéclarer le plugin.
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  security.configs.recommended,
  prettier,
];

export default eslintConfig;
