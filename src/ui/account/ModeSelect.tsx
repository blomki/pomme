"use client";

import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { preferredSpaceValue, type AmapSpace } from "@/domain/spaces";
import { setModeAction } from "@/server/my-account-actions";

/**
 * « Mode » (story A3) : consomm'acteur, référent ou administrateur, pour chaque AMAP où le
 * compte a plusieurs espaces. Le choix est mémorisé et ouvre l'accueil de l'espace.
 */
export function ModeSelect({ groups, current }: { groups: AmapSpace[][]; current: string | null }) {
  const t = useTranslations("Auth.account");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Stack spacing={1.5} sx={{ maxWidth: 420 }}>
      {groups.map((group) => {
        const values = group.map(preferredSpaceValue);
        const value = current && values.includes(current) ? current : "";
        return (
          <TextField
            key={group[0]!.amapSlug}
            id={`mode-${group[0]!.amapSlug}`}
            select
            label={t("modeLabel", { amap: group[0]!.amapName })}
            value={value}
            disabled={pending}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            onChange={(e) =>
              startTransition(async () => {
                const result = await setModeAction(e.target.value);
                if (result.status === "saved") router.push(result.path);
              })
            }
          >
            {value === "" && <option value="">—</option>}
            {group.map((space) => (
              <option key={space.kind} value={preferredSpaceValue(space)}>
                {t(`mode.${space.kind}`)}
              </option>
            ))}
          </TextField>
        );
      })}
      <Typography variant="bodySmall" color="text.secondary">
        {t("modeHelp")}
      </Typography>
    </Stack>
  );
}
