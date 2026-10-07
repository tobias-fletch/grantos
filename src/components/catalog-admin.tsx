"use client";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import { CrawlButton, SourceForm } from "./discovery-admin-form";
import { categories } from "@/lib/opportunities/store";
import { fundingFocusOptions } from "@/lib/opportunities/funding-focus";
const date = (s: string) =>
  s
    ? new Date(s).toLocaleString("en-US", { timeZone: "America/New_York" })
    : "Not yet checked";
const tabs = [
  ["overview", "Overview"],
  ["catalog", "Catalog"],
  ["sources", "Sources"],
  ["research", "Research progress"],
  ["attention", "Admin exceptions"],
  ["activity", "Activity"],
];
export function CatalogAdmin({ data: d }: { data: any }) {
  const { tab, params, rows, settings, stats } = d;
  const select = (name: string, label: string, options: string[]) => (
    <TextField
      select
      name={name}
      label={label}
      defaultValue={params[name] ?? ""}
      size="small"
      sx={{ minWidth: 160 }}
    >
      <MenuItem value="">All</MenuItem>
      {options.map((v) => (
        <MenuItem key={v} value={v}>
          {v}
        </MenuItem>
      ))}
    </TextField>
  );
  const href = (page: number) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (typeof v === "string") q.set(k, v);
    });
    q.set("page", String(page));
    return "/app/discovery-admin?" + q;
  };
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline">
          Shared catalog · editor workspace
        </Typography>
        <Typography variant="h3" component="h1">
          Catalog administration
        </Typography>
        <Typography color="text.secondary">
          Find useful grants. Keep facts current. Preserve the evidence.
        </Typography>
      </Box>
      <Tabs
        value={tabs.some((t) => t[0] === tab) ? tab : "overview"}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Catalog administration"
      >
        {tabs.map(([value, label]) => (
          <Tab
            key={value}
            value={value}
            label={label}
            href={"/app/discovery-admin?tab=" + value}
          />
        ))}
      </Tabs>
      {settings.paused && (
        <Alert severity="warning">
          Automation is paused. Due work remains queued.
        </Alert>
      )}
      {tab === "overview" ? (
        <>
          <Alert severity="info">
            {settings.hourly_enabled
              ? "Hourly processing enabled."
              : "Current schedule retained; hourly activation awaits capacity checks."}{" "}
            Checks target 6 hours for approaching deadlines, daily for active or
            unknown programs, and weekly for closed programs. Delays and source
            restrictions can leave work overdue.
          </Alert>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3,1fr)" },
              gap: 2,
            }}
          >
            {[
              ["Published listings", stats.published],
              ["Due URL checks", stats.overdue],
              ["Admin exceptions", stats.pending],
              ["Researching", stats.researching],
              ["Retry scheduled", stats.retrying],
              ["Information unavailable", stats.unavailable],
              ["Facts resolved in 24 hours", stats.facts_resolved],
              ["Added in 24 hours", stats.added],
              ["Updated in 24 hours", stats.updated],
              ["Publication failures", stats.failed],
            ].map(([label, value]) => (
              <Paper key={label} variant="outlined" sx={{ p: 2 }}>
                <Typography color="text.secondary">{label}</Typography>
                <Typography variant="h4">{value}</Typography>
              </Paper>
            ))}
          </Box>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6">Catalog completeness</Typography>
            {['status','deadline','amount','applicants','geography'].map(f=><Typography key={f}>{f}: {d.completeness[f]} / {d.completeness.total} listings with supported information</Typography>)}
            <Typography color="text.secondary">Missing facts are researched automatically. Unknown is retained when official evidence is absent or conflicting.</Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6">Worker health</Typography>
            <Typography>Heartbeat: {date(settings.heartbeat_at)}</Typography>
            <Typography>
              Last completed maintenance: {date(settings.last_success_at)}
            </Typography>
            <Typography>
              Snapshot storage: {Number(stats.snapshot_mb).toFixed(1)} MB
            </Typography>
            {settings.last_error && (
              <Alert severity="error">{settings.last_error}</Alert>
            )}
            <Box sx={{ mt: 2 }}>
              <CrawlButton command="run" label="Queue refresh" />
              {d.owner && (
                <>
                  <CrawlButton
                    command={settings.hourly_enabled ? "daily" : "hourly"}
                    label={
                      settings.hourly_enabled
                        ? "Use daily cadence"
                        : "Use hourly cadence"
                    }
                  />
                  <CrawlButton
                    command={settings.paused ? "resume" : "pause"}
                    label={
                      settings.paused ? "Resume automation" : "Pause automation"
                    }
                  />
                </>
              )}
            </Box>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6">Source coverage</Typography>
            <Typography color="text.secondary">
              Source coverage does not guarantee current open grants or
              eligibility.
            </Typography>
            <Stack
              direction="row"
              useFlexGap
              sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}
            >
              {categories.map((c) => {
                const n =
                  d.coverage.find((r: any) => r.category === c)?.sources ?? 0;
                return (
                  <Chip
                    key={c}
                    color={Number(n) ? "default" : "warning"}
                    label={c + ": " + n + " sources"}
                  />
                );
              })}
            </Stack>
            <Stack
              direction="row"
              useFlexGap
              sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}
            >
              {fundingFocusOptions.map((f) => {
                const n =
                  d.focusCoverage.find((r: any) => r.focus === f.value)
                    ?.sources ?? 0;
                return (
                  <Chip
                    key={f.value}
                    color={Number(n) ? "default" : "warning"}
                    label={f.label + ": " + n + " sources"}
                  />
                );
              })}
            </Stack>
          </Paper>
        </>
      ) : (
        <>
          {tab !== "activity" && (
            <Paper
              component="form"
              method="get"
              variant="outlined"
              sx={{ p: 2, display: "flex", gap: 2, flexWrap: "wrap" }}
            >
              <input type="hidden" name="tab" value={tab} />
              <TextField
                name="q"
                label="Search"
                defaultValue={d.q}
                size="small"
              />
              {tab === "catalog" && (
                <>
                  {select("verification", "Verification", [
                    "verified",
                    "needs_verification",
                    "archived",
                  ])}
                  {select("facts", "Facts", ["missing"])}
                  {select("freshness", "Freshness", ["overdue"])}
                  {select("status", "Application status", [
                    "open",
                    "upcoming",
                    "closed",
                    "unknown",
                    "unannounced",
                  ])}
                  {select("visibility", "Visibility", ["hidden", "archived"])}
                </>
              )}
              {tab === "attention" &&
                select("kind", "Attention type", [
                  "domain",
                  "locked",
                  "unavailable",
                ])}
              {tab==='research'&&select('state','Research state',['queued','running','retry','waiting','complete'])}
              <Button type="submit" variant="contained">
                Filter
              </Button>
            </Paper>
          )}
          {tab === "sources" && (
            <Accordion>
              <AccordionSummary>Add a registered source</AccordionSummary>
              <AccordionDetails>
                <SourceForm />
              </AccordionDetails>
            </Accordion>
          )}
          {tab === "attention" && (
            <Alert severity="info">
              Identifiable grant leads publish automatically. These items need
              domain approval, locked-field decisions, or troubleshooting. Missing facts are researched automatically. Source
              evidence never guarantees eligibility.
            </Alert>
          )}
          {!rows.length && (
            <Paper sx={{ p: 3 }}>
              <Typography>No items match these filters.</Typography>
            </Paper>
          )}
          {rows.map((r: any, i: number) => (
            <Paper
              variant="outlined"
              key={r.id ?? i}
              sx={{ p: 2, overflowWrap: "anywhere" }}
            >
              {tab === "catalog" && (
                <>
                  <Typography variant="h6">{r.name}</Typography>
                  <Stack
                    direction="row"
                    sx={{ my: 1, flexWrap: "wrap", gap: 1 }}
                  >
                    {[
                      r.publication_state,
                      r.verification_status,
                      r.application_status,
                      r.state === "discontinued"
                        ? "Automatically archived"
                        : null,
                    ]
                      .filter(Boolean)
                      .map((v: any) => (
                        <Chip key={v} label={v} size="small" />
                      ))}
                  </Stack>
                  <Typography>
                    Last source check: {date(r.last_success_at)} · Next target:{" "}
                    {date(r.next_check_at)}
                  </Typography>
                  <Typography color="text.secondary">
                    Amount: {r.maximum_award ?? "Unknown"} · Deadline:{" "}
                    {r.deadline_at ? date(r.deadline_at) : "Unknown"}
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Button href={"/app/catalog-review?id=" + r.id}>
                      Correct / verify / merge / hide
                    </Button>
                    <CrawlButton
                      command="refresh-grant"
                      id={r.id}
                      label="Queue source check"
                    />
                    {(r.publication_state === "hidden" ||
                      r.state === "discontinued") && (
                      <CrawlButton
                        command="restore-grant"
                        id={r.id}
                        label="Restore listing"
                      />
                    )}
                  </Box>
                  <Accordion sx={{ mt: 2 }}>
                    <AccordionSummary>Official evidence and unresolved facts ({r.evidence_pages?.length ?? 0} pages)</AccordionSummary>
                    <AccordionDetails>
                      <Typography color="text.secondary">A successful source check is not editorial verification. Missing information remains Unknown.</Typography>
                      {Object.entries(r.unresolved ?? {}).map(([field,reason])=><Typography key={field}>{field}: {String(reason)}</Typography>)}
                      {(r.evidence_pages ?? []).map((p:any)=><Box key={p.url} sx={{mt:2}}>
                        <Button href={p.url} target="_blank" rel="noopener noreferrer">{p.role} · Open official page</Button>
                        <Typography variant="body2">Fetched: {date(p.fetched_at)} · {p.association}</Typography>
                        {p.facts.map((f:any,j:number)=><Typography key={j} variant="body2" sx={{mt:1}}>{f.field}: {f.value} · Cycle: {f.cycle ?? 'Not specified'} — “{f.excerpt}”</Typography>)}
                      </Box>)}
                    </AccordionDetails>
                  </Accordion>
                  <Accordion><AccordionSummary>Field history and manual locks</AccordionSummary><AccordionDetails>
                    <Typography>Automatic updates retain previous values. Restoring a previous value locks that field until you unlock it.</Typography>
                    {(r.fields??[]).map((f:any)=><Box key={f.field} sx={{mt:2}}><Typography>{f.field}: {f.state} {f.locked?'· Locked':''}</Typography><CrawlButton command={f.locked?'unlock-field':'lock-field'} id={r.id} field={f.field} label={f.locked?'Unlock field':'Lock current value'}/>{r.fact_history?.some((h:any)=>h.field===f.field)&&<CrawlButton command="rollback-field" id={r.id} field={f.field} label="Restore previous value"/>}</Box>)}
                    {(r.fact_history??[]).map((h:any,i:number)=><Typography variant="body2" key={i}>{date(h.created_at)} · {h.field}: {JSON.stringify(h.old_value)} → {JSON.stringify(h.new_value)} · {h.action}</Typography>)}
                  </AccordionDetails></Accordion>
                </>
              )}
              {tab==='research'&&<><Typography variant="h6">{r.name}</Typography><Chip label={r.state}/><Typography>{r.reason||'Official-source research queued'}</Typography><Typography>Missing: {r.missing_fields.join(', ')||'None recorded'} · Last attempt: {date(r.checked_at)} · Next attempt: {date(r.next_attempt_at)}</Typography><Button href={'/app/discovery-admin?tab=catalog&q='+encodeURIComponent(r.name)}>View evidence and history</Button></>}
              {tab === "sources" && (
                <>
                  <Typography variant="h6">{r.name}</Typography>
                  <Typography>
                    {r.enabled ? "Enabled" : "Disabled"} · {r.found} grants
                    published · {r.failures} URLs failing
                  </Typography>
                  <Typography>
                    Last success: {date(r.last_success)} · Next target:{" "}
                    {date(r.next_check)}
                  </Typography>
                  <Typography color="text.secondary">
                    Extraction:{" "}
                    {r.url.includes("spencer.org")
                      ? "Spencer evidence adapter + conservative generic extraction"
                      : "Conservative generic extraction; unknown facts remain blank"}
                  </Typography>
                  <CrawlButton
                    command="refresh-source"
                    id={r.id}
                    label="Queue source refresh"
                  />
                  <Accordion sx={{ mt: 2 }}>
                    <AccordionSummary>
                      Edit source and schedule
                    </AccordionSummary>
                    <AccordionDetails>
                      <SourceForm source={r} />
                    </AccordionDetails>
                  </Accordion>
                </>
              )}
              {tab === "attention" && (
                <>
                  <Typography variant="h6">{r.title}</Typography>
                  <Typography>
                    {r.kind} · {r.source_name ?? ""}
                  </Typography>
                  <Button
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open source
                  </Button>
                  <Typography>{r.reason}</Typography>
                  {r.kind==='locked'? <Button href={'/app/discovery-admin?tab=catalog&q='+encodeURIComponent(r.title)}>View locked field and evidence</Button> : r.kind === "unavailable" ? (
                    <>
                      <Typography>{r.failures} unsuccessful checks · {r.error}</Typography>
                      <CrawlButton
                        command="refresh-source"
                        id={r.source_id}
                        label="Retry source"
                      />
                    </>
                  ) : (
                    <>
                      {r.kind === "domain" ? (
                        <CrawlButton
                          command="domain"
                          id={r.id}
                          label="Approve domain"
                        />
                      ) : (
                        <>
                          <Button
                            href={"/app/catalog-review?candidate=" + r.id}
                          >
                            Review facts
                          </Button>
                          <Accordion>
                            <AccordionSummary>
                              Compare facts and evidence
                            </AccordionSummary>
                            <AccordionDetails>
                              <Box
                                sx={{
                                  display: "grid",
                                  gridTemplateColumns: {
                                    xs: "1fr",
                                    md: "1fr 1fr",
                                  },
                                  gap: 2,
                                }}
                              >
                                <Box>
                                  <Typography variant="subtitle2">
                                    Previous
                                  </Typography>
                                  <pre style={{ whiteSpace: "pre-wrap" }}>
                                    {JSON.stringify(r.previous, null, 2)}
                                  </pre>
                                </Box>
                                <Box>
                                  <Typography variant="subtitle2">
                                    Proposed
                                  </Typography>
                                  <pre style={{ whiteSpace: "pre-wrap" }}>
                                    {JSON.stringify(r.proposed, null, 2)}
                                  </pre>
                                </Box>
                              </Box>
                              <Typography
                                sx={{
                                  maxHeight: 300,
                                  overflow: "auto",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {r.evidence}
                              </Typography>
                            </AccordionDetails>
                          </Accordion>
                        </>
                      )}
                      <CrawlButton
                        command="dismiss"
                        id={r.id}
                        label="Dismiss"
                      />
                    </>
                  )}
                </>
              )}
              {tab === "activity" && (
                <>
                  <Typography variant="subtitle2">
                    {date(r.created_at)} · {r.kind}
                  </Typography>
                  <Chip label={r.status} size="small" />
                  <Typography>
                    {r.pages} pages · {r.detail || "No additional details"}
                  </Typography>
                </>
              )}
            </Paper>
          ))}
          <Stack direction="row" sx={{ alignItems: "center", gap: 2 }}>
            <Button href={href(d.page - 1)} disabled={d.page <= 1}>
              Previous
            </Button>
            <Typography>
              Page {d.page} · {rows[0]?.total ?? 0} matching items
            </Typography>
            <Button
              href={href(d.page + 1)}
              disabled={
                rows.length < 25 || d.page * 25 >= Number(rows[0]?.total)
              }
            >
              Next
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}
