export const fundingFocusOptions = [
  { value: "lgbtq", label: "LGBTQ+" },
  { value: "women", label: "Women" },
  { value: "minorities", label: "Racial / ethnic minorities" },
  { value: "veterans", label: "Veterans & military families" },
  { value: "disabilities", label: "People with disabilities" },
  { value: "indigenous", label: "Indigenous & tribal communities" },
  { value: "immigrants", label: "Immigrants & refugees" },
  { value: "youth", label: "Children & youth" },
  { value: "older-adults", label: "Older adults" },
  { value: "rural", label: "Rural communities" },
  { value: "low-income", label: "Low-income communities" },
] as const;

export function parseFundingFocus(value: string | string[] | undefined): string[] {
  return [...new Set((Array.isArray(value) ? value : [value]).filter(
    (v): v is string => fundingFocusOptions.some(o => o.value === v),
  ))];
}

// Text discovery, not an eligibility classification or inference about a user.
const terms: Record<string, RegExp> = {
  veterans: /\b(?:veterans?|military families|military spouses?|service members?|servicemembers?|active[- ]duty)\b/i,
  disabilities: /\b(?:disabilit(?:y|ies)|disabled|deaf|hard of hearing|visually impaired|blindness|neurodiver(?:gent|sity)|autis(?:m|tic))\b/i,
  indigenous: /\b(?:indigenous|tribal|tribes?|native american|american indian|alaska native|native hawaiian|first nations)\b/i,
  immigrants: /\b(?:immigrants?|refugees?|asylum[- ]seekers?|new americans|migrant (?:families|workers|communities))\b/i,
  youth: /\b(?:children|childhood|youth|teens?|teenagers?|adolescents?|young people|young adults?|foster care)\b/i,
  "older-adults": /\b(?:older adults?|older people|elderly|senior citizens?|aging populations?|ageing populations?|seniors)\b/i,
  rural: /\b(?:rural|remote communities|small[- ]towns?)\b/i,
  "low-income": /\b(?:low[- ]income|lower[- ]income|poverty|economically disadvantaged|financial hardship|financial need|economically distressed)\b/i,
  lgbtq: /\b(?:lgbt[qia]*|queer|lesbian|gay|bisexual|transgender|nonbinary|non-binary|two-spirit)\b/i,
  women: /\b(?:women|woman|female|womxn)\b/i,
  minorities: /\b(?:minority|minorities|bipoc|people of colo[u]?r|persons of colo[u]?r|black|african[- ]american|hispanic|latino|latina|latinx|latine|indigenous|native american|american indian|alaska native|asian[- ]american|pacific islander|aapi)\b/i,
};

export function matchesFundingFocus(text: string, selected: string[]): boolean {
  return selected.length === 0 || selected.some(f => terms[f]?.test(text));
}
