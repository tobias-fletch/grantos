"use client";
import Link from "next/link";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import { GrantCard, QuickSearch } from "./search";
import type { GrantResult } from "@/lib/opportunities/ranking";
export type ApplicationRow = {
  id: string;
  title: string;
  stage: string;
  target_date: string | null;
  deadline_at: string | null;
  tasks: number;
  completed: number;
  archived_at: string | null;
};
export function ApplicationTile({ a }: { a: ApplicationRow }) {
  return (
    <Card>
      <CardContent>
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", alignItems: "start", gap: 2 }}
        >
          <Typography
            variant="h3"
            component={Link}
            href={"/app/applications/" + a.id}
            sx={{ textDecoration: "none", color: "text.primary" }}
          >
            {a.title}
          </Typography>
          <Chip
            size="small"
            label={a.stage}
            sx={{ textTransform: "capitalize" }}
          />
        </Stack>
        <Typography variant="body2" sx={{ mt: 2, color: "text.secondary" }}>
          Personal target: {a.target_date ?? "Not set"} · {a.deadline_at && new Date(a.deadline_at).getTime()<Date.now()?"Previous round deadline:":"Source deadline:"}{" "}
          {a.deadline_at
            ? new Date(a.deadline_at).toLocaleDateString("en-US", {
                timeZone: "UTC",
              })
            : "Unknown"}
        </Typography>
        <Stack direction="row" sx={{ alignItems: "center", gap: 2, mt: 2 }}>
          <LinearProgress
            variant="determinate"
            value={a.tasks ? (a.completed / a.tasks) * 100 : 0}
            aria-label="Task completion"
            sx={{ flex: 1, height: 6, borderRadius: 4 }}
          />
          <Typography variant="caption">
            {a.tasks ? `${a.completed}/${a.tasks} tasks` : "No tasks yet"}
          </Typography>
        </Stack>
        <Button
          component={Link}
          href={"/app/applications/" + a.id}
          sx={{ mt: 1 }}
        >
          Continue application →
        </Button>
      </CardContent>
    </Card>
  );
}
export function Home({
  name,
  categories,
  grants,
  apps,
  tasks,
  canEdit,
}: {
  name: string;
  categories: string[];
  grants: GrantResult[];
  apps: ApplicationRow[];
  tasks: {
    id: string;
    title: string;
    application_id: string | null;
    slug: string;
    due_date: string | null;
    grant_name: string;
  }[];
  canEdit: boolean;
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
  return (
    <>
      <Box
        sx={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 6,
          p: { xs: 3, md: 5 },
          mb: 4,
          bgcolor: "primary.main",
          color: "primary.contrastText",
          "&::after": {
            content: '"✦"',
            position: "absolute",
            right: 20,
            top: -35,
            fontSize: 210,
            opacity: 0.12,
            pointerEvents: "none",
          },
        }}
      >
        <Typography variant="overline">
          Your next chapter starts here
        </Typography>
        <Typography variant="h1" sx={{ mt: 2, maxWidth: 620 }}>
          Big ideas deserve
          <br />a little backing.
        </Typography>
        <Typography sx={{ mt: 2, maxWidth: 550 }}>
          Welcome back, {name.split(" ")[0]}. Find your next opportunity and
          give the grants you’ve saved a little momentum.
        </Typography>
      </Box>
      <Card sx={{ mb: 4 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h2" sx={{ mb: 3 }}>
            What’s your next idea?
          </Typography>
          <QuickSearch initialCategories={categories} />
        </CardContent>
      </Card>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.5fr 1fr" },
          gap: 3,
          mb: 5,
        }}
      >
        <Box>
          <Stack
            direction="row"
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
            }}
          >
            <Typography variant="h2">Your grants, in motion</Typography>
            <Button component={Link} href="/app/applications">
              View all →
            </Button>
          </Stack>
          <Stack spacing={2}>
            {apps.slice(0, 3).map((a) => (
              <ApplicationTile key={a.id} a={a} />
            ))}
            {!apps.length && (
              <Card sx={{ p: 4 }}>
                <Typography variant="h3">
                  Your first grant starts with a save.
                </Typography>
                <Typography color="text.secondary" sx={{ my: 2 }}>
                  Keep possibilities together, add notes, and take the next step
                  when you’re ready.
                </Typography>
                <Button
                  component={Link}
                  href="/app/opportunities"
                  variant="contained"
                >
                  Find a grant
                </Button>
              </Card>
            )}
          </Stack>
        </Box>
        <Card sx={{ alignSelf: "start" }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="overline" color="secondary">
              Small steps, big progress
            </Typography>
            <Typography variant="h2" sx={{ mb: 2 }}>
              Up next
            </Typography>
            {tasks.slice(0, 5).map((t) => (
              <Box
                key={t.id}
                sx={{ py: 2, borderTop: 1, borderColor: "divider" }}
              >
                <Typography
                  component={Link}
                  href={
                    t.application_id
                      ? "/app/applications/" + t.application_id
                      : "/app/opportunities/" + t.slug + "#checklist"
                  }
                  sx={{ fontWeight: 700, color: "text.primary" }}
                >
                  {t.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t.grant_name}
                </Typography>
                <Typography
                  variant="caption"
                  color={
                    t.due_date && t.due_date < today
                      ? "error"
                      : "text.secondary"
                  }
                >
                  {t.due_date
                    ? `${t.due_date < today ? "Overdue · " : ""}${t.due_date}`
                    : "No date set"}
                </Typography>
              </Box>
            ))}
            {!tasks.length && (
              <Typography color="text.secondary">
                A little breathing room. Add a task to any saved grant when
                you’re ready.
              </Typography>
            )}
            {apps
              .filter((a) => a.target_date)
              .slice(0, 3)
              .map((a) => (
                <Box
                  key={a.id}
                  sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}
                >
                  <Typography variant="caption">
                    Personal target · {a.target_date}
                  </Typography>
                  <Typography
                    component={Link}
                    href={"/app/applications/" + a.id}
                    sx={{ display: "block", color: "primary.main" }}
                  >
                    {a.title}
                  </Typography>
                </Box>
              ))}
          </CardContent>
        </Card>
      </Box>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}
      >
        <Typography variant="h2">Possibilities picked for you</Typography>
        <Button component={Link} href="/app/opportunities">
          Explore all →
        </Button>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Based on your funding profile. Always check the funder’s requirements.
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 3,
        }}
      >
        {grants.slice(0, 6).map((r) => (
          <GrantCard key={r.id} result={r} canEdit={canEdit} />
        ))}
      </Box>
      {!grants.length && (
        <Typography>
          No grants are available yet. Source discovery will add new
          possibilities as they’re found.
        </Typography>
      )}
    </>
  );
}
