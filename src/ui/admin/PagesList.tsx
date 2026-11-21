"use client";

import ArrowBackIosNew from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIos from "@mui/icons-material/ArrowForwardIos";
import SubdirectoryArrowRight from "@mui/icons-material/SubdirectoryArrowRight";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";

import type { PageStatus } from "@/domain/pages";
import { formatDate } from "@/i18n/dates";
import type { AdminPageRow, AdminPages } from "@/server/pages";
import { movePageInMenuAction, setPageInMenuAction } from "@/server/pages-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";
import type { M3Role } from "../theme/m3-colors";
import { visuallyHidden } from "../visually-hidden";

const STATUS: Record<PageStatus, [M3Role, M3Role]> = {
  published: ["secondaryContainer", "onSecondaryContainer"],
  draft: ["tertiaryContainer", "onTertiaryContainer"],
  unpublished: ["surfaceContainerHighest", "onSurfaceVariant"],
};

/** Pastille de statut d'une page : publiée, brouillon, dépubliée. */
export function PageStatusChip({ status }: { status: PageStatus }) {
  const t = useTranslations("Admin.pages");
  const [bg, fg] = STATUS[status];
  return (
    <Chip
      size="small"
      label={t(`status.${status}`)}
      sx={{ bgcolor: m3(bg), color: m3(fg), fontWeight: 500 }}
    />
  );
}

/**
 * Écran « Pages » (story H2, écran A6) : le menu du site (flèches pour réordonner), puis la
 * liste des pages principales et de leurs sous-pages, avec « Dans le menu », la date, le statut,
 * « + Sous-page » et « Modifier ».
 */
export function PagesList({
  amapSlug,
  siteAddress,
  data,
}: {
  amapSlug: string;
  /** Adresse du site public, affichée (« pomme.example.org/hommesdeterre »). */
  siteAddress: string;
  data: AdminPages;
}) {
  const t = useTranslations("Admin.pages");
  const router = useRouter();
  const showSnackbar = useSnackbar();
  const [pending, setPending] = useState(false);
  const admin = `/${amapSlug}/admin/pages`;

  const act = async (run: () => Promise<{ status: string }>) => {
    setPending(true);
    const result = await run();
    setPending(false);
    if (result.status !== "saved") showSnackbar({ message: t("error") });
    router.refresh();
  };

  const row = (p: AdminPageRow, child: boolean) => (
    <TableRow key={p.id} sx={child ? { bgcolor: m3("surfaceContainerLowest") } : undefined}>
      <TableCell sx={{ pl: child ? 5 : 2 }}>
        <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
          {child && (
            <SubdirectoryArrowRight fontSize="small" aria-hidden sx={{ color: "text.secondary" }} />
          )}
          <Box>
            <Typography variant="bodyMedium" sx={{ fontWeight: child ? 400 : 500 }}>
              {p.title}
            </Typography>
            <Typography variant="bodySmall" color="text.secondary">
              /{amapSlug}
              {p.path}
            </Typography>
          </Box>
        </Stack>
      </TableCell>
      <TableCell>
        {child ? (
          <span aria-hidden>—</span>
        ) : (
          <FormControlLabel
            control={
              <Checkbox
                checked={p.inMenu}
                disabled={pending}
                onChange={(e) =>
                  void act(() =>
                    setPageInMenuAction(amapSlug, { pageId: p.id, inMenu: e.target.checked }),
                  )
                }
                slotProps={{ input: { "aria-label": t("inMenuOf", { title: p.title }) } }}
              />
            }
            label={
              p.inMenu
                ? t("menuPosition", { position: data.menu.findIndex((m) => m.id === p.id) + 1 })
                : t("notInMenu")
            }
          />
        )}
      </TableCell>
      <TableCell>
        {p.publishedOn ? formatDate(`${p.publishedOn}T12:00:00Z`, "dd/MM/yyyy") : "—"}
      </TableCell>
      <TableCell>
        <PageStatusChip status={p.status} />
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        {!child && p.role === null && (
          <Button
            component={Link}
            nativeButton={false}
            href={`${admin}/nouvelle?parent=${p.id}`}
            size="small"
          >
            {t("addChild")}
            <Box component="span" sx={visuallyHidden}>
              {t("addChildOf", { title: p.title })}
            </Box>
          </Button>
        )}
        <Button component={Link} nativeButton={false} href={`${admin}/${p.id}`} size="small">
          {t("edit")}
          <Box component="span" sx={visuallyHidden}>
            {` ${p.title}`}
          </Box>
        </Button>
      </TableCell>
    </TableRow>
  );

  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "flex-end", gap: 2, flexWrap: "wrap" }}
      >
        <Box>
          <Typography variant="h1">{t("title")}</Typography>
          <Typography color="text.secondary">{t("site", { address: siteAddress })}</Typography>
        </Box>
        <Stack direction="row" sx={{ gap: 1.5, flexWrap: "wrap" }}>
          <Button component={Link} nativeButton={false} href={`/${amapSlug}`} variant="outlined">
            {t("viewSite")}
          </Button>
          <Button
            component={Link}
            nativeButton={false}
            href={`${admin}/nouvelle`}
            variant="contained"
          >
            {t("newPage")}
          </Button>
        </Stack>
      </Stack>

      <Paper variant="outlined" component="section" aria-labelledby="menu-du-site" sx={{ p: 2.5 }}>
        <Typography id="menu-du-site" variant="titleMedium" component="h2">
          {t("menuTitle")}
        </Typography>
        <Typography variant="bodySmall" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          {t("menuHint")}
        </Typography>
        {data.menu.length === 0 ? (
          <Typography variant="bodyMedium">{t("menuEmpty")}</Typography>
        ) : (
          <Stack
            component="ol"
            direction="row"
            sx={{ m: 0, p: 0, listStyle: "none", gap: 1, flexWrap: "wrap" }}
          >
            {data.menu.map((m, index) => (
              <Stack
                key={m.id}
                component="li"
                direction="row"
                sx={{
                  alignItems: "center",
                  gap: 0.5,
                  pl: 1.5,
                  pr: 0.5,
                  py: 0.25,
                  borderRadius: 2,
                  bgcolor: m3("surfaceContainer"),
                }}
              >
                <Typography variant="bodyMedium">{m.title}</Typography>
                <IconButton
                  size="small"
                  aria-label={t("moveUp", { title: m.title })}
                  disabled={pending || index === 0}
                  onClick={() =>
                    void act(() => movePageInMenuAction(amapSlug, { pageId: m.id, delta: -1 }))
                  }
                >
                  <ArrowBackIosNew fontSize="inherit" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={t("moveDown", { title: m.title })}
                  disabled={pending || index === data.menu.length - 1}
                  onClick={() =>
                    void act(() => movePageInMenuAction(amapSlug, { pageId: m.id, delta: 1 }))
                  }
                >
                  <ArrowForwardIos fontSize="inherit" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table aria-label={t("tableLabel")}>
          <TableHead>
            <TableRow>
              <TableCell>{t("columns.page")}</TableCell>
              <TableCell>{t("columns.menu")}</TableCell>
              <TableCell>{t("columns.date")}</TableCell>
              <TableCell>{t("columns.status")}</TableCell>
              <TableCell>
                <Box component="span" sx={visuallyHidden}>
                  {t("columns.actions")}
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.pages.map((p) => (
              <Fragment key={p.id}>
                {row(p, false)}
                {p.children.map((c) => row(c, true))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography
        variant="bodyMedium"
        color="text.secondary"
        sx={{ p: 2, borderRadius: 3, bgcolor: m3("surfaceContainerLow") }}
      >
        {t("note")}
      </Typography>
    </Stack>
  );
}
