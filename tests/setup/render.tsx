import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";

import { DEFAULT_LOCALE, TIME_ZONE } from "@/i18n/config";
import messages from "@/i18n/messages/fr.json";

/**
 * Affiche un composant avec les textes français, comme dans l'application.
 * Sans ce fournisseur, useTranslations() ne trouverait pas les messages.
 */
export function renderWithIntl(ui: ReactElement, options?: RenderOptions) {
  return render(
    <NextIntlClientProvider locale={DEFAULT_LOCALE} timeZone={TIME_ZONE} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
    options,
  );
}
