"use client";

import Call from "@mui/icons-material/CallOutlined";
import Chat from "@mui/icons-material/ChatOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

import type { Contact } from "@/server/contacts";

import { visuallyHidden } from "../visually-hidden";

/**
 * Contacts du producteur et de ses référents (story H4) : « Appeler » et « Écrire sur Signal »,
 * seulement pour un numéro au format international. Sans numéro, le nom seul.
 */
export function ProducerContacts({ contacts }: { contacts: Contact[] }) {
  const t = useTranslations("Family.contacts");
  if (contacts.length === 0) return null;
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="contacts"
      sx={{ p: 2, mt: 3, borderRadius: 3 }}
    >
      <Typography id="contacts" variant="titleMedium" component="h2" sx={{ mb: 1 }}>
        {t("title")}
      </Typography>
      <Stack component="ul" spacing={1.5} sx={{ m: 0, p: 0, listStyle: "none" }}>
        {contacts.map((c) => (
          <Box component="li" key={`${c.role}-${c.name}`}>
            <Typography variant="bodyLarge" component="p">
              {c.name}
            </Typography>
            <Typography variant="bodySmall" component="p" color="text.secondary">
              {t(c.role)}
            </Typography>
            {c.links ? (
              <Stack direction="row" sx={{ gap: 1, mt: 0.5, flexWrap: "wrap" }}>
                <Button size="small" variant="outlined" startIcon={<Call />} href={c.links.tel}>
                  {t("call")}
                  <Box component="span" sx={visuallyHidden}>
                    {` ${c.name}`}
                  </Box>
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Chat />}
                  href={c.links.signal}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("signal")}
                  <Box component="span" sx={visuallyHidden}>
                    {` ${c.name} ${t("newWindow")}`}
                  </Box>
                </Button>
              </Stack>
            ) : (
              <Typography variant="bodySmall" component="p" color="text.secondary">
                {t("noPhone")}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
