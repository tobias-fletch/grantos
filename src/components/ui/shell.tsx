"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Box,
  Button,
  Typography,
  Stack,
  Divider,
  Menu,
  MenuItem,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
} from "@mui/material";
import { ThemeControl } from "./provider";
import { logoutAction } from "@/app/actions/auth";
const links = [
  ["Home", "/app/dashboard", "⌂"],
  ["Find grants", "/app/opportunities", "⌕"],
  ["My grants", "/app/applications", "▤"],
];
export function WorkspaceShell({
  children,
  name,
  owner,
  editor,
}: {
  children: React.ReactNode;
  name: string;
  owner: boolean;
  editor: boolean;
}) {
  const path = usePathname();
  const selected = links.findIndex(([, href]) => path.startsWith(href));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <Box sx={{ minHeight: "100vh" }}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Box
        component="aside"
        sx={{
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          position: "fixed",
          inset: "0 auto 0 0",
          width: 244,
          p: 3,
          bgcolor: "background.paper",
          borderRight: 1,
          borderColor: "divider",
        }}
      >
        <Typography
          component={Link}
          href="/app/dashboard"
          sx={{
            fontWeight: 900,
            fontSize: 27,
            letterSpacing: "-.06em",
            textDecoration: "none",
            color: "text.primary",
          }}
        >
          Grant
          <span style={{ color: "var(--mui-palette-primary-main)" }}>OS✦</span>
        </Typography>
        <Typography variant="caption" sx={{ mt: 1, color: "text.secondary" }}>
          Big ideas. Real possibilities.
        </Typography>
        <Stack
          component="nav"
          aria-label="Main navigation"
          spacing={1}
          sx={{ mt: 6 }}
        >
          {links.map(([label, href, icon], i) => (
            <Button
              component={Link}
              href={href}
              key={href}
              aria-current={selected === i ? "page" : undefined}
              variant={selected === i ? "contained" : "text"}
              sx={{ justifyContent: "flex-start", gap: 2, py: 1.5 }}
            >
              <span aria-hidden>{icon}</span>
              {label}
            </Button>
          ))}
        </Stack>
        <Box sx={{ mt: "auto" }}>
          <Typography variant="overline">Your workspace</Typography>
          <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere", mb: 2 }}>
            {name}
          </Typography>
          <Button
            component={Link}
            href="/app/profile"
            variant="outlined"
            fullWidth
          >
            Funding profile
          </Button>
        </Box>
      </Box>
      <Box sx={{ ml: { md: "244px" }, pb: { xs: 10, md: 0 } }}>
        <Box
          component="header"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            p: { xs: 2, md: "20px 40px" },
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Typography sx={{ fontWeight: 800 }}>
            {links[selected]?.[0] ?? "Your workspace"}
          </Typography>
          <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
            <Box sx={{ display: { xs: "none", sm: "block" } }}>
              <ThemeControl />
            </Box>
            <Button
              variant="outlined"
              onClick={(e) => setAnchor(e.currentTarget)}
              aria-haspopup="menu"
              aria-expanded={Boolean(anchor)}
            >
              Account
            </Button>
          </Stack>
        </Box>
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
          <Box sx={{ p: 2 }}>
            <Typography variant="caption" sx={{ mb: 1, display: "block" }}>
              Make it yours
            </Typography>
            <ThemeControl />
          </Box>
          <MenuItem
            component={Link}
            href="/app/profile"
            onClick={() => setAnchor(null)}
          >
            Funding profile
          </MenuItem>
          <MenuItem
            component={Link}
            href="/support"
            onClick={() => setAnchor(null)}
          >
            Support
          </MenuItem>
          <MenuItem
            component={Link}
            href="/app/research"
            onClick={() => setAnchor(null)}
          >
            Import a funder source
          </MenuItem>
          {(owner || editor) && <Divider />}
          {owner && (
            <MenuItem
              component={Link}
              href="/app/beta-admin"
              onClick={() => setAnchor(null)}
            >
              Admin · Beta access
            </MenuItem>
          )}
          {editor && (
            <MenuItem
              component={Link}
              href="/app/discovery-admin"
              onClick={() => setAnchor(null)}
            >
              Admin · Catalog administration
            </MenuItem>
          )}
          {editor && (
            <MenuItem
              component={Link}
              href="/app/catalog-review"
              onClick={() => setAnchor(null)}
            >
              Admin · Catalog review
            </MenuItem>
          )}
          <Divider />
          <Box component="form" action={logoutAction} sx={{ px: 1 }}>
            <Button type="submit" fullWidth>
              Log out
            </Button>
          </Box>
        </Menu>
        <Box
          component="main"
          id="main-content"
          tabIndex={-1}
          sx={{ maxWidth: 1280, mx: "auto", p: { xs: 2, sm: 3, lg: 5 } }}
        >
          {children}
        </Box>
      </Box>
      <Paper
        sx={{
          display: { md: "none" },
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          borderTop: 1,
          borderColor: "divider",
          pb: "env(safe-area-inset-bottom)",
        }}
      >
        <BottomNavigation
          showLabels
          value={selected}
          aria-label="Main navigation"
        >
          {links.map(([label, href, icon]) => (
            <BottomNavigationAction
              component={Link}
              href={href}
              key={href}
              label={label}
              icon={
                <span aria-hidden style={{ fontSize: 22 }}>
                  {icon}
                </span>
              }
            />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
