# Run screen: a failed draft's error message is shown nowhere

**Created:** 2026-09-16 (05-05 execution, findings 1 and 2)
**Priority:** Medium-high. DRAFT-05 ("a clear error if generation fails") is marked Complete, and on the live screens it no longer holds for a failed draft step
**Where:** `src/runs.tsx`, the stop notice on `GET /runs/:id`

## What

`b954dc5` (Broadsheet Run/Approve screens) removed `<DraftSection>` from the Run screen. It was also the only renderer of a failed **draft** job's `error_message`, as well as of push state. 05-05 fixed the push half (gap 1) and removed the dead components. It deliberately left this half alone, because its Task 2 required both screens' behaviour to stay unchanged.

Observed locally in 05-05 with a seeded run:
- A failed outlier's message still renders, in the Templates card.
- A failed draft's message (`invalid_api_key`, with a marker) renders on **neither** `/runs/:id` nor `/runs/:id/approve`.
- The stop notice shows only the code, then says "The message is beside the step below". That is false for a draft.

Also stale: "All N steps are done; the drafts are below." The drafts are on the Approve screen.

## Fix

Render the stopping job's message inside the stop notice itself, instead of pointing somewhere else. It is already scrubbed (`scrubKey`) and capped at `MAX_ERROR_MESSAGE` when written. Then reword the "drafts are below" line to link to `/runs/:id/approve`. Verify by content with a seeded failed draft job, as 05-05 did.

## Context

The same failure as 05-VERIFICATION gap 1: a screen rebuild dropped the only component that rendered an error column, and `tsc` stayed silent because `tsconfig` has no `noUnusedLocals`. Any future screen rewrite should grep for every `error_*` / `zernio_error_*` column reader before and after.
