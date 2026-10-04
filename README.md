# LoadFactor

A responsive athletic performance dashboard built with Next.js App Router, TypeScript, Tailwind CSS 4, Recharts, and Zod.

## Run locally

LoadFactor can be installed as a web app on phones and computers. The **Install LoadFactor** button opens the browser installer when available, or shows instructions for adding the app to the home screen or desktop. The button hides when running in an installed app window. Serve over HTTPS (localhost also works). Installation does not connect Firebase users to cloud workout storage; existing browser-local storage limitations still apply.

Install Node.js 22.13 or newer, then:

```sh
npm install
npm run dev
```

Open http://localhost:3000. On this workspace, a portable Node runtime is also available in .tools; run ./dev.ps1 from PowerShell to use it without changing your system PATH.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:accounts
```

## Project structure

```text
src/
  app/
    api/sessions/route.ts      Validated mock POST endpoint
    globals.css               Responsive dark design + Tailwind
    layout.tsx                Metadata and root layout
    page.tsx                  Server-rendered demo seed
  components/
    dashboard.tsx             Metrics, history, units, browser storage, export
    performance-charts.tsx    Interactive Recharts line/bar charts
    session-logger.tsx         Local form state, sets, RPE, submission
  lib/
    types.ts                  User, WorkoutSession, ExerciseLog, PerformanceMetric
    exercises.ts              Typed catalog and demo user
    analytics.ts              Unit conversion, Monday weeks, PRs and chart data
    sessions.ts               Record construction and canonical calculations
    validation.ts             Shared client/server Zod schema
    mock-data.ts              Rolling 48-day demo training history
    core.test.ts              Calculation and validation regression tests
```

## Behavior

- The workspace is split into direct pages: `/overview`, `/logger`, `/history`, `/coaching`, `/wellness`, `/planning`, `/tests`, `/strength`, and `/settings`. The sidebar links to each page; section routes work when opened directly or refreshed, and browser back/forward updates the active section. `/` opens the overview.

- Demo history is generated relative to the current server date.
- Dashboard shows all-time vertical jump and 10m fly PRs, current Monday–Sunday volume, and mean set RPE for that week.
- Charts switch between 14, 30, and 60 days. Jump points represent the daily best. Weekly bars include zero-volume weeks; first/last bars can represent partial weeks within the selected window.
- Log strength, jump, and sprint sets with contextual measurement inputs, load, reps, and RPE (1–10).
- Weight is stored in kg and jump height in cm; display preferences support kg/lbs and in/cm. Session logging has independent unit selectors which convert existing values.
- Volume equals the sum of weight × reps for all sets, including loaded jumps. Unweighted sets contribute zero.
- POST /api/sessions validates the payload, constructs IDs and metrics, and recalculates totals on the server. Unknown exercises, missing contextual measurements, future/invalid dates, and out-of-range values are rejected.
- Successful submissions update the dashboard and persist user-created sessions in localStorage. Refresh preserves these records. Export downloads the full current dataset as JSON.
- Average fatigue is reported RPE, not a medical readiness assessment. No readiness thresholds are inferred.

## Mock API

```sh
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title":"Power session","date":"2026-10-03","notes":"","exercises":[{"exerciseId":"trap-bar-deadlift","weightKg":100,"reps":5,"jumpHeightCm":null,"splitTimeSeconds":null,"rpe":8}]}'
```

Use a past or current date. Response: HTTP 201 with `{ session, metrics }`. Validation failures return HTTP 422; malformed JSON returns 400. The server does not trust client-supplied volume, RPE averages, user IDs, or metric records.

## Persistence and production

The unsigned workspace remains a browser-local demo. Athlete accounts use a SQLite database and server-owned records. The Node server needs a persistent writable directory (default .data) and must be reachable from each device for sync. Configure APP_ORIGIN to your public HTTPS origin behind a proxy. Keep the database and backup directory on persistent storage; ephemeral/serverless filesystems are unsupported. No email service is required: password recovery uses a private recovery code issued once at registration and rotated on each reset.

## Phase 1 logging features

- Training history includes edit, duplicate, and delete actions for all sessions. Delete exposes an undo action for the most recent deletion during the current visit.
- Edits replace the existing record and recalculate its totals and metrics. Duplicating opens an editable copy dated today.
- Save complete workouts as named templates, load them for a new session, and remove templates. Save or discard a draft before loading a template.
- Create custom strength, jump, or sprint exercises. Search filters exercise choices while retaining the selected exercise. Custom jumps and sprints require their contextual measurements and do not count toward standard test PRs.
- Move individual sets or entire exercise groups. Group moves keep the sets within each exercise in their original order.
- Unfinished drafts autosave locally, including input units and edit identity. Refresh restores the draft; Close retains it, while Discard draft removes it. Save clears the draft only after a successful API response.
- Configure a 5-3600 second rest timer, start/restart it, and stop it. The countdown uses elapsed wall time and announces completion. Timers do not survive refresh.
- Each set shows results from the most recent session for that exercise on or before the selected date, in the selected logging units.
- Workspace changes, templates, and custom exercises are browser-local. Existing v1 session storage is read automatically when no v2 workspace exists. Browser storage failures show a warning; JSON export includes the current session dataset and its custom exercise definitions.

## Phase 2 accounts and storage

1. Create an athlete account under **Account & data** using an email, a password of at least 12 characters, your name, sport, and IANA timezone.
2. Download and privately save the recovery code before continuing. **Recover password** uses your email and that code, invalidates every existing sign-in, and issues a replacement code. Email delivery and email verification are not configured.
3. Sign in on another device connected to the same server. Workouts refresh every 15 seconds and on window focus. Templates and custom exercises are saved to the account and loaded on sign-in/page refresh. Drafts remain device-local and are separated by account.
4. Edit your profile, timezone, and permanent unit preferences in **Account & data**. The athlete timezone determines today's date, future-date validation, and the current training week.
5. Use **Import saved browser sessions** to copy the old v1/v2 local sessions into your account. It validates each record, imports in batches of 50, recomputes metrics and ownership, and skips previously imported records, including after snapshot restoration. Local originals stay intact; demo seed history is not imported unless you previously edited and saved it.
6. Download account data as JSON, including profile, workouts, deleted records retained for undo, templates, custom exercises, and backup metadata. Password hashes, recovery hashes, and login tokens are excluded.
7. Automatic recovery snapshots are created on the first workspace access or mutation of each UTC day. The latest 14 snapshots are kept per account. Create a snapshot manually before larger changes. Restore replaces account workouts and logger assets transactionally and first snapshots the current data. Snapshots reside beside the database, so use host-level backups of the persistent directory for disk-loss recovery; copy the directory with the app stopped.
8. Delete an account by supplying the current password and typing DELETE. Account deletion removes workouts, assets, login sessions, and the account's recoverable snapshots. Downloaded exports and the original unsigned browser demo are separate copies.

Configuration is documented in .env.example. The included portable Node 22.23.3 runtime supports node:sqlite; Node 22.13+ is required. SQLite currently emits an experimental API warning on Node 22. Account routes use HTTP-only SameSite=Strict cookies, hashed random login tokens, salted scrypt password hashes, origin checks, size-limited JSON requests, and persistent credential-attempt limits. HTTPS cookies are enabled when APP_ORIGIN uses HTTPS. Workouts and assets are scoped by the authenticated account, and session/metric records are recalculated on the server. The shared server uses one local SQLite database; this implementation does not replicate between multiple application servers.

On serverless hosts, anonymous demo pages and account-status checks do not initialize SQLite. Authenticated account features still require writable persistent storage and therefore are not production-ready on Vercel; use a persistent Node host or complete the migration of the account API and coaching data to a managed database before enabling sign-in there.

## Firebase web app setup

The Firebase web SDK is initialized in `src/lib/firebase/client.ts` for project `loadfactor-c2e73`. Firebase Analytics is initialized only in supported browsers. The Firebase web configuration, including its API key, is public client configuration and must be protected with Firebase Authentication settings, Firestore Security Rules, and API restrictions where applicable; it is not a server credential. Firebase Authentication and Firestore are not yet used by the account API: account authentication and records still use the SQLite server described above. Before switching those services or deploying to App Hosting, enable Email/Password sign-in and create Firestore in the Firebase Console, then complete the server-side authentication and data migration work.

The public root page presents the app, Firebase email/password sign-in and registration, and a Google sign-in button. Enable **Authentication → Sign-in method → Email/Password** and **Google**, and add the deployed host to **Authorized domains** in the Firebase Console. Google sign-in automatically creates a Firebase account on first use. Authenticated Firebase users are redirected to the dashboard pages; signing out returns them to the public page. Workout changes remain browser-local for these Firebase users until the Firestore migration is implemented. Do not treat Firebase sign-in as server authorization for account APIs: those still use the separate SQLite account system.

## Phase 3 training history

- Switch history between list and a Monday-first calendar. Move between months or select a month directly; choose a calendar day to show its matching sessions. Search and filters apply together to both views, and date-range endpoints are inclusive.
- Search session titles and notes; filter by exercise, strength/jump/sprint category, date range, and tag. Mixed sessions match each category they contain. Custom exercise categories are supported. Clear filters resets the query and selected day.
- Open a session title for a dedicated detail page containing all sets, measurements, notes, tags, and totals. Account detail pages enforce ownership and exclude deleted records. Unsigned detail pages load browser-local records and demo history.
- Select two sessions to see their complete set logs side by side and differences in volume, sets, repetitions, mean set RPE, best standard vertical jump, and best 10m fly. Selection persists across filters so you can compare different periods. Missing benchmarks display a dash. Custom tests and shuttle splits do not count as standard 10m fly benchmarks.
- Add up to 10 comma-separated session tags of at most 24 characters in the logger. Tags are trimmed, lowercased, and deduplicated, and persist through drafts, templates, edits, migration, backup, and export.
- Monthly summaries show all sessions in the chosen month, distinct training days, set count, volume, and set-weighted mean RPE. Their scope is independent of search filters and stated above the summary.
- Save up to 20 named filter combinations, load them, and remove them. Unsigned presets use local browser storage; account presets use a separate database table and are available after opening the account on another device. They are included in account exports and snapshots and removed with the account. Existing sessions, drafts, templates, and snapshots remain compatible.

## Phase 4 strength tracking

- The Strength section provides per-exercise estimated 1RM trends and volume charts over 30, 90, 180, or 365 days. Estimates use external load x (1 + reps / 30) for 2-10 completed reps; single-rep sets use the actual logged load. Only working strength sets with positive load qualify. These estimates do not infer repetitions in reserve or represent tested maximums. The Epley-style model is described in [STMr's formula documentation](https://mladenjovanovic.github.io/STMr/reference/max_perc_1RM.html).
- Rep records show the highest external load at each exact logged rep count, excluding warm-ups and drop stages. Exercise identities stay separate when substitutions are used. Volume charts split working/drop volume from warm-up volume; total dashboard volume and mean RPE continue to include every set.
- Record optional bodyweight in the logger, in the selected logging units. The value is saved in kg with the session, used for estimated strength divided by bodyweight, and shown in session details. Changing logging weight units converts bodyweight as well as set loads. An optional default bodyweight can be saved in the account profile (kg); new and duplicate sessions use that default, edits preserve the historical value, and templates use the current default rather than copying an old measurement. Missing bodyweight produces no ratio; external load is not combined with bodyweight for unweighted exercises.
- Open Strength set details in a logger row to classify it as working, warm-up, or a drop stage; enter a superset label, drop group, tempo, and additional pause. Supersets require at least two different strength exercises with the same label. Group names are normalized to uppercase.
- Add drop stage creates the next row with the same exercise and group at 20% less load. Adjust the generated load and reps to match what you performed. Each drop stage must follow a heavier set of the same exercise in its group; changing row order, removing an anchor, or changing the exercise can require fixing the group before saving. Each stage retains its own load, reps, RPE, and volume.
- Tempo uses four stages (lowering, bottom pause, lifting, top pause), such as 3-1-X-0. Stages accept 0-30 seconds or X; X marks an explosive stage. Additional pause accepts 0-60 seconds. These fields describe logged technique and do not estimate time under tension. Strength-only fields are rejected for jumps and sprints.
- Weekly muscle-group counts use Monday-based weeks and exclude warm-ups. Working sets and drop stages are shown separately. A set counts once for every assigned muscle group, so counts overlap. Default assignments for the built-in strength exercises can be edited; custom exercises without assignments are shown as unassigned. Current assignments apply to historical weeks.
- In Strength, save muscle assignments and up to 10 exercise alternatives for each exercise. The logger suggests only those saved alternatives and clears the old external load when substituting. Save changes before using them in the logger. Guest settings persist locally; account settings use a separate authenticated table and are included in exports, backup restoration, and account deletion.
- Session details and comparisons show set classifications, groups, tempo, and pauses. Existing records, drafts, templates, and snapshots default to working sets with empty detail fields and no inferred bodyweight.


## Phase 5: jump and sprint analysis

The Jump & sprint section shows all-time best and mean results and per-session attempt charts, with an accessible results table and population coefficient of variation (CV). Every logged row is one measured trial, regardless of reps. Tests are grouped by exercise identity, jump category (countermovement, squat, depth, vertical or broad), standing/approach takeoff, both/left/right leg, sprint distance, and exact trimmed protocol notes. Matching notes help organize comparable tests; unknown protocols do not establish comparable conditions.

The logger supports broad jump distance in the selected cm/in units, configurable sprint distances in metres, and up to 20 cumulative splits entered as metres:seconds (e.g. 10:1.8, 20:3.2). Splits must increase in both distance and elapsed time and remain within the total. A finish split must match total time. Overall speed is distance / total time; segment speed is change in distance / change in cumulative time, in m/s. Add surface, footwear, device, start, arm swing, measurement method and rest to protocol notes. Templates, drafts, edits, duplication, account storage, exports and backups preserve these details.

Existing jump records default to their named category, standing takeoff and both legs. The named 10 m fly sprint retains its known distance; legacy shuttle and custom sprint distances remain unknown until edited. Broad jumps do not count as vertical jumps, and alternate jump variants or sprint distances do not replace legacy dashboard PRs.

## Phase 6: scheduling, training blocks and goals

Open **Schedule & goals** to assign saved workout templates to dates, navigate Monday-first weeks, or generate multiweek blocks on selected weekdays. Templates must first be saved in the logger. A schedule snapshots its template targets, so later template edits do not rewrite scheduled workouts. Edit targets to add/remove sets and change repetitions, loads and RPE, or reschedule a missed workout while preserving its original date and block.

Blocks support keeping targets, adding a chosen amount of load or reps each training week, and recurring deloads with a chosen load reduction. Rules apply to strength sets only; jumps and sprint measurements remain unchanged. Progression is calendar-based and does not infer readiness from completed workouts. Deload weeks do not advance progression for the following week. Targets are bounded by existing logging limits. Review targets before training. Marking an individual workout as a deload labels it; adjust its targets manually. Block creation applies the chosen reduction automatically.

Start a scheduled workout on its date or after it is missed to load its targets into the logger, with today's completion date and current bodyweight default. Record what you actually performed before saving. The schedule becomes completed only after a linked workout is saved. You can also explicitly link an existing unlinked session or unlink a completion. Comparisons show planned versus completed set counts, repetitions, volume, and per-set load/RPE. A schedule accepts one active completed workout; deleting that workout makes it pending or missed again. Unlink completion before removing its schedule.

Goals track workout counts, accumulated volume, best working load at a minimum rep count, or estimated 1RM for a selected exercise. Progress recomputes from active workouts inside the goal date range, with baseline-to-target percentage capped at 0-100. Load and estimated 1RM goals exclude warm-ups and drop stages; volume includes all sets. Account schedules, blocks and goals use a separate database table, are included in exports and backups, and are removed on account deletion. Guest planning uses browser storage and is included in dashboard exports. Existing workouts, templates and snapshots default to no planning links or planning data.

## Phase 7: wellness, bodyweight and session load

Open **Wellness** for daily check-ins with sleep duration (0-24 hours), sleep quality, overall and regional muscle soreness, stress, mood, measured bodyweight, and notes. Each date has one editable check-in; reports can also be removed. All fields are optional, but a check-in needs at least one field. Ratings use 1-5: higher quality/mood is better, while higher soreness/stress means more soreness/stress. Regional soreness uses the same scale as overall soreness. Blank ratings remain unrecorded. Check-in dates use the account timezone and cannot be in the future.

The logger accepts optional session duration in minutes and overall session RPE (0-10, including fractional ratings). Session RPE stays separate from individual set RPE and their mean. Session load is duration multiplied by session RPE, expressed in arbitrary units (AU). Both values are required to calculate load; zero session RPE produces a recorded zero load. The server recomputes load and ignores supplied totals. Existing workouts default to unrecorded duration, session RPE and session load. Edits preserve these fields; templates, duplicated workouts and scheduled workout starts clear actual duration and session RPE so they can be reported for the new session. Drafts retain unfinished reports.

Bodyweight history uses daily check-in measurements first and the latest recorded workout bodyweight on dates without a daily measurement. kg/lbs display conversion preserves stored kilograms. Daily bodyweight does not rewrite profile defaults or historical workout snapshots.

Comparison charts align same-date wellness with daily training volume, daily session load, selected-exercise estimated 1RM, or a selected comparable jump/sprint test. Tests remain separate by category, takeoff, leg, distance and protocol. Missing data creates chart gaps. Daily load includes only workouts with both duration and session RPE; tables show coverage against the day's completed session count. Charts show observations for comparison, with timing and other factors affecting outcomes. Bodyweight and comparison charts have accessible data tables.

Account check-ins use their own database table, are scoped to the signed-in athlete, are included in workspace exports and backups, and are deleted with the account. Guest check-ins use browser storage and are included in dashboard exports. Earlier snapshots remain restorable without wellness or session-level effort fields.

## Phase 8: coaches, teams and sharing

- Create either an athlete or coach account under **Account & data**. Coach accounts can create teams and invite athlete accounts by email. Invitations are seven-day, single-use codes bound to the invited email; share the code with the athlete privately. Athletes verify a code to see the coach and team before choosing permissions and accepting.
- Athletes control each coach connection's access to workouts and session notes, wellness and bodyweight check-ins, plans and goals, plan assignment, and session feedback. New connections start with every permission off. Change permissions or disconnect a coach at any time; disconnecting removes team memberships and access but leaves assigned plans in the athlete's schedule.
- Coaches manage team rosters, share snapshots of their saved workout templates, and assign those templates as scheduled training plans to selected team members. Assignment requires each athlete's explicit plan-assignment permission. Athletes can review and edit assigned workouts in **Schedule & goals**.
- The team completion dashboard counts only plans assigned by that coach to that team. It reports scheduled, completed, missed, and upcoming workouts for a selected date range, and shows no completion details unless the athlete grants both workout and planning access.
- Coaches can comment on accessible workout sessions. Athletes can reply in the same thread from the session detail in **Training history**; workout and feedback permissions are both required. Feedback is scoped to the athlete, coach, and workout.
- Athletes can publish a date-bounded snapshot report with an expiry of 1-90 days. It includes the athlete's name, training totals, strength summaries, jump/sprint results, and daily training totals; it excludes workout and protocol notes, wellness, bodyweight, and feedback. Anyone with the link can view the snapshot until it expires or the athlete revokes it. The access token is shown only at creation and stored only as a hash; revocation blocks future access but cannot recall copies already downloaded by recipients.

## Phase 9: offline, exports and integrations

- LoadFactor is installable from its web manifest. The service worker caches only the static offline logger and app assets; authenticated pages and API responses are never cached. With the app offline, navigation falls back to a quick single-set logger for strength, jump, or sprint sessions. Sessions logged in the full app while a request is offline retain all supported sets and details. Queued sessions are held in this browser's IndexedDB and sync when the app is reopened online under the same account.
- The sync endpoint is idempotent for queued client session IDs. If a queued ID collides with a different server workout, the dashboard pauses that item and offers **Keep server version** or **Replace with offline version**; it does not silently overwrite the server record. Offline video uploads and edits to existing sessions are not supported.
- **Schedule & goals** can export scheduled workouts as an `.ics` calendar file. Enable browser reminders and choose a time to receive notifications for scheduled workouts. Notification permission is required, and reminders only run while LoadFactor is open in that browser; they are not server push notifications.
- **CSV session import & export** exports a CSV with one row per session and a `session_json` column that preserves all validated set details. Import shows a row-by-row validation preview before saving valid rows. Imports use the session logger's validation rules and may partially complete if a server error occurs partway through; the UI reports how many rows were saved.
- Shared progress reports can be printed or saved as PDF from the report page using the browser's print dialog. PDF generation is browser-side.
- Attach a technique video to an exercise set by adding an HTTPS link in the logger. Session details show the link. Videos remain hosted at the linked provider; LoadFactor does not upload video files.
- Authorized integrations use manually created, athlete-managed bearer tokens. Create read and/or write tokens in **Account & data → Authorized integrations & API tokens**, copy the secret when shown, and revoke it when no longer needed. The server stores only a token hash. Do not embed tokens in websites, mobile apps, or public repositories.

The API reference is available at `GET /api/openapi` (OpenAPI 3.1 JSON). API base path: `/api/v1`.

```sh
curl https://your-loadfactor.example/api/v1/sessions \
  -H "Authorization: Bearer lf_your_private_token"

curl -X POST https://your-loadfactor.example/api/v1/sessions \
  -H "Authorization: Bearer lf_your_private_token" \
  -H "Content-Type: application/json" \
  -d '{"title":"Integration workout","date":"2026-10-03","notes":"","exercises":[{"exerciseId":"trap-bar-deadlift","weightKg":100,"reps":5,"jumpHeightCm":null,"splitTimeSeconds":null,"rpe":8}]}'
```

`GET /api/v1/sessions` requires the `read` scope and returns `{ "sessions": [...] }`. `POST /api/v1/sessions` requires `write`, accepts the same validated session payload as the app, and returns `{ "session": ..., "metrics": [...] }` with HTTP 201. The server checks account ownership and timezone-aware dates and recomputes totals. Invalid payloads return HTTP 422; missing/invalid tokens return 401; missing scopes return 403. The API is private to the token owner and does not provide cross-origin browser access.
