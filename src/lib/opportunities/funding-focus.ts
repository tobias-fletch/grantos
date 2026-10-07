export const fundingFocusOptions = [
  { value: "lgbtq", label: "LGBTQ+" },
  { value: "women", label: "Women" },
  { value: "minorities", label: "Racial / ethnic minorities" },
] as const;

export function parseFundingFocus(value: string | string[] | undefined): string[] {
  return [...new Set((Array.isArray(value) ? value : [value]).filter(
    (v): v is string => fundingFocusOptions.some(o => o.value === v),
  ))];
}

// Text discovery, not an eligibility classification or inference about a user.
const terms: Record<string, RegExp> = {
  lgbtq: /\b(?:lgbt[qia]*|queer|lesbian|gay|bisexual|transgender|nonbinary|non-binary|two-spirit)\b/i,
  women: /\b(?:women|woman|female|womxn)\b/i,
  minorities: /\b(?:minority|minorities|bipoc|people of colo[u]?r|persons of colo[u]?r|black|african[- ]american|hispanic|latino|latina|latinx|latine|indigenous|native american|american indian|alaska native|asian[- ]american|pacific islander|aapi)\b/i,
};

export function matchesFundingFocus(text: string, selected: string[]): boolean {
  return selected.length === 0 || selected.some(f => terms[f]?.test(text));
}
