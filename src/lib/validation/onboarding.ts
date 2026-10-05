import { z } from "zod";

export const onboardingSchema = z.object({
  displayName: z.string().min(2).max(120),
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
  categories: z.array(z.string()).min(1),
  country: z.string().min(2),
  state: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  borough: z.string().optional(),
  postalCode: z.string().optional(),
});
