import { useTranslations } from "next-intl";

// Accueil de la plateforme ([domaine]/). Les AMAP ont leur propre page : [domaine]/<adresse-de-l-amap>.
export default function HomePage() {
  const t = useTranslations("Home");
  return (
    <>
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
    </>
  );
}
