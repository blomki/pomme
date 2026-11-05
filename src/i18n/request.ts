import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, TIME_ZONE } from "./config";

// Pomme est en français en V1 : une seule langue, pas de préfixe /fr dans les adresses.
// Les textes vivent dans src/i18n/messages/<langue>.json ; ajouter une langue
// consistera à ajouter un fichier et à choisir la langue ici.
export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  return {
    locale,
    // Toutes les dates affichées par next-intl le sont à l'heure de Paris,
    // quel que soit le fuseau du serveur (Clever Cloud tourne en UTC).
    timeZone: TIME_ZONE,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
