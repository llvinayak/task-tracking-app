# Device smoke test (human, against a TEST API)

Everything in this app is covered by automated tests with mocked HTTP only. Nothing has been
run on a device. Run this list on at least one Android and one iOS device, in light AND dark
mode, against a TEST API with TEST accounts. Never use production data.

How to use
- Fill the "Run details" table once per run, then record every item in the "Results" table
  (Pass / Fail / N/A plus notes: what you saw, screenshot name, ticket link).
- A Fail on any item marked **[blocker]** stops a release.
- Note the server message when an error is shown: the app shows server messages verbatim.

## Run details

| Field | Value |
| --- | --- |
| Tester / date | |
| Device model | |
| OS version | |
| Build id / commit / EAS build | |
| Build type (Expo Go / dev build / release) | |
| API environment (URL host only, no secrets) | |
| Accounts used (roles only) | |

## Test accounts needed
CTO, Project Manager, Tech Lead, QA, Developer, Client; one account whose password you can
get wrong repeatedly (for lockout); one task assigned to the Developer; one auto-closed
overnight time entry (23:00 to 01:00 company time) for the Developer; a sprint with a baseline
and snapshots; a ticket in each status.

---

## A. Setup, release build and configuration

| # | Step | Expected |
| --- | --- | --- |
| A1 **[blocker]** | Install a RELEASE build whose `EXPO_PUBLIC_API_BASE_URL` is https. Open the app. | Login screen (no configuration error). |
| A2 | Build with a missing API URL, then with an `http://` URL (release). | A clear configuration error screen. The app does not crash and does not send requests. |
| A3 | On Android release, try to reach an http-only host. | Cleartext traffic is blocked; the app shows its network error, not a crash. |
| A4 | Health URL: with the real host, turn Wi-Fi/data off, then on. If the API is behind a path prefix, set `EXPO_PUBLIC_HEALTH_URL` and repeat. | Offline banner appears within a few seconds of going offline and clears when the real host `/health` is reachable again. With a wrong prefix and no override the banner may be wrong: that is the documented caveat. |

## B. Login, session and security

| # | Step | Expected |
| --- | --- | --- |
| B1 **[blocker]** | Log in with each role (C section lists what to look for). | Lands on the first granted module. |
| B2 | Wrong password. | The server message is shown; you stay on login. |
| B3 | Wrong password repeatedly until the server locks the account (HTTP 429). | The server's lockout message is shown verbatim; no crash; login works again after the lock period. |
| B4 **[blocker]** | While logged in, make the token invalid on the server (expire or revoke it), then pull to refresh or open another screen. | Returned to login with a "session expired" style notice. No data from the old session remains. |
| B5 | Start a slow action (save My Day, post a note, create a ticket) and sign out (Profile) before it finishes. | No toast, no navigation and no data from the old user appears after logout. Logging in as another user shows only that user's data. |
| B6 | Kill the app while logged in and reopen. Then repeat after a day. | Still logged in, data refreshes. An expired token returns you to login. |

## C. Role matrix: tabs and menus

For each role, log in and record the tabs shown, what More lists, and anything unexpected.

| # | Role | Expected |
| --- | --- | --- |
| C1 | CTO | Tabs and More match the menus granted to this role by the server (no more than 5 tabs). |
| C2 | Project Manager | Same rule. |
| C3 | Tech Lead | Same rule. |
| C4 | QA | QA tab only if `/qa` is granted. |
| C5 | Developer | Dashboard, Tasks, My Day etc. only if granted. |
| C6 | Client | Only the modules granted to Client (typically Tickets). Nothing invented. |
| C7 **[blocker]** | Set `is_visible_on_mobile = false` for a granted menu (admin on web). | That module is not offered anywhere on mobile, including More. |
| C8 | Remove or never grant `/my-day` for a user. | No My Day tab and no My Day entry. The Timesheet screen is still reachable from a task (it is not menu-gated). |
| C9 | Grant more than 4 modules. | Four tabs plus More; the others open from More with a Back button. |

## D. Dashboards and tasks

| # | Step | Expected |
| --- | --- | --- |
| D1 | Open the dashboard for developer, QA and manager roles. Pull to refresh. | Role-appropriate tiles; refresh works. |
| D2 | Airplane mode on a loaded screen, then pull to refresh. | Offline banner; old data stays with a stale banner. |
| D3 | Tasks list: filters, project picker, search. Open a task. | The description shows as formatted text. |
| D4 | Move a task through an allowed status. | Updates immediately, toast; on a refused move it rolls back and shows the server text. |

## E. Timer

| # | Step | Expected |
| --- | --- | --- |
| E1 **[blocker]** | Start a timer on an assigned task. | Banner with ticking clock; Start disabled on every screen while the request runs. |
| E2 | Double-tap Start quickly. | Only one timer is started. |
| E3 | With a timer running on task A, start task B. | Message says A was stopped and B started; one running timer. |
| E4 | Stop the timer. | "Timer stopped, N minutes logged". |
| E5 | Developer and QA: check the status prompt after start and after stop. | Prompts match the role rules; QA owner starting never prompts. |
| E6 | Start with a slow network. | Buttons free up as soon as the server answers, not after the prompt data loads. |

## F. My Day

| # | Step | Expected |
| --- | --- | --- |
| F1 **[blocker]** | Edit minutes and a note on a line, Save draft, reopen. | Saved values persist. Invalid minutes show an error and block Save. |
| F2 | Edit a line, then stop a timer elsewhere (another device or the Task screen) that adds time to a DIFFERENT line, then Save. | Your edited line keeps your value; the other line takes the newer server time; a note says lines were updated. |
| F3 | Submit (confirm dialog). | Day locks; message shown; a manager can reopen it on web. |
| F4 | While Save runs, try typing. | Fields are locked briefly; nothing you typed is lost. |
| F5 | Make a change then press Android back, or switch tabs. | Discard / Keep dialog; Discard resets the form and lets you leave. |
| F6 | Leave a draft open across midnight in COMPANY time. | A banner says the draft stays on its date; save it, then go to today. |
| F7 | A line you edited is removed on the server (delete the entry on web), then Save. | A warning names the line; it is not sent. |
| F8 | "Confirm auto-closed entries" card. | Confirming clears the card and the pending count. |

## G. Timesheet

| # | Step | Expected |
| --- | --- | --- |
| G1 | Open Timesheet from My Day and from a task. | Week Monday to Sunday in company time; "x of 8h" shown as text. |
| G2 | Add a same-day entry using "Assigned to me" and "All tasks". | Entry appears; derived totals refresh. The sheet says a new entry must be on one day. |
| G3 | Edit the times of a same-day entry. | Times validated only when changed. |
| G4 **[blocker]** | Open an auto-closed overnight entry (23:00 to 01:00). Edit only the note and Save. Then open another one and press "Confirm entry as correct". | Note saves without any time error; Confirm clears the "needs confirming" banner and badge. |
| G5 | Delete an entry. | Confirmation then removal. |
| G6 | Use a device whose timezone differs from the company timezone. | The sheet says times are company time and warns about the difference; entries show company-time clock values. |
| G7 | Open Add time on a slow network. | Add time stays disabled until the week (and company timezone) has loaded. |
| G8 | Pass midnight (or change the device date) with the screen open. | The default week and "today" follow the date. |

## H. QA, tickets, sprints

| # | Step | Expected |
| --- | --- | --- |
| H1 | QA: queue, add a test case, record pass and fail (fail asks for confirmation). | Verdict buttons offered only when allowed; disabled ones say why. |
| H2 | Tickets: list, search (short delay), status chips with counts. | Filters work. |
| H3 **[blocker]** | Ticket detail: change status; change assignee. | Only the changed field is sent. |
| H4 | Double-tap a status chip, and tap a status chip right after choosing an assignee. | Only one update is sent; chips are disabled while it runs. |
| H5 | Converted ticket. | Only "Mark Closed" is offered. |
| H6 | Add a note (over 5000 characters is stopped); open an attachment. | https attachments open; other schemes refused. |
| H7 | Create a ticket; double-tap Create. | One ticket is created; you land on its detail. |
| H8 | Sprints: list grouped by status, detail, tiles, burndown. | Burndown rows show remaining and ideal using the server's ideal array. Days left/overdue computed from end date. |
| H9 | A sprint with no baseline/snapshots. | Metrics read "n/a" and an empty burndown message, no crash. |

## I. Links and rich text

| # | Step | Expected |
| --- | --- | --- |
| I1 **[blocker]** | Task description containing these links (create them on web): `https://evil.com\@good.com`, `http://evil.com\.good.com`, `https://good.com@evil.com`, text "https://example.com" pointing to `http://example.com`, text "co.uk" pointing to `https://evil.co.uk`, a link with an invisible character in it. | Backslash and invisible-character links are not opened. Userinfo, downgrade and lookalike links show a confirmation with the REAL host before opening. An honest link (text = host) opens without a prompt. |
| I2 | Very long or deeply nested description. | Renders a preview with "Show more"; no freeze or crash. |

## J. Appearance and platform

| # | Step | Expected |
| --- | --- | --- |
| J1 | Dark mode on every screen. | No unreadable text, no white flashes. |
| J2 | 360dp wide device (or emulator). | The tab bar fits (5 tabs max); no clipped buttons. |
| J3 | Font scale 150% and above. | Text wraps, nothing is cut off; buttons stay tappable. |
| J4 | Rotate the device. | Layout holds; no state loss. |
| J5 | Background the app for a few minutes, then return. | Data refreshes; the running-timer clock is correct. |
| J6 | Android hardware back on tabs, pushed screens and sheets. | Back goes one level; the dirty My Day guard works. |
| J7 | Screen reader (TalkBack / VoiceOver) on login, tasks, My Day. | Buttons and fields have sensible labels. |

---

## Results

One row per item. Copy a row for repeats.

| Item | Result (Pass / Fail / N/A) | Device | OS version | API env | Build id | Notes (what you saw, screenshot, ticket) |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | | | | | | |
| A2 | | | | | | |
| A3 | | | | | | |
| A4 | | | | | | |
| B1 | | | | | | |
| B2 | | | | | | |
| B3 | | | | | | |
| B4 | | | | | | |
| B5 | | | | | | |
| B6 | | | | | | |
| C1 | | | | | | |
| C2 | | | | | | |
| C3 | | | | | | |
| C4 | | | | | | |
| C5 | | | | | | |
| C6 | | | | | | |
| C7 | | | | | | |
| C8 | | | | | | |
| C9 | | | | | | |
| D1 | | | | | | |
| D2 | | | | | | |
| D3 | | | | | | |
| D4 | | | | | | |
| E1 | | | | | | |
| E2 | | | | | | |
| E3 | | | | | | |
| E4 | | | | | | |
| E5 | | | | | | |
| E6 | | | | | | |
| F1 | | | | | | |
| F2 | | | | | | |
| F3 | | | | | | |
| F4 | | | | | | |
| F5 | | | | | | |
| F6 | | | | | | |
| F7 | | | | | | |
| F8 | | | | | | |
| G1 | | | | | | |
| G2 | | | | | | |
| G3 | | | | | | |
| G4 | | | | | | |
| G5 | | | | | | |
| G6 | | | | | | |
| G7 | | | | | | |
| G8 | | | | | | |
| H1 | | | | | | |
| H2 | | | | | | |
| H3 | | | | | | |
| H4 | | | | | | |
| H5 | | | | | | |
| H6 | | | | | | |
| H7 | | | | | | |
| H8 | | | | | | |
| H9 | | | | | | |
| I1 | | | | | | |
| I2 | | | | | | |
| J1 | | | | | | |
| J2 | | | | | | |
| J3 | | | | | | |
| J4 | | | | | | |
| J5 | | | | | | |
| J6 | | | | | | |
| J7 | | | | | | |

Sign-off: all **[blocker]** items pass on Android and iOS: yes / no. Tester signature and date:
