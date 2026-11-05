import { createTheme, type Theme } from "@mui/material/styles";

import { COLOR_SCHEME_ATTRIBUTE } from "./color-scheme";
import type { ThemeConfig } from "./key-colors";
import { createM3Schemes, type M3Role, type M3Scheme } from "./m3-colors";
import { createM3Typography } from "./typography";

/** Variable CSS d'un rôle M3 : suit automatiquement le mode clair ou sombre. */
export const m3 = (role: M3Role) => `var(--mui-palette-m3-${role})`;

/**
 * Couche d'état M3 : un voile de la couleur du contenu (currentColor) posé sur le fond,
 * à 8 % au survol, 10 % au focus et à l'appui. Le fond garde ainsi sa couleur.
 */
const stateLayer = (opacity: number) => {
  const veil = `color-mix(in srgb, currentColor ${opacity}%, transparent)`;
  return { backgroundImage: `linear-gradient(${veil}, ${veil})` };
};

/** Rayons M3 (en px) : petit, moyen, grand, très grand, pilule. */
export const M3_SHAPE = {
  extraSmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 28,
  full: 9999,
};

/** Courbes et durées de mouvement M3. */
export const M3_EASING = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  emphasizedDecelerate: "cubic-bezier(0.05, 0.7, 0.1, 1)",
  emphasizedAccelerate: "cubic-bezier(0.3, 0, 0.8, 0.15)",
  standardAccelerate: "cubic-bezier(0.3, 0, 1, 1)",
};

function toPalette(s: M3Scheme) {
  // MUI attend main / light / dark / contrastText. « dark » sert au survol des boutons pleins :
  // on garde la même couleur et on ajoute une couche d'état (voir MuiButton plus bas).
  const color = (main: string, container: string, on: string) => ({
    main,
    light: container,
    dark: main,
    contrastText: on,
  });
  return {
    primary: color(s.primary, s.primaryContainer, s.onPrimary),
    secondary: color(s.secondary, s.secondaryContainer, s.onSecondary),
    tertiary: color(s.tertiary, s.tertiaryContainer, s.onTertiary),
    error: color(s.error, s.errorContainer, s.onError),
    background: { default: s.surface, paper: s.surfaceContainerLow },
    text: { primary: s.onSurface, secondary: s.onSurfaceVariant },
    divider: s.outlineVariant,
    action: { hoverOpacity: 0.08, focusOpacity: 0.1, selectedOpacity: 0.1, activatedOpacity: 0.1 },
    m3: s,
  };
}

/**
 * Thème Material UI « façon M3 » d'une AMAP (ou de la plateforme).
 *
 * Les couleurs sont exposées en variables CSS (cssVariables) pour les deux modes ; l'attribut
 * COLOR_SCHEME_ATTRIBUTE posé sur <html> choisit le mode, sans recalcul ni rechargement.
 */
export function createAmapTheme(config: ThemeConfig): Theme {
  const schemes = createM3Schemes(config.keyColors);

  return createTheme({
    cssVariables: { colorSchemeSelector: COLOR_SCHEME_ATTRIBUTE },
    colorSchemes: {
      light: { palette: toPalette(schemes.light) },
      dark: { palette: toPalette(schemes.dark) },
    },
    shape: { borderRadius: M3_SHAPE.medium },
    typography: createM3Typography(config.headingFont),
    // Animations coupées si l'utilisateur a demandé « réduire les animations ».
    motion: { reducedMotion: "system" },
    transitions: {
      easing: {
        easeInOut: M3_EASING.standard,
        easeOut: M3_EASING.emphasizedDecelerate,
        easeIn: M3_EASING.emphasizedAccelerate,
        sharp: M3_EASING.standardAccelerate,
      },
      duration: {
        shortest: 100,
        shorter: 200,
        short: 250,
        standard: 300,
        complex: 400,
        enteringScreen: 400,
        leavingScreen: 200,
      },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: M3_SHAPE.full,
            minHeight: 48, // cible tactile de 48 px
            paddingInline: 24,
            "&:hover": stateLayer(8),
            "&.Mui-focusVisible": stateLayer(10),
            "&:active": stateLayer(10),
          },
        },
        variants: [
          {
            props: { variant: "tonal" },
            style: {
              backgroundColor: m3("secondaryContainer"),
              color: m3("onSecondaryContainer"),
              "&:hover": { backgroundColor: m3("secondaryContainer") },
            },
          },
          {
            props: { variant: "outlined" },
            style: { borderColor: m3("outline") },
          },
        ],
      },
      MuiIconButton: {
        styleOverrides: { root: { padding: 12 } }, // 24 px d'icône + 2 × 12 = 48 px
      },
      MuiFab: {
        styleOverrides: { root: { borderRadius: M3_SHAPE.large, boxShadow: "none" } },
      },
      MuiPaper: {
        // M3 marque l'élévation par la teinte de la surface, pas par une ombre ni un dégradé.
        styleOverrides: { root: { backgroundImage: "none" } },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { borderRadius: M3_SHAPE.large, backgroundColor: m3("surfaceContainerLow") },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: "inherit" },
        styleOverrides: {
          root: { backgroundColor: m3("surfaceContainer"), color: m3("onSurface") },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: m3("surfaceContainerLow"), borderRight: "none" },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: M3_SHAPE.full,
            minHeight: 56,
            "&.Mui-selected, &.Mui-selected:hover": {
              backgroundColor: m3("secondaryContainer"),
              color: m3("onSecondaryContainer"),
            },
          },
        },
      },
      MuiBottomNavigation: {
        styleOverrides: { root: { height: 80, backgroundColor: m3("surfaceContainer") } },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            minWidth: 64,
            gap: 4,
            color: m3("onSurfaceVariant"),
            "& .MuiSvgIcon-root": { width: 64, height: 32, padding: "4px 20px", borderRadius: 16 },
            "&.Mui-selected": { color: m3("onSurface") },
            "&.Mui-selected .MuiSvgIcon-root": {
              backgroundColor: m3("secondaryContainer"),
              color: m3("onSecondaryContainer"),
            },
          },
          label: {
            fontSize: "0.75rem",
            fontWeight: 700,
            "&.Mui-selected": { fontSize: "0.75rem" },
          },
        },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: M3_SHAPE.small } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: M3_SHAPE.extraSmall },
          notchedOutline: { borderColor: m3("outline") },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: M3_SHAPE.extraLarge, backgroundColor: m3("surfaceContainerHigh") },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            borderRadius: M3_SHAPE.extraSmall,
            backgroundColor: m3("inverseSurface"),
            color: m3("inverseOnSurface"),
          },
          action: { color: m3("inversePrimary"), "& .MuiButton-root": { color: "inherit" } },
        },
      },
      MuiSkeleton: {
        styleOverrides: { root: { backgroundColor: m3("surfaceContainerHighest") } },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            minHeight: 48,
            "&.Mui-selected": {
              backgroundColor: m3("secondaryContainer"),
              color: m3("onSecondaryContainer"),
            },
          },
        },
      },
    },
  });
}
