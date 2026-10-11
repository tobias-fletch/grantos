import { z } from "zod";
import { categories } from "@/lib/opportunities/store";

export const onboardingSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  applicantType: z.enum([
    "individual",
    "organization",
    "business",
    "nonprofit",
    "fiscal_sponsored",
    "collective",
    "student",
    "researcher",
    "consultant",
  ]),
  categories: z.array(z.string().refine(value => categories.includes(value))).min(1).max(categories.length).transform(values => [...new Set(values)]),
  country: z.string().trim().min(2).max(120),
  state: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  county: z.string().trim().max(120).optional(),
  borough: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
});

// Drafts may be incomplete, but every saved value is still bounded and validated.
export const quickSetupDraftSchema = onboardingSchema.extend({
  displayName: z.string().trim().max(120),
  country: z.string().trim().max(120),
  categories: z.array(z.string().refine(value => categories.includes(value))).max(categories.length).transform(values => [...new Set(values)]),
  projectName: z.string().trim().max(120),
  fundingPurpose: z.string().trim().max(6000),
  projectLocation: z.string().trim().max(1000),
});

export const quickSetupSchema = onboardingSchema.extend({
  projectName: z.string().trim().min(2).max(120),
  fundingPurpose: z.string().trim().min(10).max(6000),
  projectLocation: z.string().trim().min(2).max(1000),
});
