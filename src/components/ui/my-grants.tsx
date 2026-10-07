"use client";
import Link from "next/link";
import {
  Box,
  Button,
  Card,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Alert,
} from "@mui/material";
import { ApplicationTile, type ApplicationRow } from "./home";
const stages = [
  "saved",
  "preparing",
  "submitted",
  "awarded",
  "declined",
  "withdrawn",
];
export function MyGrants({
  rows,
  q = "",
  stage = "",
  archived = false,
  error = false,
  counts,
}: {
  rows: ApplicationRow[];
  q?: string;
  stage?: string;
  archived?: boolean;
  error?: boolean;
  counts: Record<string, number>;
}) {
  const url = (s: string, a = archived) =>
    "/app/applications?" +
    new URLSearchParams({ q, stage: s, archived: a ? "1" : "0" });
  return (
    <>
      <Typography variant="overline" color="secondary">
        Your ideas, taking shape
      </Typography>
      <Typography variant="h1" sx={{ mt: 1 }}>
        My grants
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2, mb: 4 }}>
        One private space for every possibility—from your first save to your
        final decision.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Could not update this application. Please try again.
        </Alert>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
        <Box
          component="form"
          action="/app/applications"
          sx={{ display: "flex", gap: 1, flex: 1 }}
        >
          <TextField
            name="q"
            label="Search your grants and notes"
            defaultValue={q}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <input name="stage" value={stage} type="hidden" />
          <input name="archived" value={archived ? "1" : "0"} type="hidden" />
          <Button type="submit" variant="outlined">
            Search
          </Button>
        </Box>
        <Button
          component={Link}
          href={url(stage, !archived)}
          variant={archived ? "contained" : "outlined"}
        >
          {archived ? "Show current grants" : "View archive"}
        </Button>
        <Button component={Link} href="/app/opportunities" variant="contained">
          Find grants +
        </Button>
      </Stack>
      <Tabs
        value={stage || "all"}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Grant stages"
        sx={{ mb: 3 }}
      >
        <Tab
          component={Link}
          href={url("")}
          value="all"
          label={"All · " + (counts.all ?? 0)}
        />
        {stages.map((s) => (
          <Tab
            key={s}
            component={Link}
            href={url(s)}
            value={s}
            label={s + " · " + (counts[s] ?? 0)}
            sx={{ textTransform: "capitalize" }}
          />
        ))}
      </Tabs>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {archived ? "Archived grants" : "Current grants"} · Ordered by personal
        target date, then source deadline
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 3,
        }}
      >
        {rows.map((a) => (
          <ApplicationTile key={a.id} a={a} />
        ))}
      </Box>
      {!rows.length && (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography variant="h2">Room for your next possibility.</Typography>
          <Typography sx={{ my: 2 }}>
            No grants match this view. Change a stage filter or discover
            something new.
          </Typography>
          <Button
            component={Link}
            href="/app/opportunities"
            variant="contained"
          >
            Explore grants
          </Button>
        </Card>
      )}
    </>
  );
}
