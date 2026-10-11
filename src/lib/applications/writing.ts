import {words} from './preparation-values';

/** Deliberately local templates: every factual value comes from a saved project. */
export type WritingProject = {
  name?: string | null;
  description?: string | null;
  context?: Record<string, unknown> | null;
};
const fact = (value: unknown, prompt: string) =>
  typeof value === 'string' && value.trim() ? value.trim() : `[${prompt}]`;
export const starterHistoryEvent = 'Project draft starters created';
export function projectDraftStarters(project: WritingProject) {
  const c = project.context ?? {};
  return [
    {
      starter_key: 'project_summary',
      question: 'Draft starter: project summary',
      answer: `Project: ${fact(project.name, 'Add your project name')}\n\n${fact(project.description, 'Describe your project in your own words')}\n\nService area: ${fact(c.service_area, 'Describe where the project will operate')}\n\nIntended outcomes: ${fact(c.intended_outcomes, 'Describe the changes you aim to achieve')}`,
    },
    {
      starter_key: 'need_beneficiaries',
      question: 'Draft starter: need and beneficiaries',
      answer: `Beneficiaries: ${fact(c.beneficiaries, 'Describe who the project will serve')}\n\n[Explain the need this project addresses using facts you can support]\n\nEvidence: ${fact(c.evidence, 'Add supporting evidence; do not invent statistics')}\n\nEvidence source: ${fact(c.evidence_url, 'Add a source for your evidence')}`,
    },
    {
      starter_key: 'plan_outcomes',
      question: 'Draft starter: plan and outcomes',
      answer: `Planned activities: ${fact(c.activities, 'Describe what you will do')}\n\nIntended outcomes: ${fact(c.intended_outcomes, 'Describe the changes you aim to achieve')}\n\n[Add a delivery timeline and responsible people]\n\n[Explain how you will measure progress]\n\n[Prepare and check a budget using actual costs]`,
    },
  ].map(row => ({...row, word_limit: null, source_url: ''}));
}

type PreparationRow = {kind: string; archived_at?: unknown; data: Record<string, unknown>};
type ReadinessTask = {completed_at?: unknown; deleted_at?: unknown};
export function preparationReadiness(rows: PreparationRow[], tasks?: ReadinessTask[]) {
  const active = rows.filter(row => !row.archived_at);
  const eligibility = active.filter(row => row.kind === 'eligibility');
  const questions = active.filter(row => row.kind === 'question');
  const unfinished = (answer: unknown) => typeof answer !== 'string' || !answer.trim() || /\[[^\]]+\]/u.test(answer);
  return {
    eligibilityCount: eligibility.length,
    unresolvedEligibility: eligibility.filter(row => row.data.status !== 'meets').length,
    questionCount: questions.length,
    missingDrafts: questions.filter(row => unfinished(row.data.answer)).length,
    overLimitDrafts: questions.filter(row => typeof row.data.answer === 'string' && typeof row.data.word_limit === 'number' && words(row.data.answer) > row.data.word_limit).length,
    openTasks: tasks ? tasks.filter(task => !task.deleted_at && !task.completed_at).length : null,
    finalFunderReviewRequired: true as const,
  };
}
