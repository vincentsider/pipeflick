# Cap what one account can spend on the operator's OpenAI key

**Raised:** 2026-09-16, out of the Phase 6 registration decision
**Priority:** Medium — becomes High the moment a second account exists

## The gap

Vincent chose the invite list for Phase 6 with a specific reason: *"i don't want people to use
my openai account / api freely."*

The invite list answers **who registers**. It does not answer **how much an invited account
spends**. Once someone is on the Access list, nothing in the app stops them starting runs back
to back, and every run is a real charge on the operator's OpenAI key — **$0.097 measured on
production run 1**, six calls.

So after Phase 6 the position is: uninvited strangers cannot spend anything (good, and fully
closed), but one invited person having a bad afternoon can spend without limit. With two or
three trusted pilot users that is probably fine. It stops being fine the moment the invite list
grows or an account is shared.

Nothing here is a Phase 6 defect. Phase 6 does exactly what it says. This is the part its
decision deliberately left open, written down so it is a choice rather than an oversight.

## Options, cheapest first

1. **A run cap per account per period.** A count of runs started in the last 7 days, checked in
   `POST /runs` before `createRun`. Roughly one D1 read and one comparison. Cheap, and it is
   the operator's own dial.
2. **A spend figure rather than a run count.** `usage_json` already stores input/output/reasoning
   tokens per job (03-02), so real cost per account is computable today without new columns —
   it is only unaggregated. More honest than counting runs, since runs vary.
3. **Per-account OpenAI keys.** The same move Phase 6 makes for Fireflies and Zernio, and
   `src/credentials.ts` from 06-03 would already do the sealing. Removes the operator's exposure
   entirely, but changes the product: users then need their own OpenAI account, which is a real
   barrier for the executives this is aimed at.

Recommended: (1) as a guard rail, then (2) once there is enough data to set the number from
evidence rather than a guess. (3) only if Pipeflick stops being a service the operator runs for
people and becomes something they run themselves.

## Why not now

Phase 6 is already six plans and reverses two Phase 1 decisions. Adding a metering concern to
it would blur what the phase is for, and the cap's number should be set from observed usage
rather than invented before there is any. Revisit when the invite list passes about three
accounts, or the first time a monthly OpenAI bill is surprising.

## Related

- `.planning/phases/06-accounts/DISCOVERY.md` Q1 — where the decision and this gap are recorded
- 03-04 SUMMARY — the $0.097 per-run measurement
- `src/db.ts` `usage_json` on the outlier and draft job rows — the data option (2) would read
