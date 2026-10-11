# Local grant-writing tools

The application workspace includes a writing coach within each active question editor. It reads the currently edited question, answer, recorded word limit and source link. It never rewrites or saves a draft. Existing version-checked preparation saves remain the only persistence path. Archived drafts are preserved and have no coach controls.

## Editorial help

- Six selectable structures cover a project summary, need and beneficiaries, delivery, outcomes and evaluation, budget justification, and experience/capacity.
- Three styles offer clear/direct, community-centered and research/evidence-led approaches. An automatic structure suggestion uses the question's keywords and is explicitly labeled as a guess; users can choose another.
- Original outlines contain bracketed planning prompts. Preview and Copy are non-mutating: users decide whether and where to paste. Clipboard failure displays a manual-copy alternative. No example application prose is inserted or adapted.
- The optional word allocation is editorial only and leaves roughly 10% of a recorded word limit for transitions. Actual funder limits always control.
- Exact text checks count whitespace-separated words, show over-limit amounts, find empty text and identify bracketed passages for review. Bracketed citations are not declared incomplete automatically.
- Heuristic prompts raise questions about evidence, timeline, measurement, cost basis, absolute claims and readability. They never label a criterion satisfied, verify a fact or predict funding.
- Numbers to verify is a digit-based scan limited to eight passages. It skips URLs and bracketed prompts; it can miss numbers written as words, false claims without numbers and other factual problems. A citation marker does not validate a figure.
- Published criteria come from the existing authenticated, current evidence-backed guidance model. They remain verbatim with provenance and are compared manually. Missing criteria and limits remain unknown.

All coaching is deterministic and local. It does not send private drafts to an AI provider, contact a funder, create a submission or incur service spending. The controls have no form field names and the Copy button is explicitly type=button, so coaching choices cannot become application answers or accidentally submit the preparation form.

## Evidence and reference library

`applicationWritingResources(db, user, applicationId)` checks application/workspace access before reading anything grant-specific. It uses stored evidence only and never fetches resource links. Manual applications retain a safely validated saved-source link; there is no inferred association to an unrelated program.

Program examples require an associated approved official publisher, the latest snapshot for the exact source URL, a fetch date within 90 days, explicit recorded link support, and exact normalized source support for the title, excerpt and context. A funded label additionally requires the title and award marker within the same short passage; a different recipient elsewhere on the page cannot provide provenance. Negative or rejected examples are withheld. Stale, unavailable or uncertain evidence results in an empty state rather than invented examples. Project summaries remain distinct from public samples, whose award outcome is not asserted.

The independent writing library has six link-only resource cards checked on 2026-10-11: NIH/NIAID funded applications and reviewer feedback; NEA historical funded narrative sections; NJIT publisher-labeled successful community applications; NYFA recipient history; NSF award abstracts; and Candid writing guidance. Each includes audience, evidence type, historical scope, a short original learning annotation, limitations and rights guidance. These are not claimed to be matches or examples from the user's chosen grant. Application PDFs are not mirrored, ingested or adapted. Rights and current program instructions remain with the publishers. See `writing-resource-sources.md` for research provenance and verified links.

## Verification

Focused checks: `node --import tsx --test tests/writing-coach.test.ts tests/writing-resources.test.ts` and `pnpm typecheck`.

Tests cover unknown/invalid limits, over-limit arithmetic, placeholders, digit scans, heuristic labeling, all template/style combinations, copy-only rendered controls, exact criterion provenance, resource classifications, stale/mismatched/unsupported evidence, unrelated-recipient regressions, and workspace authorization before example access. Static rendering is not interactive browser QA.

Browser release checks still required in a supported environment:

1. Type into the existing answer, question, source and limit fields and verify coaching updates without losing text.
2. Change structure/style and use Copy; confirm no draft save or replacement occurs. Deny clipboard access and confirm manual-copy fallback.
3. Save, navigate away, return, edit again and test a stale version conflict. Confirm the original draft and source provenance remain intact.
4. Switch applications with client navigation, including a new unsaved question; verify no previous application's local text remains.
5. Check narrow-screen layout, keyboard access to details/selects/Copy, viewer permissions, archived items and source-link navigation.

No migration is needed for the writing coach or resources. The related human-reviewed criterion field belongs to guidance migration 039.
