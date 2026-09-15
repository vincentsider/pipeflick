# Narrow the transcript prop on the Fireflies import preview

**Created:** 2026-09-15 (Phase 2 verification, info-only finding)
**Priority:** Low — no leak today, hardening only
**Where:** `src/fireflies-routes.tsx` (import preview render, around line 262)

## What

The preview page passes the full `FetchedTranscript` into a prop typed `Meeting`. `FetchedTranscript` carries the `sentences` array, so the object handed to the component holds every speaker's text even though the component's type only admits the meeting fields and only those are rendered.

## Why it matters

Nothing leaks now: `hono/jsx` server-renders and never serialises props to the client, and the component reads only the `Meeting` fields. It is a latent footgun rather than a defect. Any future change that serialises props, logs the object, or widens the component would silently expose other speakers' text, which is the one thing the Phase 2 compliance design exists to prevent.

## Fix

Narrow at the call site: build the `Meeting`-shaped object explicitly (`{ id, title, dateIso, durationMinutes }`) instead of passing the fetched transcript whole. One-line change, no behaviour difference.

## Context

Found by the Phase 2 verifier, recorded rather than fixed so the verified code and the verification report stay in step. Pick it up in any Phase 3 plan that touches `fireflies-routes.tsx`.
