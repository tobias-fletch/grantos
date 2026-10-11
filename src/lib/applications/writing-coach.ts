import {words} from './preparation-values';

/** Local editorial assistance only. These templates are not funder requirements. */
export const writingSections = {
  summary: {
    label: 'Project summary',
    parts: ['Who and where the project serves', 'The need and your response', 'What you will deliver', 'The change you aim to achieve'],
    prompts: ['Name the people and place, using your saved facts.', 'Describe the specific need and why this response fits.', 'State the activities, scale and delivery period you can support.', 'Describe the intended outcome and how you will check it.'],
  },
  need: {
    label: 'Need and beneficiaries',
    parts: ['People and place', 'Evidence of the need', 'Community perspective', 'Why this response fits'],
    prompts: ['Describe the people and place without unsupported generalizations.', 'Give a dated, attributable source or clearly labeled firsthand observation.', 'Explain how participants informed the work; use a real example only with appropriate consent.', 'Connect the identified need to the proposed activities.'],
  },
  plan: {
    label: 'Activities and delivery',
    parts: ['Activities', 'Timeline and milestones', 'People and responsibilities', 'Delivery risks and response'],
    prompts: ['Explain what will happen and who will participate.', 'Give the sequence, delivery period and milestones.', 'Name confirmed delivery roles and distinguish proposed partnerships.', 'Describe realistic risks and what you will do if plans change.'],
  },
  outcomes: {
    label: 'Outcomes and evaluation',
    parts: ['Intended change', 'Indicators and starting point', 'Collection method', 'Review and learning'],
    prompts: ['Distinguish activities delivered from the change you want to see.', 'Choose supportable indicators and targets; label estimates and unknown baselines.', 'Explain who will collect what information, when and with what permissions.', 'Describe how you will review results and improve the work.'],
  },
  budget: {
    label: 'Budget justification',
    parts: ['Cost and calculation', 'Connection to activities', 'Funding sources', 'Assumptions and value'],
    prompts: ['Use actual quotes or documented rates, quantities and calculations.', 'Explain why each cost is necessary for the proposed work.', 'Distinguish confirmed funding from pending requests; check the actual match rules.', 'State your assumptions and explain value without claiming to be the cheapest.'],
  },
  capacity: {
    label: 'Experience and capacity',
    parts: ['Relevant experience', 'Evidence of delivery', 'Team and partnerships', 'Gaps and support'],
    prompts: ['Choose experience that directly relates to this proposal.', 'Give a real example and clearly attribute your role and results.', 'Describe actual roles, time available and confirmed commitments.', 'Explain how you will address capacity gaps without inventing qualifications.'],
  },
} as const;
export type WritingSection = keyof typeof writingSections;
export const writingStyles = {
  direct: {label: 'Clear and direct', tips: ['Answer the question in the first sentence.', 'Use concrete verbs and short paragraphs.', 'Follow a claim with its evidence and its relevance to the project.']},
  community: {label: 'Community-centered narrative', tips: ['Start with a specific, consented perspective or a factual local context.', 'Connect the experience to wider evidence; one story is not proof of prevalence.', 'Show the community’s role in decisions and finish with a practical response.']},
  research: {label: 'Research and evidence-led', tips: ['State the problem or research question and the gap in existing evidence.', 'Explain the approach, feasibility and limitations in language this audience can follow.', 'Separate established findings, hypotheses and expected contributions.']},
} as const;
export type WritingStyle = keyof typeof writingStyles;
export function suggestWritingSection(question: string): WritingSection {
  if (/budget|cost|expense|funding request|financial/i.test(question)) return 'budget';
  if (/evaluat|measur|outcome|impact|success/i.test(question)) return 'outcomes';
  if (/timeline|activit|deliver|implement|work plan/i.test(question)) return 'plan';
  if (/need|beneficiar|community|problem/i.test(question)) return 'need';
  if (/capacity|experience|qualif|track record|team/i.test(question)) return 'capacity';
  return 'summary';
}
export function recordedWordLimit(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string' || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 50000 ? n : null;
}
export function editorialOutline(section: WritingSection, style: WritingStyle): string {
  const structure = writingSections[section];
  return `${structure.label} — editorial outline\n\n${structure.parts.map((part, i) => `${part}\n[${structure.prompts[i]}]`).join('\n\n')}\n\nStyle reminder: ${writingStyles[style].tips.join(' ')}`;
}
export function editorialWordBudget(limit: unknown, section: WritingSection) {
  const n = recordedWordLimit(limit);
  if (!n) return [];
  const parts = writingSections[section].parts;
  // Leave a small reserve for transitions; this allocation is not a funder rule.
  const available = Math.floor(n * 0.9), base = Math.floor(available / parts.length);
  return parts.map((label, i) => ({label, words: base + (i < available % parts.length ? 1 : 0)}));
}
export type WritingReviewPrompt = {id: string; title: string; detail: string; kind: 'exact' | 'heuristic'};
export type NumericPassage = {text: string; numbers: string[]};
export function numbersToVerify(answer: string): NumericPassage[] {
  // Skip URLs and bracketed unfinished prompts, neither of which is a prose claim.
  const text = answer.replace(/https?:\/\/\S+/giu, '').replace(/\[[^\]]*\]/gu, '');
  const passages = text.split(/(?<=[.!?])\s+|\n+/u).map(s => s.trim()).filter(Boolean);
  return passages.flatMap(text => {
    const numbers = text.match(/(?:[$£€]\s*)?\b\d+(?:[,.]\d+)*(?:\s*%|\b)/gu) ?? [];
    return numbers.length ? [{text: text.length > 260 ? text.slice(0,257) + '…' : text, numbers: [...new Set(numbers)].slice(0,8)}] : [];
  }).slice(0,8);
}
export function reviewDraft({question, answer, wordLimit, section}: {question: string; answer: string; wordLimit?: unknown; section?: WritingSection}) {
  const type = section ?? suggestWritingSection(question), count = words(answer), limit = recordedWordLimit(wordLimit);
  const prompts: WritingReviewPrompt[] = [];
  const add = (id: string, title: string, detail: string, kind: WritingReviewPrompt['kind'] = 'heuristic') => prompts.push({id,title,detail,kind});
  if (!answer.trim()) add('empty', 'Draft is empty', 'Use the editorial outline to plan an answer, then write in the existing draft field.', 'exact');
  const placeholders = [...new Set(answer.match(/\[[^\]\n]{1,500}\]/gu) ?? [])];
  if (placeholders.length) add('placeholders', 'Bracketed text needs review', `${placeholders.length} distinct bracketed passage(s) found. Replace unfinished prompts; keep genuine citations if appropriate.`, 'exact');
  if (limit && count > limit) add('over-limit', 'Over the recorded word limit', `Remove at least ${count-limit} word(s) to meet the recorded ${limit}-word limit. Check the funder’s counting rules.`, 'exact');
  if (!limit) add('unknown-limit', 'Word limit is not recorded', 'Check the actual question for a word, character or page limit. This tool counts whitespace-separated words only.', 'exact');
  if (answer.trim()) {
    const prose = answer.replace(/\[[^\]]*\]/gu, '').replace(/https?:\/\/\S+/giu, '');
    if (['need','outcomes','capacity','summary'].includes(type) && !/https?:\/\/|\b(?:according to|survey|interview|report|data|records?|source|evaluation|observed|feedback)\b/iu.test(answer)) {
      add('evidence', 'Evidence needed?', 'No common source or evidence marker was found. Review factual claims and add the relevant source, date, method or firsthand basis where the question permits. This check can miss valid evidence.');
    }
    if (['plan','outcomes'].includes(type) && !/\b(?:20\d{2}|week|month|year|quarter|phase|milestone|daily|weekly|monthly|january|february|march|april|may|june|july|august|september|october|november|december)\b/iu.test(prose)) {
      add('timeline', 'Review the delivery period', 'No common time marker was found. Does the answer give a realistic period and milestones where the question asks for them?');
    }
    if (type === 'outcomes' && !/\b(?:measur\w*|survey\w*|track\w*|indicator\w*|baseline\w*|assess\w*|interview\w*|observ\w*|evaluat\w*)\b/iu.test(prose)) {
      add('measurement', 'Review how outcomes will be measured', 'No common measurement term was found. Explain the indicator, method, timing and responsible person where relevant.');
    }
    if (type === 'budget' && !/\b(?:per|rate|quantity|quote|unit|hours?|days?|calculation|estimate|cost)\b|\d\s*[x×]\s*\d/iu.test(prose)) {
      add('cost-basis', 'Review the basis of each cost', 'No common calculation or cost-basis term was found. Check quantities, rates, actual quotes and the connection to the activities.');
    }
    if (/\b(?:guarantee(?:d|s)?|everyone|all participants|will eliminate|100\s*%)\b/iu.test(prose)) {
      add('absolute', 'Review absolute claims', 'Check whether absolute or guaranteed language is supportable. Distinguish evidence, targets and assumptions; an intended outcome is not a guaranteed result.');
    }
    const longSentences = prose.split(/[.!?]+/u).filter(s => words(s) > 35).length;
    if (longSentences) add('readability', 'Consider shorter sentences', `${longSentences} passage(s) between sentence punctuation exceed 35 words. Check whether each can be split without losing meaning; this is an editorial suggestion.`);
  }
  return {section:type, words:count, limit, remaining:limit === null ? null : limit-count, placeholders, numbers:numbersToVerify(answer), prompts, humanReviewRequired:true as const};
}
