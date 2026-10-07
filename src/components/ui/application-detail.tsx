"use client";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { applicationAction } from "@/app/actions/applications";
import { Submit } from "./profile";
type Task = {
  id: string;
  title: string;
  notes: string;
  due_date: string | null;
  completed_at: string | null;
};
type Application = {
  id: string;
  title: string;
  stage: string;
  notes: string;
  source_url: string;
  source_excerpt: string;
  source_fetched_at: string | null;
  archived_at: string | null;
  target_date: string | null;
  submitted_date: string | null;
  requested_amount: string | null;
  awarded_amount: string | null;
};
type Grant = {
  slug: string;
  deadline_at: string | null;
  verification_status: string;
};
const stages = [
  "saved",
  "preparing",
  "submitted",
  "awarded",
  "declined",
  "withdrawn",
];
const when = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("en-US", { timeZone: "America/New_York" })
    : "Unknown";
export function ApplicationDetail({
  a,
  tasks,
  history,
  grant,
  canEdit,
  error,
  updated,
  monitoring,
}: {
  a: Application;
  tasks: Task[];
  history: {
    id: string;
    created_at: string;
    event: string;
    previous_stage: string;
    stage: string;
  }[];
  grant: Grant | null;
  canEdit: boolean;
  error: boolean;
  updated: boolean;
  monitoring: { state: string; consecutive_failures: number } | null;
}) {
  const hidden = <input type="hidden" name="id" value={a.id} />;
  return (
    <>
      <Button component={Link} href="/app/applications">
        ← My grants
      </Button>
      <Stack direction="row" sx={{ gap: 1, mt: 2, mb: 2 }}>
        <Chip label={a.stage} sx={{ textTransform: "capitalize" }} />
        <Chip label="Private workspace" variant="outlined" />
        {a.archived_at && <Chip label="Archived" />}
      </Stack>
      <Typography
        variant="h1"
        sx={{ fontSize: { xs: 30, md: 42 }, overflowWrap: "anywhere" }}
      >
        {a.title}
      </Typography>
      <Stack
        component="nav"
        aria-label="Application sections"
        direction="row"
        sx={{ gap: 1, my: 3, flexWrap: "wrap" }}
      >
        {["Overview", "Tasks", "Notes", "History"].map((s) => (
          <Button key={s} href={"#" + s.toLowerCase()}>
            {s}
          </Button>
        ))}
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Couldn’t save. Check your permissions, dates, and amounts, then try
          again.
        </Alert>
      )}
      {updated && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Changes saved.
        </Alert>
      )}
      {monitoring &&
        (monitoring.state === "discontinued" ||
          monitoring.consecutive_failures > 0) && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {monitoring.state === "discontinued"
              ? "This source indicates the program is discontinued. Your private work is preserved."
              : "The source could not be refreshed recently. Check the funder for current details."}
          </Alert>
        )}
      <Box
        id="overview"
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.5fr 1fr" },
          gap: 3,
          alignItems: "start",
        }}
      >
        <Box component="form" action={applicationAction}>
          {hidden}
          <input name="operation" type="hidden" value="update" />
          <Box
            component="fieldset"
            disabled={!canEdit}
            sx={{ border: 0, m: 0, p: 0 }}
          >
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h2" sx={{ mb: 1 }}>
                  Make your next move
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 3 }}
                >
                  Stages are for your own tracking. Nothing is submitted to a
                  funder.
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    gap: 3,
                  }}
                >
                  <TextField
                    select
                    label="Stage"
                    name="stage"
                    defaultValue={a.stage}
                  >
                    {stages.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </TextField>
                  {[
                    ["target_date", "Personal target date"],
                    ["submitted_date", "Submitted date"],
                  ].map(([name, label]) => (
                    <TextField
                      key={name}
                      type="date"
                      name={name}
                      label={label}
                      defaultValue={a[name as "target_date"] ?? ""}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  ))}
                  {[
                    ["requested_amount", "Requested amount (USD)"],
                    ["awarded_amount", "Awarded amount (USD)"],
                  ].map(([name, label]) => (
                    <TextField
                      key={name}
                      type="number"
                      label={label}
                      name={name}
                      defaultValue={a[name as "requested_amount"] ?? ""}
                      slotProps={{
                        htmlInput: {
                          min: 0,
                          max: 999999999999.99,
                          step: ".01",
                        },
                      }}
                    />
                  ))}
                </Box>
                <Divider sx={{ my: 3 }} />
                <Box id="notes">
                  <Typography variant="h2" sx={{ mb: 2 }}>
                    Private notes
                  </Typography>
                  <TextField
                    name="notes"
                    label="Ideas, questions, and application notes"
                    multiline
                    minRows={5}
                    defaultValue={a.notes}
                    slotProps={{ htmlInput: { maxLength: 20000 } }}
                  />
                </Box>
                {canEdit && (
                  <Box sx={{ mt: 3 }}>
                    <Submit>Save details & notes</Submit>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>
        </Box>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h3" sx={{ mb: 2 }}>
              From the source
            </Typography>
            <Alert
              severity={
                grant?.verification_status === "verified"
                  ? "success"
                  : "warning"
              }
            >
              {grant?.verification_status === "verified"
                ? "Linked catalog record is verified."
                : "Unverified — check the funder’s requirements."}
            </Alert>
            <Typography sx={{ mt: 3 }}>
              <strong>Source deadline:</strong>{" "}
              {when(grant?.deadline_at ?? null)}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
              Captured {when(a.source_fetched_at)}. Personal targets do not
              change the funder deadline.
            </Typography>
            {!grant && (
              <Typography variant="body2">
                Amount, applicant types, location, and status: Unknown.
              </Typography>
            )}
            <Button
              component="a"
              href={a.source_url}
              target="_blank"
              rel="noopener noreferrer"
              variant="outlined"
              sx={{ mt: 2 }}
            >
              Visit funder ↗
            </Button>
            {grant && (
              <Button
                component={Link}
                href={"/app/opportunities/" + grant.slug}
                sx={{ mt: 1 }}
              >
                Full requirements →
              </Button>
            )}
            {a.source_excerpt && (
              <Box component="details" sx={{ mt: 2 }}>
                <summary>Captured source excerpt</summary>
                <Typography
                  variant="body2"
                  sx={{
                    mt: 2,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {a.source_excerpt}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
      <Box id="tasks" sx={{ mt: 5 }}>
        <Typography variant="h2" sx={{ mb: 3 }}>
          One step at a time{" "}
          <Typography component="span" color="text.secondary">
            · {tasks.filter((t) => t.completed_at).length}/{tasks.length}
          </Typography>
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 2,
          }}
        >
          {tasks.map((t) => (
            <Card key={t.id}>
              <CardContent>
                <Box component="form" action={applicationAction}>
                  {hidden}
                  <input name="taskId" type="hidden" value={t.id} />
                  <Box
                    component="fieldset"
                    disabled={!canEdit}
                    sx={{ border: 0, m: 0, p: 0 }}
                  >
                    <Stack spacing={2}>
                      <Chip
                        label={t.completed_at ? "Completed" : "To do"}
                        color={t.completed_at ? "success" : "default"}
                        sx={{ alignSelf: "start" }}
                      />
                      <TextField
                        name="title"
                        label="Task"
                        defaultValue={t.title}
                        required
                        slotProps={{ htmlInput: { maxLength: 200 } }}
                      />
                      <TextField
                        name="notes"
                        label="Task notes"
                        defaultValue={t.notes}
                        multiline
                        minRows={2}
                        slotProps={{ htmlInput: { maxLength: 2000 } }}
                      />
                      <TextField
                        name="due_date"
                        type="date"
                        label="Task due date"
                        defaultValue={t.due_date ?? ""}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                        <Button name="operation" value="edit" type="submit">
                          Save task
                        </Button>
                        <Button
                          name="operation"
                          value={t.completed_at ? "reopen" : "complete"}
                          type="submit"
                          variant="outlined"
                        >
                          {t.completed_at ? "Reopen" : "Complete"}
                        </Button>
                        <Button
                          name="operation"
                          value="delete"
                          type="submit"
                          color="error"
                        >
                          Remove
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
        {canEdit && (
          <Card sx={{ mt: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Box component="form" action={applicationAction}>
                {hidden}
                <input name="operation" value="add" type="hidden" />
                <Typography variant="h3" sx={{ mb: 3 }}>
                  Add a task
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    name="title"
                    label="What needs doing?"
                    required
                    slotProps={{ htmlInput: { maxLength: 200 } }}
                  />
                  <TextField
                    name="notes"
                    label="Details (optional)"
                    multiline
                    slotProps={{ htmlInput: { maxLength: 2000 } }}
                  />
                  <TextField
                    name="due_date"
                    type="date"
                    label="Due date (optional)"
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <Box>
                    <Submit>Add task +</Submit>
                  </Box>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>
      <Box id="history" sx={{ mt: 5 }}>
        <Typography variant="h2" sx={{ mb: 2 }}>
          Your progress
        </Typography>
        {history.map((h) => (
          <Box
            key={h.id}
            sx={{ py: 2, borderBottom: 1, borderColor: "divider" }}
          >
            <Typography>
              {h.event}
              {h.previous_stage && h.previous_stage !== h.stage
                ? ` · ${h.previous_stage} → ${h.stage}`
                : ""}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date(h.created_at).toLocaleString("en-US", {
                timeZone: "America/New_York",
              })}{" "}
              Eastern
            </Typography>
          </Box>
        ))}
      </Box>
      {canEdit && (
        <Box component="form" action={applicationAction} sx={{ mt: 4 }}>
          {hidden}
          <Button
            name="operation"
            value={a.archived_at ? "restore" : "archive"}
            type="submit"
            variant="outlined"
          >
            {a.archived_at ? "Restore grant" : "Archive grant"}
          </Button>
          <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
            Your notes, tasks, and history are preserved.
          </Typography>
        </Box>
      )}
    </>
  );
}
