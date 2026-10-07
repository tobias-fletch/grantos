"use client";
import { useState } from "react";
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
}: {
  profile: ProfileValues;
  canEdit?: boolean;
  onboarding?: boolean;
  error?: boolean;
  saved?: boolean;
}) {
  const [selected, setSelected] = useState(profile.categories ?? []);
  return (
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      <Typography variant="overline" color="secondary">
        A better starting point
      </Typography>
      <Typography variant="h1" sx={{ mt: 1, mb: 2 }}>
        {onboarding ? "Make room for your ideas." : "Your funding profile"}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Tell us what you’re building. Your interests, applicant type, and
        location help us put relevant opportunities first. You can change these
        anytime.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Check your name, country, and funding interests, then try again.
        </Alert>
      )}
      {saved && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Profile saved. Your recommendations have been updated.
        </Alert>
      )}
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
          <Box component="form" action={saveOnboardingAction}>
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
                <TextField
                  name="displayName"
                  label="Display name"
                  defaultValue={profile.display_name ?? ""}
                  required
                  slotProps={{ htmlInput: { minLength: 2, maxLength: 120 } }}
                />
                <TextField
                  select
                  name="applicantType"
                  label="I’m applying as"
                  defaultValue={profile.applicant_type ?? "individual"}
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
                      helperText="Choose one or more. We look for matches to any of your interests."
                    />
                  )}
                />
                {selected.map((c) => (
                  <input type="hidden" name="categories" value={c} key={c} />
                ))}
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
                  ].map(([name, label, key]) => (
                    <TextField
                      key={name}
                      name={name}
                      label={label}
                      defaultValue={
                        profile[key as keyof ProfileValues] ??
                        (name === "country" ? "United States" : "")
                      }
                      required={name === "country"}
                      slotProps={{
                        htmlInput: {
                          maxLength: name === "postalCode" ? 20 : 120,
                        },
                      }}
                    />
                  ))}
                </Box>
                {canEdit ? (
                  <Submit>
                    {onboarding ? "Start exploring →" : "Save funding profile"}
                  </Submit>
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
