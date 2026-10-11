import { preparationReadiness } from './writing';

type Preparation = { kind: string; archived_at?: unknown; data: Record<string, unknown> };
type Task = { title?: string; completed_at?: unknown; deleted_at?: unknown };
export type NextAction = { label: string; detail: string; section: string };
/** A recommendation from saved work, never an eligibility or submission decision. */
export function applicationNextAction(application: { stage: string; project_id?: string | null; archived_at?: unknown }, rows: Preparation[] = [], tasks: Task[] = []): NextAction {
  if (application.archived_at) return { label: 'Review archived application', detail: 'Your saved work is preserved. Restore it before continuing.', section: 'overview' };
  if (application.stage === 'submitted') return { label: 'Track the funder’s response', detail: 'You recorded this as submitted. Keep the confirmation and any follow-up dates in your notes.', section: 'notes' };
  if (['awarded', 'declined', 'withdrawn'].includes(application.stage)) return { label: 'Review the recorded outcome', detail: 'Add any reporting, feedback or close-out tasks that apply.', section: 'tasks' };
  if (!application.project_id) return { label: 'Connect your project', detail: 'Choose the project this application will support.', section: 'preparation' };
  const ready = preparationReadiness(rows, tasks);
  if (!ready.eligibilityCount) return { label: 'Check the official requirements', detail: 'No eligibility requirements are recorded yet. Unknown requirements do not mean you qualify.', section: 'how-to-apply' };
  if (ready.unresolvedEligibility) return { label: 'Resolve eligibility checks', detail: `${ready.unresolvedEligibility} recorded requirement(s) still need your assessment or confirmation from the funder.`, section: 'eligibility' };
  const open = tasks.find(task => !task.deleted_at && !task.completed_at);
  if (open) return { label: open.title || 'Complete your next task', detail: 'This task is still open in your application workspace.', section: 'tasks' };
  if (ready.overLimitDrafts) return { label: 'Shorten over-limit drafts', detail: `${ready.overLimitDrafts} draft(s) exceed a recorded funder word limit.`, section: 'question' };
  if (ready.missingDrafts) return { label: 'Finish your working drafts', detail: `${ready.missingDrafts} draft(s) are empty or still contain bracketed prompts.`, section: 'question' };
  return { label: 'Review against the official application', detail: 'Confirm current questions, documents, eligibility and deadline on the funder’s site. Nothing is submitted here; record submission only after completing the funder’s required process.', section: 'how-to-apply' };
}
