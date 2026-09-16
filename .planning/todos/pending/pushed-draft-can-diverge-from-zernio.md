# A pushed draft can still be edited or rejected, and its Zernio copy won't follow

**Created:** 2026-09-16 (05-VERIFICATION warning, 05-05 finding 5)
**Priority:** Low until pushes happen for real. Then it is a decision, not a bug
**Where:** `src/runs.tsx`, the Approve screen's "Edit again" and the decision route

## What

Once a draft has a `zernio_post_id`, the Approve screen still offers **Edit again**, and the decision route still accepts a new decision. An edit rewrites `final_body` in D1. A reject marks the draft rejected. Neither touches the draft already sitting in Zernio, and the push route refuses a second push because `zernio_post_id` is set. So after an edit, D1 holds text the executive approved that is **not** what is in Zernio. After a reject, Zernio still holds a draft the executive now says no to.

## Options (the user's call)

1. Lock decisions once pushed: hide Edit/Reject and have the decision route refuse. This is the simplest, and it matches "one click, once".
2. Allow an edit, but clear `zernio_post_id` so a re-push is possible. This creates a second Zernio draft beside the stale one; the 24h content hash only catches identical text.
3. Keep today's behaviour but say it on screen: "Edits here do not change the copy in Zernio."

Nothing is ever published either way. The risk is the executive scheduling the stale copy inside Zernio.
