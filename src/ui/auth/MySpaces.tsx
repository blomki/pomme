import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { spacePath, type AmapSpace } from "@/domain/spaces";

import { LinkButton } from "../navigation/LinkButton";

/** « Mes espaces » : un lien par espace du compte (AMAP, producteur, plateforme). */
export async function MySpaces({
  spaces,
  isPlatformAdmin,
  isProducer,
}: {
  spaces: AmapSpace[];
  isPlatformAdmin: boolean;
  isProducer: boolean;
}) {
  const t = await getTranslations("Auth.account");
  const links = [
    ...spaces.map((space) => ({
      href: spacePath(space),
      label: t(`space.${space.kind}`, { amap: space.amapName }),
    })),
    ...(isProducer ? [{ href: "/producteur", label: t("space.producer") }] : []),
    ...(isPlatformAdmin ? [{ href: "/plateforme", label: t("space.platform") }] : []),
  ];
  return (
    <Stack component="section" aria-labelledby="espaces" spacing={1}>
      <Typography id="espaces" variant="h2">
        {t("spaces")}
      </Typography>
      {links.length === 0 ? (
        <Typography>{t("noSpace")}</Typography>
      ) : (
        <List disablePadding>
          {links.map((link) => (
            <ListItem key={link.href} disableGutters>
              <LinkButton href={link.href} variant="tonal">
                {link.label}
              </LinkButton>
            </ListItem>
          ))}
        </List>
      )}
    </Stack>
  );
}
