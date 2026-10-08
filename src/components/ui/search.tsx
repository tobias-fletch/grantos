"use client";
import Link from "next/link";
import {SearchDiscovery} from "./search-discovery";
import { fundingFocusOptions } from "@/lib/opportunities/funding-focus";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Drawer,
  MenuItem,
  Pagination,
  Stack,
  TextField,
  Typography,
  Divider,
  LinearProgress,
} from "@mui/material";
import {
  categories,
  applicantTypes,
  type Filters,
} from "@/lib/opportunities/store";
import type { GrantResult } from "@/lib/opportunities/ranking";
import { saveResult } from "@/app/actions/save-result";
export function QuickSearch({
  initialCategories = [],
}: {
  initialCategories?: string[];
}) {
  const [selected, setSelected] = useState(initialCategories);
  return (
    <Box
      component="form"
      action="/app/opportunities"
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr auto" },
        alignItems: "start",
      }}
    >
      <input type="hidden" name="discover" value="1" />
      <TextField
        name="q"
        label="What would you like to fund?"
        placeholder="A project, idea, or funder"
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      <Autocomplete
        multiple
        options={categories}
        value={selected}
        onChange={(_, v) => setSelected(v)}
        renderInput={(p) => <TextField {...p} label="Funding interests" />}
      />
      {selected.map((c) => (
        <input key={c} name="category" type="hidden" value={c} />
      ))}
      <Button variant="contained" type="submit" sx={{ minHeight: 40 }}>
        Find grants →
      </Button>
    </Box>
  );
}
export function SaveGrant({
  result,
  canEdit,
}: {
  result: GrantResult;
  canEdit: boolean;
}) {
  const [id, setId] = useState(result.applicationId);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <Stack sx={{ gap: 1 }}>
      {id ? (
        <Button
          component={Link}
          href={"/app/applications/" + id}
          variant="outlined"
        >
          Saved · Open my grant ↗
        </Button>
      ) : (
        <Button
          disabled={!canEdit || pending}
          variant="contained"
          onClick={() =>
            start(async () => {
              setError("");
              const saved = await saveResult(result.kind, result.id);
              if (saved.id) setId(saved.id);
              else setError(saved.error ?? "Could not save.");
            })
          }
        >
          {pending ? "Saving…" : canEdit ? "Save grant +" : "View-only access"}
        </Button>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {id && !result.applicationId && (
        <Typography role="status" variant="caption">
          Saved to your private workspace.
        </Typography>
      )}
    </Stack>
  );
}
const when = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";
export function GrantCard({
  result: r,
  canEdit,
  onPreview,
}: {
  result: GrantResult;
  canEdit: boolean;
  onPreview?: (r: GrantResult) => void;
}) {
  return (
    <Card
      component="article"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        transition: "border-color .15s",
        "&:hover": { borderColor: "primary.main" },
      }}
    >
      <CardContent
        sx={{
          p: 3,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          gap: 2,
        }}
      >
        <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
          <Typography
            variant="overline"
            sx={{ color: "text.secondary", lineHeight: 1.6 }}
          >
            {r.source}
          </Typography>
          <Chip
            size="small"
            variant="outlined"
            label={
              r.status === "unknown"
                ? "Status unknown"
                : r.status.replaceAll("_", " ")
            }
            sx={{ textTransform: "capitalize" }}
          />
        </Stack>
        <Typography variant="h3">
          {onPreview ? (
            <Button
              onClick={() => onPreview(r)}
              sx={{
                p: 0,
                minHeight: 0,
                textAlign: "left",
                fontSize: "inherit",
                fontWeight: "inherit",
                color: "text.primary",
                justifyContent: "flex-start",
              }}
            >
              {r.title}
            </Button>
          ) : (
            <Link
              href={"/app/opportunities?preview=" + r.kind + ":" + r.id}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {r.title}
            </Link>
          )}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {r.summary || "Check the funder source for program details."}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Award
            </Typography>
            <Typography sx={{ fontWeight: 700 }}>{r.amount}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Source deadline
            </Typography>
            <Typography sx={{ fontWeight: 700 }}>{when(r.deadline)}</Typography>
          </Box>
        </Box>
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
          {r.reasons.slice(0, 3).map((s) => (
            <Chip
              key={s}
              label={s}
              size="small"
              variant="outlined"
              sx={{ maxWidth: "100%" }}
            />
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {r.verified
            ? r.autoVerified ? "Official-source confirmed facts — check evidence" : "Human reviewed — check current requirements"
            : "Unverified — check the funder’s requirements"}{" "}
          · {r.kind === "lead" ? "Grant lead" : "Catalog"}
          {r.sourceStale ? " · Source recheck due" : r.sourceChecked ? " · Source checked " + new Date(r.sourceChecked).toLocaleDateString() : ""}
        </Typography>
        <Box
          sx={{
            mt: "auto",
            pt: 1,
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <SaveGrant result={r} canEdit={canEdit} />
          {onPreview && (
            <Button onClick={() => onPreview(r)}>Quick look →</Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
export function GrantSearch({
  rows,
  total,
  filters,
  canEdit,
  refresh,
  previewResult,
}: {
  rows: GrantResult[];
  total: number;
  filters: Filters;
  canEdit: boolean;
  refresh: string;
  previewResult?: GrantResult | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [advanced, setAdvanced] = useState(false);
  const [selected, setSelected] = useState(filters.categories);
  const [pending, start] = useTransition();
  const preview =
    rows.find((r) => r.kind + ":" + r.id === params.get("preview")) ??
    previewResult;
  function go(p: URLSearchParams) {
    p.set("discover", "1");
    p.delete("preview");
    p.delete("page");
    start(() => router.push("/app/opportunities?" + p, { scroll: false }));
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    new FormData(e.currentTarget).forEach((v, k) => {
      if (String(v)) p.append(k, String(v));
    });
    go(p);
    setAdvanced(false);
  }
  function open(r: GrantResult) {
    const p = new URLSearchParams(params);
    p.set("preview", r.kind + ":" + r.id);
    router.push("/app/opportunities?" + p, { scroll: false });
  }
  function close() {
    const p = new URLSearchParams(params);
    p.delete("preview");
    router.replace("/app/opportunities?" + p, { scroll: false });
  }
  const fields = [
    [
      "applicant",
      "Applicant type",
      [
        ["", "Any applicant"],
        ...applicantTypes.map((a) => [a, a.replaceAll("_", " ")]),
      ],
    ],
    [
      "location",
      "Location",
      [
        ["", "Any location"],
        ["nyc", "Available to NYC applicants"],
        ["nyc_only", "NYC-specific programs"],
      ],
    ],
    [
      "status",
      "Application status",
      [
        ["", "Any status"],
        ["open", "Open"],
        ["upcoming", "Upcoming"],
        ["unknown", "Unknown"],
        ["closed", "Closed"],
        ["unannounced", "Next cycle unannounced"],
      ],
    ],
    [
      "freshness",
      "Recently discovered",
      [
        ["", "Any time"],
        ["new", "Added in the last 7 days"],
        ["updated", "Updated in the last 7 days"],
      ],
    ],
    [
      "resultType",
      "Include",
      [
        ["grants", "Catalog + likely grant leads"],
        ["catalog", "Catalog only"],
        ["all", "All research pages"],
      ],
    ],
  ] as const;
  const applied = [
    ...filters.focus.map((f) => ({key: "focus", value: f, label: fundingFocusOptions.find(o => o.value === f)!.label})),
    ...filters.categories.map((c) => ({ key: "category", value: c, label: c })),
    ...["applicant", "location", "status", "freshness", "minAward"]
      .filter((k) => !!filters[k as keyof Filters])
      .map((k) => ({
        key: k,
        value: String(filters[k as keyof Filters]),
        label:
          k + ": " + String(filters[k as keyof Filters]).replaceAll("_", " "),
      })),
  ];
  return (
    <>
      <Typography variant="overline" color="secondary">
        A little curiosity. A lot of possibility.
      </Typography>
      <Typography variant="h1" sx={{ mt: 1, mb: 2 }}>
        Find your next
        <br />
        big{" "}
        <Box component="span" sx={{ color: "primary.main" }}>
          opportunity.
        </Box>
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4, maxWidth: 650 }}>
        Explore grants for your ideas. We put profile matches first, and keep
        promising leads within reach.
      </Typography>
      {params.get("discover") === "1" && <SearchDiscovery query={new URLSearchParams([...filters.categories.map(c=>["category",c]),...filters.focus.map(f=>["focus",f]),["q",filters.q]]).toString()} />}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box
            component="form"
            onSubmit={submit}
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr auto" },
              alignItems: "start",
            }}
          >
            <TextField
              name="q"
              label="Search grants"
              defaultValue={filters.q}
              placeholder="Title, funder, or keyword"
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <Autocomplete
              multiple
              options={categories}
              value={selected}
              onChange={(_, v) => setSelected(v)}
              renderInput={(p) => (
                <TextField
                  {...p}
                  label="Choose funding interests"
                  helperText="Matches any selected interest"
                />
              )}
            />
            {filters.focus.map(f => <input key={f} type="hidden" name="focus" value={f} />)}
            {selected.map((c) => (
              <input key={c} name="category" type="hidden" value={c} />
            ))}
            {[
              "applicant",
              "location",
              "status",
              "freshness",
              "minAward",
              "resultType",
              "sort",
            ].map((k) => (
              <input
                key={k}
                type="hidden"
                name={k}
                value={String(filters[k as keyof Filters])}
              />
            ))}
            <Button variant="contained" type="submit" disabled={pending}>
              Search grants →
            </Button>
          </Box>
          <Box sx={{mt: 2, mb: 2}}>
            <Typography variant="subtitle2" sx={{mb: 1}}>Funding focus</Typography>
            <Stack direction="row" sx={{gap: 1, flexWrap: "wrap"}}>
              {fundingFocusOptions.map(option => <Chip key={option.value} label={option.label} component="button" type="button" clickable disabled={pending} aria-pressed={filters.focus.includes(option.value)} color={filters.focus.includes(option.value) ? "primary" : "default"} variant={filters.focus.includes(option.value) ? "filled" : "outlined"} onClick={() => {
                const p = new URLSearchParams(params);
                p.delete("focus");
                const values = filters.focus.includes(option.value) ? filters.focus.filter(f => f !== option.value) : [...filters.focus, option.value];
                values.forEach(f => p.append("focus", f));
                go(p);
              }} />)}
            </Stack>
            <Typography variant="caption" color="text.secondary">Matches any selected focus mentioned in grant descriptions or source excerpts. Check the funder’s eligibility requirements; these are search interests, not personal identity information.</Typography>
          </Box>
          <Stack
            direction="row"
            sx={{ gap: 1, flexWrap: "wrap", alignItems: "center", mt: 1 }}
          >
            <Button variant="outlined" onClick={() => setAdvanced(true)}>
              Filters {applied.length ? `(${applied.length})` : ""}
            </Button>
            {applied.map((c) => (
              <Chip
                key={c.key + c.value}
                label={c.label}
                onDelete={() => {
                  const p = new URLSearchParams(params);
                  if (c.key === "category") {
                    p.delete("category");
                    filters.categories
                      .filter((v) => v !== c.value)
                      .forEach((v) => p.append("category", v));
                    setSelected(selected.filter((v) => v !== c.value));
                  } else if (c.key === "focus") {
                    p.delete("focus");
                    filters.focus.filter(f => f !== c.value).forEach(f => p.append("focus", f));
                  } else p.delete(c.key);
                  go(p);
                }}
              />
            ))}
            {(applied.length > 0 || filters.q) && (
              <Button
                onClick={() => {
                  setSelected([]);
                  router.push("/app/opportunities");
                }}
              >
                Clear all
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          gap: 2,
          justifyContent: "space-between",
          alignItems: { sm: "center" },
          mb: 3,
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 700 }} role="status">
            {total} {total === 1 ? "opportunity" : "opportunities"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {refresh}
          </Typography>
        </Box>
        <TextField
          select
          label="Sort by"
          value={filters.sort}
          onChange={(e) => {
            const p = new URLSearchParams(params);
            p.set("sort", e.target.value);
            go(p);
          }}
          sx={{ width: { xs: "100%", sm: 230 } }}
        >
          {[
            ["recommended", "Recommended for you"],
            ["deadline", "Status, then deadline"],
            ["amount", "Highest award"],
            ["recent", "Recently checked"],
          ].map(([v, l]) => (
            <MenuItem key={v} value={v}>
              {l}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {pending && <LinearProgress aria-label="Searching" sx={{ mb: 2 }} />}
      {params.get("error") && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Could not save this grant. Check your access and try again.
        </Alert>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 2.5,
          opacity: pending ? 0.65 : 1,
        }}
      >
        {rows.map((r) => (
          <GrantCard
            key={r.kind + r.id}
            result={r}
            canEdit={canEdit}
            onPreview={open}
          />
        ))}
      </Box>
      {!total && (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography variant="h2">Let’s widen the possibilities.</Typography>
          <Typography sx={{ my: 2 }}>
            No matches for these filters. Try another keyword or remove an
            interest or eligibility filter.
          </Typography>
          <Button
            component={Link}
            href="/app/opportunities"
            variant="contained"
          >
            Explore all grants
          </Button>
        </Card>
      )}
      {total > 12 && (
        <Pagination
          count={Math.ceil(total / 12)}
          page={filters.page}
          onChange={(_, page) => {
            const p = new URLSearchParams(params);
            p.set("page", String(page));
            p.delete("preview");
            router.push("/app/opportunities?" + p);
          }}
          sx={{ mt: 4, display: "flex", justifyContent: "center" }}
        />
      )}
      <Box sx={{ mt: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Recommendations use your interests, applicant type, and location—not a
          guarantee of eligibility. Unknown facts never satisfy a specific
          filter.
        </Typography>
        <Button component={Link} href="/app/profile">
          Edit funding profile →
        </Button>
        <Button component={Link} href="/app/research">
          Import a funder source
        </Button>
      </Box>
      <Drawer
        anchor="right"
        open={advanced}
        onClose={() => setAdvanced(false)}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": "Search filters",
            sx: { width: { xs: "100%", sm: 420 }, p: 3 },
          },
        }}
      >
        <Box component="form" onSubmit={submit}>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", mb: 3 }}
          >
            <Typography variant="h2">Refine your search</Typography>
            <Button onClick={() => setAdvanced(false)}>Close</Button>
          </Stack>
          {filters.focus.map(f => <input key={f} type="hidden" name="focus" value={f} />)}
          <input type="hidden" name="q" value={filters.q} />
          <input type="hidden" name="sort" value={filters.sort} />
          {filters.categories.map((c) => (
            <input key={c} type="hidden" name="category" value={c} />
          ))}
          <Stack sx={{ gap: 3 }}>
            {fields.map(([name, label, options]) => (
              <TextField
                key={name}
                select
                name={name}
                label={label}
                defaultValue={filters[name]}
              >
                {options.map(([v, l]) => (
                  <MenuItem value={v} key={v}>
                    {l}
                  </MenuItem>
                ))}
              </TextField>
            ))}
            <TextField
              name="minAward"
              label="Minimum award potential (USD)"
              type="number"
              defaultValue={filters.minAward || ""}
              slotProps={{ htmlInput: { min: 0, max: 100000000 } }}
            />
            <Alert severity="info">
              Specific filters exclude unknown facts. Leave them broad to
              explore incomplete leads.
            </Alert>
            <Button variant="contained" type="submit">
              Show results
            </Button>
          </Stack>
        </Box>
      </Drawer>
      <Drawer
        anchor="right"
        open={!!preview && !!params.get("preview")}
        onClose={close}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": "Grant preview",
            sx: { width: { xs: "100%", sm: 580 }, p: { xs: 2, sm: 4 } },
          },
        }}
      >
        {preview && (
          <>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Chip
                label={
                  preview.kind === "lead" ? "Grant lead" : "Catalog listing"
                }
                size="small"
              />
              <Button onClick={close}>Close ✕</Button>
            </Stack>
            <Typography variant="h2" sx={{ mt: 4, mb: 1 }}>
              {preview.title}
            </Typography>
            <Typography color="text.secondary">{preview.source}</Typography>
            <Alert
              severity={preview.verified ? "success" : "warning"}
              sx={{ my: 3 }}
            >
              {preview.verified
                ? preview.autoVerified ? "Automatically checked against an official source. Check the current requirements before applying." : "Source verified. Check the current funder requirements before applying."
                : "Unverified — check the funder’s requirements."}
            </Alert>
            {preview.awaitingReview && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Source changes are awaiting review.
              </Alert>
            )}
            <Typography
              sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
            >
              {preview.summary}
            </Typography>
            <Divider sx={{ my: 3 }} />
            <Stack sx={{ gap: 2 }}>
              <Typography>
                <strong>Award:</strong> {preview.amount}
              </Typography>
              <Typography>
                <strong>Source deadline:</strong> {when(preview.deadline)}
              </Typography>
              <Typography>
                <strong>Applicant types:</strong>{" "}
                {preview.applicants.join(", ").replaceAll("_", " ") ||
                  "Unknown"}
              </Typography>
              <Typography>
                <strong>Location:</strong>{" "}
                {preview.locations.join(", ") || "Unknown"}
              </Typography>
              <Typography>
                <strong>Source fetched/checked:</strong> {when(preview.fetched)}
              </Typography>
              <Typography variant="h3">Why it’s here</Typography>
              {preview.reasons.map((r) => (
                <Typography key={r} variant="body2">
                  • {r}
                </Typography>
              ))}
              <SaveGrant key={preview.id} result={preview} canEdit={canEdit} />
              <Button
                component="a"
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
              >
                Visit funder source ↗
              </Button>
              {preview.slug && (
                <Button
                  component={Link}
                  href={"/app/opportunities/" + preview.slug}
                >
                  Full requirements →
                </Button>
              )}
            </Stack>
          </>
        )}
      </Drawer>
    </>
  );
}
