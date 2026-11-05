/**
 * Extensions des types de Material UI : palette « tertiary » et rôles M3 complets
 * (palette.m3), variantes typographiques M3 (displayLarge, titleMedium…).
 * Sans ces déclarations, TypeScript refuserait <Button color="tertiary"> ou
 * <Typography variant="titleLarge">.
 */
import type { CSSProperties } from "react";

import type { M3Scheme } from "./m3-colors";

type M3Variants = {
  displayLarge: CSSProperties;
  displayMedium: CSSProperties;
  displaySmall: CSSProperties;
  headlineLarge: CSSProperties;
  headlineMedium: CSSProperties;
  headlineSmall: CSSProperties;
  titleLarge: CSSProperties;
  titleMedium: CSSProperties;
  titleSmall: CSSProperties;
  bodyLarge: CSSProperties;
  bodyMedium: CSSProperties;
  bodySmall: CSSProperties;
  labelLarge: CSSProperties;
  labelMedium: CSSProperties;
  labelSmall: CSSProperties;
};

type M3VariantFlags = { [K in keyof M3Variants]: true };

declare module "@mui/material/styles" {
  interface Palette {
    tertiary: Palette["primary"];
    m3: M3Scheme;
  }
  interface PaletteOptions {
    tertiary?: PaletteOptions["primary"];
    m3?: M3Scheme;
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extension de type MUI
  interface TypographyVariants extends M3Variants {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extension de type MUI
  interface TypographyVariantsOptions extends Partial<M3Variants> {}
}

declare module "@mui/material/Typography" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extension de type MUI
  interface TypographyPropsVariantOverrides extends M3VariantFlags {}
}

declare module "@mui/material/Button" {
  interface ButtonPropsColorOverrides {
    tertiary: true;
  }
  /** Bouton « filled tonal » de M3 : fond secondaryContainer, moins appuyé que « contained ». */
  interface ButtonPropsVariantOverrides {
    tonal: true;
  }
}

declare module "@mui/material/Chip" {
  interface ChipPropsColorOverrides {
    tertiary: true;
  }
}

declare module "@mui/material/Fab" {
  interface FabPropsColorOverrides {
    tertiary: true;
  }
}
