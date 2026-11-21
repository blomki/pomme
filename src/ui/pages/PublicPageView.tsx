"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { formatDate } from "@/i18n/dates";
import type { PublicHome, PublicPage } from "@/server/pages";

import { m3 } from "../theme/create-theme";

import { RichTextView } from "./RichTextView";

const longDay = (date: string) => formatDate(`${date}T12:00:00Z`, "EEEE d MMMM yyyy");

/**
 * Une page du site public (story H2) : retour à la page parente pour une sous-page, titre,
 * date (sous-page), image principale, texte, puis la liste des sous-pages publiées.
 */
export function PublicPageView({ amapSlug, page }: { amapSlug: string; page: PublicPage }) {
  const t = useTranslations("PublicSite");
  const base = `/${amapSlug}`;
  return (
    <Stack component="article" spacing={3}>
      {page.parent && (
        <MuiLink component={Link} href={`${base}${page.parent.path}`}>
          {t("backTo", { title: page.parent.title })}
        </MuiLink>
      )}
      <Box>
        <Typography variant="h1">{page.title}</Typography>
        {page.parent && page.publishedOn && (
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {t("publishedOn", { date: longDay(page.publishedOn) })}
          </Typography>
        )}
      </Box>
      {page.imageUrl && (
        <Box
          component="img"
          src={page.imageUrl}
          alt={page.imageAlt}
          sx={{
            width: "100%",
            height: "auto",
            maxHeight: 420,
            objectFit: "cover",
            borderRadius: 3,
          }}
        />
      )}
      <RichTextView doc={page.body} />
      {page.children.length > 0 && (
        <Box component="section" aria-labelledby="sous-pages">
          <Typography id="sous-pages" variant="headlineSmall" component="h2" sx={{ mb: 2 }}>
            {t("children")}
          </Typography>
          <Stack spacing={2}>
            {page.children.map((child) => (
              <Card key={child.path} variant="outlined">
                <CardActionArea component={Link} href={`${base}${child.path}`}>
                  <CardContent>
                    <Typography variant="titleLarge" component="h3">
                      {child.title}
                    </Typography>
                    {child.publishedOn && (
                      <Typography variant="bodySmall" component="p" color="text.secondary">
                        {longDay(child.publishedOn)}
                      </Typography>
                    )}
                    {child.summary && (
                      <Typography variant="bodyMedium" component="p" sx={{ mt: 1 }}>
                        {child.summary}
                      </Typography>
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

/**
 * Accueil du site public : le contenu de la page d'accueil (s'il est publié), puis les blocs
 * remplis automatiquement (prochaine distribution, producteurs, dernier billet).
 */
export function PublicHomeView({
  amap,
  page,
  home,
}: {
  amap: { slug: string; name: string };
  page: PublicPage | null;
  home: PublicHome;
}) {
  const t = useTranslations("PublicSite");
  const base = `/${amap.slug}`;
  const next = home.nextDistribution;
  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h1" gutterBottom>
          {page?.title && page.title !== "Accueil" ? page.title : amap.name}
        </Typography>
        {page ? <RichTextView doc={page.body} /> : <Typography>{t("welcome")}</Typography>}
      </Box>

      <Box
        component="section"
        aria-labelledby="prochaine-distribution"
        sx={{
          p: 2.5,
          borderRadius: 4,
          bgcolor: m3("primaryContainer"),
          color: m3("onPrimaryContainer"),
        }}
      >
        <Typography id="prochaine-distribution" variant="titleLarge" component="h2">
          {t("nextDistribution")}
        </Typography>
        <Typography sx={{ mt: 0.5, "&::first-letter": { textTransform: "uppercase" } }}>
          {next
            ? t("distributionOn", {
                date: longDay(next.date),
                start: next.startTime,
                end: next.endTime,
              })
            : t("noDistribution")}
        </Typography>
        {next?.place && <Typography>{next.place}</Typography>}
      </Box>

      {home.producers.length > 0 && (
        <Box component="section" aria-labelledby="producteurs">
          <Typography id="producteurs" variant="headlineSmall" component="h2" sx={{ mb: 2 }}>
            {t("producers")}
          </Typography>
          <Box
            component="ul"
            sx={{
              m: 0,
              p: 0,
              listStyle: "none",
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            }}
          >
            {home.producers.map((p) => (
              <Card key={p.name} component="li" variant="outlined">
                {p.photoUrl && (
                  <Box
                    component="img"
                    src={p.photoUrl}
                    alt={p.photoAlt}
                    sx={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
                  />
                )}
                <CardContent>
                  <Typography variant="titleMedium" component="h3">
                    {p.name}
                  </Typography>
                  {p.category && (
                    <Typography variant="bodySmall" component="p" color="text.secondary">
                      {p.category}
                    </Typography>
                  )}
                  {p.shortDescription && (
                    <Typography variant="bodyMedium" component="p" sx={{ mt: 1 }}>
                      {p.shortDescription}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      )}

      {home.latestPost && (
        <Box component="section" aria-labelledby="dernier-billet">
          <Typography id="dernier-billet" variant="headlineSmall" component="h2" sx={{ mb: 2 }}>
            {t("latestPost")}
          </Typography>
          <Card variant="outlined">
            <CardActionArea component={Link} href={`${base}${home.latestPost.path}`}>
              <CardContent>
                <Typography variant="titleLarge" component="h3">
                  {home.latestPost.title}
                </Typography>
                {home.latestPost.publishedOn && (
                  <Typography variant="bodySmall" component="p" color="text.secondary">
                    {longDay(home.latestPost.publishedOn)}
                  </Typography>
                )}
                {home.latestPost.summary && (
                  <Typography variant="bodyMedium" component="p" sx={{ mt: 1 }}>
                    {home.latestPost.summary}
                  </Typography>
                )}
              </CardContent>
            </CardActionArea>
          </Card>
        </Box>
      )}
    </Stack>
  );
}
