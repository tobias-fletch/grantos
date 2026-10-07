"use client";
import {
  createTheme,
  ThemeProvider,
  CssBaseline,
  useColorScheme,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#6241c5" },
        secondary: { main: "#a93446" },
        background: { default: "#faf8f5", paper: "#ffffff" },
        text: { primary: "#242136", secondary: "#655f74" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#bfabff" },
        secondary: { main: "#ff9aa8" },
        background: { default: "#15131d", paper: "#211e2c" },
        text: { primary: "#f4efff", secondary: "#c2b9d0" },
      },
    },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: "Arial, Helvetica, sans-serif",
    h1: {
      fontSize: "clamp(2rem,4vw,3.5rem)",
      fontWeight: 800,
      letterSpacing: "-.045em",
      lineHeight: 1.12,
    },
    h2: { fontSize: "1.6rem", fontWeight: 750, letterSpacing: "-.025em" },
    h3: { fontSize: "1.15rem", fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 700 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 12, minHeight: 44, paddingInline: 20 },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: "none" } },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid var(--mui-palette-divider)",
          borderRadius: 20,
        },
      },
    },
    MuiTextField: { defaultProps: { size: "small", fullWidth: true } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
  },
});
export function UIProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme} defaultMode="system" disableTransitionOnChange>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
export function ThemeControl() {
  const { mode, setMode } = useColorScheme();
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={mode ?? "system"}
      onChange={(_, v) => {
        if (v) setMode(v);
      }}
      aria-label="Color theme"
    >
      {["light", "dark", "system"].map((v) => (
        <ToggleButton
          key={v}
          value={v}
          aria-label={`${v} theme`}
          sx={{ textTransform: "capitalize", minHeight: 44 }}
        >
          {v}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
