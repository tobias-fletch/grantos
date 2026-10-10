"use client";
import {searchSubmission,researchRequest} from "@/lib/opportunities/search-navigation";
import {usStates} from "@/lib/opportunities/geography";
import {availabilityLabel} from "@/lib/opportunities/availability";
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
  Tabs,
  Tab,
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
  const router=useRouter();
  return (
    <Box
      component="form"
      action="/app/opportunities"
      onSubmit={(e:React.FormEvent<HTMLFormElement>)=>{
        e.preventDefault();const p=new URLSearchParams();
        new FormData(e.currentTarget).forEach((v,k)=>p.append(k,String(v)));
        p.set('researchRequest',crypto.randomUUID());router.push('/app/opportunities?'+p);
      }}
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
              availabilityLabel(r.status,r.rolling)
            }
            sx={{ maxWidth:"100%",height:"auto",alignSelf:"flex-start", "& .MuiChip-label":{whiteSpace:"normal",py:0.5} }}
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
            <Typography sx={{ fontWeight: 700 }}>{r.rolling?'Rolling — no fixed deadline':when(r.deadline)}</Typography>
            {r.previousDeadline && <Typography variant="caption">Previous round: {when(r.previousDeadline)}. Next deadline unknown.</Typography>}
            {r.status==='upcoming' && r.opens && <Typography variant="caption">Opens {when(r.opens)}</Typography>}
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
          · {r.recordType==='research'?'Research lead':'Grant program'}
          {r.sourceChecked||r.fetched?" · Source checked "+new Date(r.sourceChecked??r.fetched!).toLocaleDateString():" · Source check date unknown"}{r.sourceStale?" · Recheck due":""}
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
  counts,
  locationUnknown=0, eligibleProgramCount=0,
}: {
  locationUnknown?:number; eligibleProgramCount?:number;
  rows: GrantResult[];
  total: number;
  filters: Filters;
  canEdit: boolean;
  refresh: string;
  previewResult?: GrantResult | null;
  counts: {programs:number;leads:number};
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [advanced, setAdvanced] = useState(false);
  const [draftFocus,setDraftFocus]=useState(filters.focus);
  const [selected, setSelected] = useState(filters.categories);
  const [pending, start] = useTransition();
  const preview =
    rows.find((r) => r.kind + ":" + r.id === params.get("preview")) ??
    previewResult;
  function go(p: URLSearchParams) {
    p.set("discover", "1");
    p.delete("preview");
    p.delete("page");
    p.delete("programPage");
    p.delete("leadPage");
    start(() => router.push("/app/opportunities?" + p, { scroll: false }));
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    new FormData(e.currentTarget).forEach((v, k) => {
      if (String(v)) p.append(k, String(v));
    });
    go(searchSubmission(p,filters,crypto.randomUUID()));
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
        ["", "Use selected / profile location"],
        ["any", "Any location (no eligibility filtering)"],
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
        ["between_rounds", "Between rounds (recurring)"],
        ["round_ended", "Previous round ended"],
        ["closed", "Not accepting applications"],
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
  ] as const;
  const applied = [
    ...filters.focus.map((f) => ({key: "focus", value: f, label: fundingFocusOptions.find(o => o.value === f)!.label})),
    ...filters.categories.map((c) => ({ key: "category", value: c, label: c })),
    ...["applicant", "location", "status", "freshness", "minAward"]
      .filter((k) => !!filters[k as keyof Filters])
      .map((k) => ({
        key: k,
        value: String(filters[k as keyof Filters]??""),
        label:
          k + ": " + String(filters[k as keyof Filters]??"").replaceAll("_", " "),
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
      {canEdit && researchRequest(new URLSearchParams(params)) && <SearchDiscovery query={params.toString()} requestId={researchRequest(new URLSearchParams(params))!} />}
      {filters.country && <Alert severity="info" sx={{mb:2}} action={<Button onClick={()=>{const p=new URLSearchParams(params);p.set('geoEligibility',filters.geoEligibility==='unknown'?'eligible':'unknown');go(p);}}>{filters.geoEligibility==='unknown'?'Show location matches':`Needs checking (${locationUnknown})`}</Button>}>
        {filters.geoEligibility==='unknown'?'Location eligibility needs checking. These listings are not confirmed geographic matches.':`Searching programs available to applicants in ${[filters.city,filters.state,filters.country].filter(Boolean).join(', ')} — including nationwide programs.`}
      </Alert>}
      <Tabs value={filters.resultType==='leads'?'leads':'programs'} aria-label="Opportunity views" variant="fullWidth" sx={{mb:2}} onChange={(_,view)=>{
        const p=new URLSearchParams(params);p.set('resultType',view);p.set('programPage',String(filters.programPage));p.set('leadPage',String(filters.leadPage));p.delete('page');p.delete('preview');
        start(()=>router.push('/app/opportunities?'+p,{scroll:false}));
      }}>
        <Tab value="programs" label={`Grant programs (${counts.programs})`} />
        <Tab value="leads" label={`Research leads (${counts.leads})`} />
      </Tabs>
      <Typography color="text.secondary" sx={{mb:2}}>{filters.resultType==='leads'?'Potential opportunities whose program identity still needs checking. You can save them privately while research continues.':'Recognizable grant programs, including incomplete listings. Check source requirements before applying.'}</Typography>
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
            <TextField name="city" label="Applicant city" defaultValue={filters.city} slotProps={{htmlInput:{maxLength:100}}} />
            <TextField select name="state" label="Applicant state" defaultValue={filters.state} helperText="State names and abbreviations are normalized"><MenuItem value="">State not specified</MenuItem>{Object.entries(usStates).map(([code,name])=><MenuItem key={code} value={name}>{name} ({code})</MenuItem>)}</TextField>
            <TextField name="postal_code" label="ZIP (optional)" defaultValue={filters.postal_code} slotProps={{htmlInput:{pattern:'[0-9]{5}(-[0-9]{4})?',maxLength:10}}} />
            <input type="hidden" name="country" value={filters.country||"United States"} />
            <input type="hidden" name="geoEligibility" value={filters.geoEligibility} />
            {filters.focus.map(f => <input key={f} type="hidden" name="focus" value={f} />)}
            {selected.map((c) => (
              <input key={c} name="category" type="hidden" value={c} />
            ))}
            {[
              "applicant",
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
                value={String(filters[k as keyof Filters]??"")}
              />
            ))}
            <Button variant="contained" type="submit" disabled={pending}>
              Search grants →
            </Button>
          </Box>
          <Stack
            direction="row"
            sx={{ gap: 1, flexWrap: "wrap", alignItems: "center", mt: 1 }}
          >
            <Button variant="outlined" onClick={() => {setDraftFocus(filters.focus);setAdvanced(true);}}>
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
            {total} {filters.resultType==='leads'?'research leads':'grant programs'}
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
      <Stack direction="row" useFlexGap sx={{gap:1,flexWrap:'wrap',mb:3}} aria-label="Quick availability filters">
        {[['','Any availability'],['open','Open now'],['upcoming','Upcoming'],['between_rounds','Between rounds'],['unknown','Status unknown']].map(([value,label])=><Chip key={value} component="button" type="button" clickable aria-pressed={filters.status===value} label={label} color={filters.status===value?'primary':'default'} variant={filters.status===value?'filled':'outlined'} onClick={()=>{const p=new URLSearchParams(params);value?p.set('status',value):p.delete('status');go(p);}} />)}
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
            No matches in this view. Unknown facts do not satisfy specific filters. Try another keyword or remove an
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
            p.set(filters.resultType==='leads'?'leadPage':'programPage',String(page));
            p.set(filters.resultType==='leads'?'programPage':'leadPage',String(filters.resultType==='leads'?filters.programPage:filters.leadPage));
            p.delete('page');
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
          {draftFocus.map(f => <input key={f} type="hidden" name="focus" value={f} />)}
          {["country","state","city","postal_code","county","borough","geoEligibility"].map(k=><input key={k} type="hidden" name={k} value={String(filters[k as keyof Filters]??"")} />)}
          <input type="hidden" name="q" value={filters.q} />
          <input type="hidden" name="sort" value={filters.sort} />
          {filters.categories.map((c) => (
            <input key={c} type="hidden" name="category" value={c} />
          ))}
          <input type="hidden" name="resultType" value={filters.resultType} />
          <Box sx={{mt: 2, mb: 2}}>
            <Typography variant="subtitle2" sx={{mb: 1}}>Funding focus</Typography>
            <Stack direction="row" sx={{gap: 1, flexWrap: "wrap"}}>
              {fundingFocusOptions.map(option => <Chip key={option.value} label={option.label} component="button" type="button" clickable disabled={pending} aria-pressed={draftFocus.includes(option.value)} color={draftFocus.includes(option.value) ? "primary" : "default"} variant={draftFocus.includes(option.value) ? "filled" : "outlined"} onClick={() => {
                setDraftFocus(current=>current.includes(option.value)?current.filter(f=>f!==option.value):[...current,option.value]);
              }} />)}
            </Stack>
            <Typography variant="caption" color="text.secondary">Matches any selected focus mentioned in grant descriptions or source excerpts. Check the funder’s eligibility requirements; these are search interests, not personal identity information.</Typography>
          </Box>
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
                  preview.recordType==='research'?"Research lead":"Grant program"
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
                ? preview.autoVerified ? "Automatically checked against an official source. Check the current requirements before applying." : "Human reviewed. Check the evidence for each fact and the current funder requirements."
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
                <strong>Source deadline:</strong> {preview.rolling?'Rolling — no fixed deadline':when(preview.deadline)}
                {preview.previousDeadline && <span> · Previous round: {when(preview.previousDeadline)}; next deadline unknown.</span>}
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
