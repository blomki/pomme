// pnpm jobs:hourly — tâches planifiées, lancées une fois par heure par Clever Cloud
// (clevercloud/cron.json, ADR 0015) : ouverture et clôture automatiques des périodes de
// commande (story D2), puis rappel avant la clôture aux foyers sans commande (story D5). Avec le rôle de l'application (DATABASE_URL), donc sous la
// Row Level Security, comme les pages.
import { createDatabase } from "@/db/client";
import { requireEnv, runScript } from "@/db/scripts/env";
import { runOrderPeriodTransitions } from "@/server/order-periods";
import { runOrderReminders } from "@/server/order-reminders";

runScript(async () => {
  const db = createDatabase(requireEnv("DATABASE_URL"));
  try {
    const report = await runOrderPeriodTransitions(db);
    for (const { amapId, month, action } of report) {
      console.log(
        `Période ${month} de l'AMAP ${amapId} : ${action === "open" ? "ouverte" : "clôturée"}.`,
      );
    }
    const reminders = await runOrderReminders(db);
    for (const { amapId, month, sent, skipped, failed } of reminders) {
      console.log(
        `Rappel avant clôture ${month}, AMAP ${amapId} : ${sent} envoyé(s), ${skipped} déjà fait(s), ${failed} en échec.`,
      );
    }
    console.log(`Tâches horaires terminées (${report.length} changement(s)).`);
  } finally {
    await db.$client.end();
  }
});
