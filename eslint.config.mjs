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
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
      "src/ui/theme/vendor/**",
      "next-env.d.ts",
    ],
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
  {
    // detect-object-injection signale toute lecture objet[variable], sans voir les types.
    // En TypeScript, la clé est presque toujours d'un type fermé (ex. scheme[role] avec
    // role: M3Role) : la règle ne produit que des faux positifs, qui masqueraient les vrais
    // avertissements. Les entrées venant de l'extérieur sont, elles, validées par Zod.
    files: ["**/*.{ts,tsx,mts}"],
    rules: { "security/detect-object-injection": "off" },
  },
  prettier,
];

export default eslintConfig;
