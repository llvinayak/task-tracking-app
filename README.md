# task-tracking-app

Mobile client (Expo / React Native) for the TaskTracking system. It uses the same
`task-tracking-api` as the web app (`task-tracking-admin`) and mirrors its rules:
same endpoints, same permission model, same status and ticket rules.

Status: Milestone 4 complete in code and automated tests. It has NOT yet been run on
a device against a test API (see "Not built / not verified" and the device checklist).

## Setup

Requirements
- Node >= 20.19.4 (this is the `engines` value of React Native 0.81 and Metro, checked in
  `node_modules`). The app was developed and tested on Node 21.3.0, which npm reports as
  unsupported for several transitive packages (they list `^20.19 || ^22.13 || >=24`, i.e. they
  skip odd-numbered Node 21). Prefer Node 22 LTS (22.13 or newer) for EAS builds and CI. I could
  not find a single Expo SDK 54 package that declares `^22.13`; that range comes from the
  transitive tooling above, so treat "22.13+" as the safe choice rather than a hard rule.
- npm (a `package-lock.json` is committed; do not mix in yarn or pnpm).
- Expo Go or a development build on a device, or an Android emulator / iOS simulator.
- A reachable `task-tracking-api` (use a TEST instance, never production data).

Steps
1. `npm install`
2. Copy `.env.example` to `.env` and set the variables below.
3. `npm start` (then press `a` for Android, `i` for iOS, or scan the QR code).

## Environment variables (`.env.example`)

Only `EXPO_PUBLIC_*` variables reach the app, and they are PUBLIC (they end up in the
JavaScript bundle). Never put secrets in them.

| Variable | Required | Meaning |
| --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | yes | API base URL including `/api`, e.g. `https://host/api`. Non-development builds REQUIRE `https://`; `http://` is accepted only in development. A physical device cannot use `localhost`: use the computer's LAN IP, a tunnel or a hosted URL (Android emulator: `10.0.2.2`). |
| `EXPO_PUBLIC_HEALTH_URL` | no | Full URL of the server's `GET /health`, used only for the online/offline check. Default: `<origin of the API URL>/health`. Set it if the API sits behind a reverse-proxy path prefix (API at `https://host/tt/api`, health at `https://host/tt/health`). https required outside development. |

The app shows a configuration error screen instead of crashing when the API URL is missing
or not https in a release build.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run android` / `npm run ios` | Start and open on a device or emulator |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm test` / `npm run test:ci` | Jest (`--ci` for CI) |
| `npm run bundle` | `expo export` for Android into `dist/` (delete `dist/` afterwards) |

### Jest and the "worker failed to exit gracefully" message

`jest.config.js` sets `maxWorkers: '50%'`. Findings from measuring it on an 8-logical-core Windows
machine (1102 tests, 57 suites after the pilot fix round; the figures below were measured earlier at 876 tests, 46 suites; every run passed all tests):
- With 6 or 8 workers the message "A worker process has failed to exit gracefully" appeared in
  roughly 4 to 6 of 10 full runs. With 4 or 5 workers it did not appear in 25 runs.
- `--detectOpenHandles` reports no open handles. No single suite is responsible: groups of 8
  suites (0/40 runs) and halves of the suite (0/20 runs) never print it at 8 workers; only the
  full suite does. Worker heap stays below about 220 MB. `workerIdleMemoryLimit` did not help.
- Running 4 workers while 8 busy-loop processes competed for the CPU did not reproduce it (0/6), so
  it is NOT proven to be purely CPU load. The honest summary: a teardown-timing problem that
  shows up only with many parallel workers on this machine. It is harmless to test results, and
  the 50% cap is a mitigation, not a root-cause fix. If you see the message on CI, lower
  `--maxWorkers` or use `--runInBand`.

Device testing: follow `DEVICE_SMOKE_TEST.md` (checklist with a results table to fill in).

Before sending work for review: typecheck, lint, `npx jest --ci`, `npx expo install --check`,
`npx expo-doctor`, and `expo export` for android and ios with an https API URL.

## Architecture (`src/`)

| Folder | Contents |
| --- | --- |
| `api/` | One file per backend area (auth, tasks, tickets, sprints, timesheet, ...). Axios client, error mapping (`AppError`), tolerant response parsers. No UI. |
| `hooks/` | TanStack Query hooks and mutations (`useSessionMutation` drops late responses after logout), timer, menu access, project sync, today key. |
| `features/` | Screens by area: dashboard, tasks, qa, myday, timer, tickets, sprints, timesheet, projects. |
| `navigation/` | Root stack, bottom tabs (at most 5), module registry (`modules.ts`), More screen. |
| `components/` | Shared UI primitives (`components/ui`), `RichText` (whitelist HTML renderer), error boundary, offline banner. |
| `store/` | Zustand: auth (session, epoch), selected project, UI guards. The JWT lives in `expo-secure-store` only. |
| `theme/` | Design tokens mirroring the web (light and dark). No hardcoded colors outside `tokens.ts`. |
| `lib/`, `config/`, `utils/` | Query client, connectivity (NetInfo), env validation and constants, dates and company-timezone maths, HTML sanitising. |
| `test/`, `__tests__/` | Test helpers (fixtures, mock HTTP) and the Jest suites. |

Data rules: server data stays in TanStack Query; UI-only state in `useState`/Zustand. Every
mutation invalidates the keys derived from it. Logout wipes the query cache, mutation cache,
project selection, timer prompt and dirty guard, and bumps a session epoch so late responses
are ignored.

## Module gating (what a user sees)

A module is offered (tab, or entry in More) only when BOTH hold:
1. the server grants its menu URL (`canView(menu)` from `GET /menu-access/my`), and
2. the menu is not hidden from mobile (`is_visible_on_mobile !== false`).

Access is never invented on the client. At most 4 modules become tabs (registry order:
Dashboard, Tasks, My Day, QA, Tickets, Sprints) plus a More tab; the rest open from More.
Profile and Timesheet are pushed screens. Granted menus with no mobile screen are listed in
More as "Not available in this version yet".

Deliberate exceptions, documented in code:
- Timesheet is NOT gated by a `/timesheet` menu (an old migration deleted it; the server only
  requires a signed-in user and returns only the caller's own data). Its entry points are the
  Timesheet button on My Day (itself gated by `/my-day`) and a link on Task Detail.
- QA actions are gated by `canView('/qa')` plus the task's `allowed_transitions`; see the
  backend gaps.

## Design tokens vs web

`src/theme/tokens.ts` mirrors the web tokens, with these intentional MOBILE-ONLY divergences (web is unchanged;
rationale and computed contrast ratios are in `docs/UX_DESIGN_PLAN.md`, asserted by `src/__tests__/tokensContrast.test.ts`):

- `2xs` type is 12px (web 11px): 12px is the mobile floor. Titles use `xl` where the web uses `2xl`.
- New tokens with no web twin: `placeholder`, `fieldBorder` (3:1 control border), `fieldBorderFocus`, `divider`,
  `avatarDev` / `avatarQa`, `indicator` (active tab), `dotWarn` (unfiled day), `motion`, `iconSizes`, `space`, spacing `0.5`.
- Inter is loaded with `expo-font` (one family per weight on Android); the system font is the fallback if it is not
  ready after 2.5s. Icons are Ionicons from `@expo/vector-icons` (same `useFonts` call).
- Dark mode cards use a border instead of a shadow (black shadows are invisible on dark surfaces).
- Role-aware tab ORDER (`navigation/moduleTabs.ts`) is presentation only: tabs still come from server grants +
  `is_visible_on_mobile`, 4 modules + More.
- Animations are core `Animated` only, skipped under Jest and when the OS asks to reduce motion.
- Ripple overlays (`ripple`, `rippleOnBrand`) are alpha colours so Android ripples never hide the control underneath.
- Support floor = Expo SDK 54 defaults: Android minSdk 24, iOS 15.1 (RN 0.81 `libs.versions.toml` / `min_ios_version_supported`).

### Pilot round (before the first test APK)

- Android bottom inset: modules pushed from More and Profile now add the bottom safe-area inset to their scrolling content
  (`useScreenBottomPadding` for lists, `Screen` for scroll views) when no tab bar clears it (edge-to-edge).
- Keyboard: `useKeyboardOverlap` guards NaN/missing `screenY`, ignores a measure that lands after the keyboard hid, and follows
  `keyboardWillChangeFrame` on iOS. Time entry: `maskTime` zero-pads when the first digit is 3-9 (`930` becomes `09:30`).
- Add time: error banner in the sticky footer, Save/Add and Delete on one row, Confirm in the body, note counter, quiet
  "company time" helper line (banner only on a timezone mismatch), task picker shrinks with the keyboard.
- Tasks: list and filter chips are always mounted (loading/error/empty live in the list), count line hidden while loading
  ("Show tasks", never "0 tasks"), one due wording (`3d overdue`, `Due today`, `Due tomorrow`, `Due 13 Oct`), "5h est",
  "Not in a sprint". Dashboard Developer focus capped at 5 with "Show all N".
- Android permissions: `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW` are blocked in `app.json`
  (verified in a scratch prebuild: the manifest carries `tools:node="remove"` for them; `VIBRATE` stays for haptics).
- Label in Name (WCAG 2.5.3) is audited by `src/test/a11y.ts` on whole screens (prefix rule; summarised cards must contain every
  visible word). Run `DEVICE_SMOKE_TEST.md` section L before sign-off.
- Chrome budget claim (Tasks, 360x640, nominal arithmetic in `features/tasks/layoutBudget.ts`): about 1.9 cards with no strip
  (one full card and most of a second) and about 1.6 with the timer strip, using a ~200dp card. It is an estimate, not a
  measurement: record the real number in DEVICE_SMOKE_TEST L7.

### UI upgrade, what changed (summary)

- One header per screen (`PageHeader`): the six module screens (Dashboard, Tasks, My Day, QA, Tickets, Sprints) render a
  `ModuleHeader` themselves in EVERY state (loading, error, empty, content), as `tab` in the tab bar or `push` (with Back)
  when opened from More; detail screens, Timesheet, Profile and More get the header from their host. The header also carries
  the global offline and running-timer strips.
- Tasks: one toolbar row (search + Filters sheet with live "Show N tasks"), Mine (default OFF; matches dev/QA/support OWNERS only),
  grouped list, redesigned `TaskCard` (urgency-aware labelled due date, assignee names as text, Move in the footer).
- Dashboard: Today's focus / Ready for QA first, compact KPIs, Overdue explainer, quick Start (owner rows only).
- Detail: Task Detail sticky tab strip (Overview, Time, QA when relevant, Comments, More), verdict-first QA, ticket Closed and
  QA Reopen confirmations, sprint metric explainers, neutral burndown bars.
- My Day (style only): sticky Save/Submit footer, icon date stepper, "x of 8h" progress, optional marks and counters.
- Splash: `assets/splash-placeholder.png` is a TEMPORARY fully transparent placeholder (it only makes the Android splash
  resource exist); real icon/splash artwork is still to be supplied.
- Not built / cut: `KeyboardDoneBar` and `NumberField` steppers (P2), toast exit animation, Comments count badge on the tab.

## Known backend gaps (need a server change; the app works around them)

- No refresh token: a 401 ends the session and the user signs in again.
- No push notification or device-token endpoint.
- `work_timezone`, `work_max_session_hours` and `work_daily_capacity_hours` are not exposed to
  clients. The company timezone is taken from the `timezone` field of the timesheet and daily
  report responses; the 8h day target is a display-only constant (`src/config/constants.ts`);
  entry length limits are enforced by the server and shown verbatim.
- No server-side list of which QA verdict transitions a role may perform beyond
  `allowed_transitions` on the task.
- Ticket attachment URLs are unsigned, so the app only opens them (https; http in dev).
- `GET /tasks?assigned_to` matches the owner columns only, not the assignees roster.
- `PUT /tickets/:id` is mass-assigned on the server; the app sends only the changed fields.

## NOT built yet

- Manager "Team day" view and reopening a submitted day.
- Create / edit task (and therefore the rich-text editor; descriptions are rendered read-only).
- Convert ticket to task (needs sprint, release and team rules; deferred).
- Attachment upload (no file or image picker dependency was approved).
- Releases, calendar, reports, admin screens (users, roles, menus, menu access).
- Push notifications and token refresh (backend support needed).
- App icon and splash ARTWORK. `assets/splash-placeholder.png` is a TEMPORARY fully transparent placeholder (it only makes the Android splash resource exist); real icon/splash artwork is still to be supplied. `icon` is unset (Expo default); splash background is `#F8FAFC` (dark `#090B12`). Inter is bundled via `@expo-google-fonts/inter`.

## Not verified

Everything above is verified by automated tests with mocked HTTP only. Nothing has been run on a
physical device or against a real API. Use `DEVICE_SMOKE_TEST.md` against a TEST API before relying on any of it.
