"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ThemeControl } from "./provider";
import { categories, applicantTypes } from "@/lib/opportunities/store";
import { saveOnboardingAction } from "@/app/actions/onboarding";
export function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button variant="contained" type="submit" disabled={pending}>
      {pending ? "Saving…" : children}
    </Button>
  );
}
export type ProfileValues = {
  display_name?: string;
  applicant_type?: string;
  country?: string;
  state?: string;
  city?: string;
  county?: string;
  borough?: string;
  postal_code?: string;
  categories?: string[];
};
export function FundingProfileForm({
  profile,
  canEdit = true,
  onboarding = false,
  error = false,
  saved = false,
  setup = {},
}: {
  profile: ProfileValues;
  canEdit?: boolean;
  onboarding?: boolean;
  error?: boolean;
  saved?: boolean;
  setup?: { projectName?: string; fundingPurpose?: string; projectLocation?: string };
}) {
  const [selected, setSelected] = useState(profile.categories ?? []);
  const [state, formAction, pending] = useActionState(saveOnboardingAction, {});
  const [fields, setFields] = useState<Record<string, string>>({
    displayName: profile.display_name ?? "", applicantType: profile.applicant_type ?? "individual",
    country: profile.country ?? "United States", state: profile.state ?? "", city: profile.city ?? "",
    county: profile.county ?? "", borough: profile.borough ?? "", postalCode: profile.postal_code ?? "",
    projectName: setup.projectName ?? "", fundingPurpose: setup.fundingPurpose ?? "", projectLocation: setup.projectLocation ?? "",
  });
  const field = (name: string) => ({ value: fields[name] ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields(previous => ({ ...previous, [name]: event.target.value })) });
  return (
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      <Typography variant="overline" color="secondary">
        A better starting point
      </Typography>
      <Typography variant="h1" sx={{ mt: 1, mb: 2 }}>
        {onboarding ? "A quick start for your next grant." : "Your funding profile"}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {onboarding
          ? "Set up your applicant profile and first project. We’ll use your applicant type, address, and funding interests to find relevant grants. You can save your progress and come back."
          : "Your interests, applicant type, and address help us put relevant opportunities first. Editing this profile does not change your existing projects or applications."}
      </Typography>
      {(error || state.error) && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {state.error || "Check your name, country, and funding interests, then try again."}
        </Alert>
      )}
      {saved && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Profile saved. Your recommendations have been updated.
        </Alert>
      )}
      {state.saved && <Alert severity="success" sx={{ mb: 3 }} role="status">Progress saved. You can leave and resume this setup later.</Alert>}
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
          <Box component="form" action={formAction}>
            <input
              type="hidden"
              name="returnTo"
              value={onboarding ? "/onboarding" : "/app/profile"}
            />
            <Box
              component="fieldset"
              disabled={!canEdit}
              sx={{ border: 0, p: 0, m: 0 }}
            >
              <Stack spacing={3}>
                {onboarding && <Typography variant="h2">1. About the applicant</Typography>}
                <TextField
                  name="displayName"
                  label="Display name"
                  {...field("displayName")}
                  required
                  slotProps={{ htmlInput: { minLength: 2, maxLength: 120 } }}
                />
                <TextField
                  select
                  name="applicantType"
                  label="I’m applying as"
                  {...field("applicantType")}
                >
                  {applicantTypes.map((a) => (
                    <MenuItem key={a} value={a}>
                      {a.replaceAll("_", " ")}
                    </MenuItem>
                  ))}
                </TextField>
                <Autocomplete
                  multiple
                  disabled={!canEdit}
                  options={categories}
                  value={selected}
                  onChange={(_, v) => setSelected(v)}
                  renderInput={(p) => (
                    <TextField
                      {...p}
                      label="Funding interests"
                      helperText="Choose one or more areas for this funding search. We look for matches to any selected interest."
                    />
                  )}
                />
                {selected.map((c) => (
                  <input type="hidden" name="categories" value={c} key={c} />
                ))}
                <Box>
                  <Typography variant="h3">Applicant address</Typography>
                  <Typography variant="body2" color="text.secondary">Where you or the applying organization are based. A grant may have separate residency, registration, and project-service requirements.</Typography>
                </Box>
                <Box
                  sx={{
                    display: "grid",
                    gap: 3,
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  }}
                >
                  {[
                    ["country", "Country", "country"],
                    ["state", "State / region", "state"],
                    ["city", "City", "city"],
                    ["county", "County (optional)", "county"],
                    ["borough", "Borough (optional)", "borough"],
                    [
                      "postalCode",
                      "ZIP / postal code (optional)",
                      "postal_code",
                    ],
                  ].map(([name, label]) => (
                    <TextField
                      key={name}
                      name={name}
                      label={label}
                      {...field(name)}
                      required={name === "country"}
                      slotProps={{
                        htmlInput: {
                          maxLength: name === "postalCode" ? 20 : 120,
                        },
                      }}
                    />
                  ))}
                </Box>
                {onboarding && <>
                  <Typography variant="h2">2. What you want to fund</Typography>
                  <TextField name="projectName" label="Project name" {...field("projectName")} required slotProps={{ htmlInput: { minLength: 2, maxLength: 120 } }} />
                  <TextField name="fundingPurpose" label="What would the funding help you do?" {...field("fundingPurpose")} required multiline minRows={3} helperText="A short description of the activity, purchase, or work you want to fund. Private to your workspace; not sent to discovery providers or funders." slotProps={{ htmlInput: { minLength: 10, maxLength: 6000 } }} />
                  <TextField name="projectLocation" label="Where will the project take place or serve people?" {...field("projectLocation")} required multiline minRows={2} helperText="For example, New Orleans neighborhoods, statewide, or online. This is separate from the applicant address. It does not establish location eligibility." slotProps={{ htmlInput: { minLength: 2, maxLength: 1000 } }} />
                  <Alert severity="info">Your project is saved in your private workspace. Matches are starting points; legal status, service-area rules, and other eligibility requirements still need checking.</Alert>
                </>}
                {canEdit ? (
                  <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
                    <Submit>{onboarding ? "Find relevant grants →" : "Save funding profile"}</Submit>
                    {onboarding && <Button type="submit" name="intent" value="draft" formNoValidate disabled={pending}>Save progress</Button>}
                  </Stack>
                ) : (
                  <Alert severity="info">
                    Your workspace access is read-only.
                  </Alert>
                )}
              </Stack>
            </Box>
          </Box>
        </CardContent>
      </Card>
      <Box sx={{ mt: 3 }}>
        <Typography variant="h3" sx={{ mb: 2 }}>
          Your space, your mood
        </Typography>
        <ThemeControl />
      </Box>
    </Box>
  );
}
