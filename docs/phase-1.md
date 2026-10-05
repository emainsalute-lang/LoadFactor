# Athlete performance: Phase 1

The existing Next.js app, Firebase sign-in, SQLite server account API, logger, planning, session history, strength charts and jump/sprint analysis are retained.

## New features

- Settings: full athlete profile and sport/goal personalization.
- `/performance/testing`: standard and custom measured tests, protocols, history, progress graphs, latest result, best, previous difference and baseline improvement.
- `/performance/records`: recalculated records from tests and recorded workout attempts. Faster times improve sprint records; bodyweight is tracked without PRs. Warmups are excluded from strength records; different rep/tempo/pause protocols remain separate.
- `/recovery`: one complete 1–10 check-in per day, editable by date, score breakdown, history and trends. Existing optional 1–5 wellness entries remain separate and are not silently converted into readiness scores.
- Overview: current readiness, real session-RPE load, rolling 7-day/previous 7-day summaries, 28-day load and recovery trends, missing-load counts, recent sessions/records, upcoming workout and recommendations.

## Persistence and security

New records use Firestore under `athletes/{authenticated UID}/profile/main`, `tests/{test ID}` and `readiness/{date}`. The Firebase SDK attaches authentication; the rules require `request.auth.uid` to match both the path and stored `userId`. Coaches receive no access in this phase. Client-supplied user IDs never grant access. Values are validated with Zod before writes and on reads; rules enforce ownership, fields, ranges and types. Scores and records are derived, not stored as editable totals.

Workouts and planning for Firebase users still use their existing account-scoped browser storage. This phase does not silently migrate browser workouts or link the separate SQLite account to a Firebase UID. Keep using the same browser for those sessions. Optional legacy wellness browser records are now account-scoped; unscoped records are not automatically attributed to a signed-in athlete.

## Firebase setup

Enable the project's Firestore database if not already enabled. Review `firestore.rules` against any existing deployed rules before deploying: this repository did not previously contain Firestore rules. It grants only the new athlete paths, and cannot preserve unknown rules from the live project automatically.

Deploy the reviewed rules with the installed Firebase CLI:

```powershell
firebase deploy --only firestore:rules --project loadfactor-c2e73
```

Deploying the app to Vercel does **not** deploy Firestore rules. Cloud forms remain disabled if their initial data cannot be read, rather than overwriting unknown existing data. Firestore permission failures are displayed explicitly.

For an integration check, use two test accounts: save a profile/test/check-in under account A; verify A can reload it, and verify reads and writes to A's paths are denied from B and from a signed-out client. Verify changing accounts clears the previous workspace, and that deleting a test recalculates its PRs. No changes to a live project are made by the local test suite.

`node scripts/check-athlete-rules.cjs` runs mocked ownership, write validation and signed-out checks through the Firebase Rules test endpoint without deploying rules or writing documents. It requires a signed-in Firebase CLI. Set `FIREBASE_TOOLS_LIB` to the CLI's `lib` directory if it is installed outside the local portable tool directory.

## Score interpretation

Readiness is the rounded mean of six equally weighted factors: sleep duration capped at 8 hours, sleep quality, energy, inverse soreness, inverse stress and motivation. Ratings map 1–10 to 0–100. Bands: 80–100 ready, 60–79 moderate, 40–59 fatigued, 0–39 recovery recommended. It is a training reflection, not medical advice.

Load is duration × overall session RPE, independent of set RPE. Unmeasured sessions stay missing; partial totals are labelled. Rest days have zero recorded load. Recommendations use today's check-in; a stable-load message requires complete measurements and rolling load within 15% of the previous period. No injury predictions are made.

The proprietary LoadFactor Score, basketball features, broader analytics, programs and achievements remain in Phases 2 and 3, as requested.
