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

For each role, log in and record the tabs shown, what the drawer lists, and anything unexpected.

| # | Role | Expected |
| --- | --- | --- |
| C1 | CTO | Bar items and the drawer match the menus granted to this role by the server (no more than 5 tabs). |
| C2 | Project Manager | Same rule. |
| C3 | Tech Lead | Same rule. |
| C4 | QA | QA tab only if `/qa` is granted. |
| C5 | Developer | Dashboard, Tasks, My Day etc. only if granted. |
| C6 | Client | Only the modules granted to Client (typically Tickets). Nothing invented. |
| C7 **[blocker]** | Set `is_visible_on_mobile = false` for a granted menu (admin on web). | That module is not offered anywhere on mobile, including the drawer. |
| C8 | Remove or never grant `/my-day` for a user. | No My Day tab and no My Day entry. The Timesheet screen is still reachable from a task (it is not menu-gated). |
| C9 | Grant more than 4 modules. | Four bar items plus Menu; the drawer lists all of them and the 5th/6th open from the drawer with a Back button. |

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

## K. UI upgrade (fonts, chrome, lists, sheets). Light AND dark, 100% and 150% font size, 320-360dp if you have it

Nothing below has been seen on a device yet: every visual claim in the upgrade is unverified until this section is run.

| # | Step | Expected |
| --- | --- | --- |
| K1 **[blocker]** | Cold start in dark mode, then light. | No white flash; the splash background matches the first screen (`#F8FAFC` light, `#090B12` dark); no blank frame before the first screen. Note: the splash image is a temporary transparent placeholder. |
| K2 | Look at any screen. | Text is Inter (rounded letterforms); icons are drawn (no empty boxes or question marks). With airplane mode on a first install the app still starts (system font fallback after 2.5s). |
| K3 **[blocker]** | Tab bar with 5 tabs at 320dp, then at 150% font. | Icons + 12px labels not clipped; the selected tab has a bar on top, a filled icon and a bold label; pressing a tab shows feedback. |
| K4 | Open a screen that has an unfiled day (My Day not filed) as Developer, then as PM. | Developer: dot on the My Day tab. PM/CTO: dot on Menu (and the hamburger label) and a "Not filed yet" badge on the My Day row in the drawer. No numeric badge anywhere. |
| K5 **[blocker]** | Start a timer, then open Task Detail, Timesheet and a pushed module from the drawer. | The timer strip and (offline) strip show under the header on every screen; Stop works; the strip row opens the task and is not tappable when you are already on that task; Back is in the header and works (also Android hardware back). |
| K6 | Keyboard: focus a field on Login, Tasks search, a ticket field, My Day notes, and Add time. | The focused field and the footer buttons stay visible and tappable; the tab bar hides while the keyboard is up; nothing is lifted twice or left with a gap (Android edge-to-edge is the risk). |
| K7 | Tasks screen at 360x640 with no strip, then with the timer strip. | The arithmetic estimate is ~1.9 cards without the strip and ~1.6 with it (see L7: record the real count). Search + Filters is one row; quick chips and the count scroll with the list. |
| K8 | Tasks: Filters sheet. Set Priority, Type, Backlog, Group by; watch the button. | "Show N tasks" updates live; the Filters button shows the active count; Clear all resets; Mine is OFF by default and says what it matches. |
| K9 | Task cards. | Due date is labelled and says "3d overdue" / "Due today" without any filter; Dev/QA names are text; type is plain text (red is not used for both type and priority); "Move" works for editable tasks. |
| K10 **[blocker]** | Add time sheet: type digits only for date and times. Use Today / Yesterday and the -15 / +15 buttons. Cancel after typing. | Dashes and colon appear while typing; weekday text shows; Cancel asks "Discard changes?"; Add entry stays reachable above the keyboard. Add time is disabled until the company timezone is known. |
| K11 | Errors: trigger an error toast (offline save), then open any sheet and trigger another. | The error toast stays at least 8s and can be dismissed; it shows above an open sheet; queued toasts show one at a time. |
| K12 | Dashboard as Developer and QA. | Today's focus / Ready for QA comes first, KPIs below and compact; the Overdue info button explains why it differs from Tasks; the quick Start play button appears ONLY on tasks you own and starts the timer; with another timer running it asks "Switch timer?"; haptic on start/stop. |
| K13 | Task Detail at 320dp. | Tab strip stays pinned while scrolling any tab; labels are not clipped (the strip may scroll); Overview, Time, Comments, More (People / History / Files), plus QA when the task is in the QA flow; Move to... sits next to the timer button. |
| K14 | QA task screen: verdict, test cases, summary. Reopen a failed task. | Verdict is first; Reopen asks to confirm. Marking a ticket Closed asks to confirm. |
| K15 | Sprint detail. | Each metric has a plain-language line; burndown bars are not green when much work remains; the ideal tick and "On or under ideal / Above ideal" show. |
| K16 | My Day: footer, stepper, target. | Save draft / Submit day stay at the bottom (above the tab bar or nav bar, also when opened from the drawer) and hide with the keyboard; at 150% font they stack with Submit on top; the 8h progress shows; date arrows do not wrap at 320dp; Timesheet is in the header. |
| K17 | Screen reader (TalkBack and VoiceOver) on Tasks, Task Detail, a sheet and a toast. | Tabs announce selected; icon-only buttons are named; sheets trap focus; the toast is announced; radio chips announce checked. |
| K18 | Reduce motion on, then use sheets, toasts and a loading list. | No sheet slide, no toast slide, skeletons are static. |

## L. Pilot checks (designer + QA). Mark **[blocker]** items first; light AND dark, 100% and 150% font

| # | Step | Expected |
| --- | --- | --- |
| L1 **[blocker]** | Cold start, light then dark. | No white flash, no blank frame; splash background matches the first screen. |
| L2 **[blocker]** | 5 tabs at 320dp and at 150% font. | Icons and labels not clipped; selected tab clear (bar, filled icon, bold). |
| L3 **[blocker]** | Timer running: open Task Detail, Timesheet, Profile and a module pushed from the drawer. | Timer/offline strips under the header on all of them; Back works. |
| L4 **[blocker]** | Keyboard on Login, Tasks search, a ticket field, My Day notes and Add time (Android 3-button and gesture, and iOS). | Focused field and footer buttons visible; no double lift, no gap above the keyboard; tab bar hidden while typing. |
| L5 **[blocker]** | Scroll to the end of every list/screen opened FROM THE DRAWER (Tasks, Tickets, Sprints, Dashboard, QA, My Day) and Profile; also the last card on tab screens. | The last card and Sign out clear the Android navigation bar (3-button AND gesture). |
| L6 | Tasks: Filters sheet (Priority, Type, "Not in a sprint", Group by), Mine, count button. | Live "Show N tasks" (shows "Show tasks" while loading, never "0 tasks"); chips do not flash or jump when filtering; Mine says what it matches. |
| L7 | Tasks first screen at 360x640, no strip then with the timer strip. | Record the actual number of cards fully visible: ______ (estimate 1.9 / 1.6). |
| L8 | Task card due text. | `3d overdue`, `Due today`, `Due tomorrow`, `Due 13 Oct` (never "Due Due today"); estimate reads "5h est"; type shown only when informative; Move sits on the due row. |
| L9 | Fast-scroll a long Tasks list (sticky headers on iOS only, removeClippedSubviews off). | No blank rows or flicker. |
| L10 | Tech Lead dashboard. | Compact KPIs; Blocked and at risk shows 8 with "Show all N". Developer focus shows 5 with "Show all N". |
| L11 | Task Detail at 320dp. | Pinned tab strip runs full width (no side gutters); header meta line "Due, Dev, QA"; Start and Move visible without scrolling; the selected tab scrolls into view. |
| L12 | QA task screen. | "Pass task" / "Fail task" verdicts, then the summary, then the cases; "Open task"; Reopen confirms; plain-language "can't be recorded" text. |
| L13 **[blocker]** | Add time: trigger an error while scrolled to Note. | The error is visible above Save/Add (sticky footer). |
| L14 | Edit an auto-closed entry with the keyboard open. | Confirm entry as correct is in the form; Save and Delete share one row. |
| L15 | Add time: task picker with the keyboard open. | Results stay above the keyboard (list shrinks). |
| L16 | Type `930` in Start. | Becomes 09:30; helper says "Type 4 digits, e.g. 0930". |
| L17 | Timesheet week navigation. | Previous/Next week work; Add time disabled until the timezone is known. |
| L18 | My Day footer at 150%. | Buttons stack with Submit on top and first when read by TalkBack/VoiceOver; the footer clears the nav bar, also when opened from the drawer. |
| L19 | Tickets header and list. | Header not taller than needed (one search row); chips scroll with the list; separators visible; "Severity: X" badge. |
| L20 | Sprint detail. | Task rows are separate rows with dividers; progress track is visible in light and dark; burndown is not green when much is left. |
| L21 | Toasts: an error toast (>= 8s), dismiss, one inside an open sheet, a long message. | Error stays >= 8s and can be dismissed; shows above the sheet; long text is not cut off; announced once. |
| L22 | TalkBack and VoiceOver: Tasks, Task Detail, a sheet, a toast, radio chips, the tab bar. | Names start with the visible text; radios announce checked; the tab selected state is read; no double announcements. |
| L23 | Reduce motion on; then offline (airplane mode) on a loaded screen. | No slide animations; the offline strip is one or two lines and data stays with a stale banner. |
| L24 | Dark pass of every screen above. | Contrast acceptable; cards have borders; nothing invisible. |

## M. Task Board crash re-test, navigation drawer and bottom bar (blocker items first)

**If anything crashes again:** see the "What to send us" box at the end of this section.

| # | Step | Expected |
| --- | --- | --- |
| M1 **[blocker]** | **Task Board crash re-test.** Open the app, tap **Tasks** in the bottom bar (the server calls it "Task Board"). Then open it from the drawer. Scroll the list, open Filters, toggle Mine, open one task and come back. Repeat after a force-close and in dark mode. **This build has sticky section headers OFF on Android** (they stay on iOS) and a list that never swaps its header/empty block: also type and clear a search and switch filters while it loads. | No crash. If it STILL crashes, send us the logcat files (see the box below) and the E-xxxxxx code. If the friendly "Something went wrong" screen shows, tap **Details** and read us the code (E-xxxxxx). |
| M2 **[blocker]** | Bottom bar shows modules + **Menu**; no "More"; the active module has a bar on top; Menu never looks selected. | Up to 5 items; at 320dp the labels are not clipped. |
| M3 **[blocker]** | Tap **Menu**: the drawer slides in from the left in about 0.3s with a dim scrim; tap the dark area: it closes. | Smooth; the tab you were on is unchanged. |
| M4 | Tap the **hamburger** on Tasks/Dashboard/My Day headers; open a task or Profile. | Same drawer from tab screens; pushed screens show **Back**, not the hamburger. |
| M5 | The drawer content. | Your name and role, all your modules (names as on the web, e.g. Task Board), the current one clearly marked (bar, filled icon, bold), My Day "Not filed yet" when relevant, Sign out at the bottom clear of the navigation bar. |
| M6 **[blocker]** | Android **Back** button with the drawer open (also on My Day). | Closes the drawer first, not the app or the screen. |
| M7 | Tap another module; tap the current one. | Drawer closes and the screen changes; the current one just closes. |
| M8 **[blocker]** | On My Day type a note without saving, open the drawer and tap another module, Profile or Sign out. | "Discard changes?" appears; Keep editing leaves the note intact. Menu/hamburger do NOT ask. |
| M9 | Drawer > Profile and settings; Back. | Profile opens (theme is there); Back returns. |
| M10 **[blocker]** | Drawer > **Sign out** (try with an unfiled day and with a running timer). | The usual dialog; Android shows it with the drawer still open; on iOS the drawer closes first with a short toast, then the dialog appears. "Sign out" logs you out. |
| M11 | Offline (airplane mode) with the drawer open. | Offline notice shows in the drawer; navigation still works. |
| M12 | 150% font and a 320-360dp screen; light and dark; 3-button and gesture navigation. | Drawer rows wrap, Sign out stays visible above the nav bar, bar labels do not wrap. |
| M13 | Start a timer, open the drawer, let a "move status" prompt appear; enable "Remove animations" in system settings. | The prompt closes the drawer cleanly; with animations removed the drawer appears and disappears without sliding. |

**What to send us if the app crashes (Windows PowerShell, phone connected with USB debugging):**
`adb logcat -c` (clear), reproduce the crash, then
`adb logcat -d -s AndroidRuntime:E ReactNativeJS:E ReactNative:E libc:F DEBUG:F > crash.txt` and
`adb logcat -b crash -d > crash-buffer.txt`; attach both files plus the E-xxxxxx code from the screen if it appeared.
Please open `crash.txt` and look through it before sharing: the app's own report line (`[TT-ERROR]`) and the Details screen are
redacted (tokens, e-mails, passwords, cookies, keys, long secrets, user folders), but React and the default Android handlers can
still write raw error text to logcat, and that text is NOT redacted.

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
| K1 | | | | | | |
| K2 | | | | | | |
| K3 | | | | | | |
| K4 | | | | | | |
| K5 | | | | | | |
| K6 | | | | | | |
| K7 | | | | | | |
| K8 | | | | | | |
| K9 | | | | | | |
| K10 | | | | | | |
| K11 | | | | | | |
| K12 | | | | | | |
| K13 | | | | | | |
| K14 | | | | | | |
| K15 | | | | | | |
| K16 | | | | | | |
| K17 | | | | | | |
| K18 | | | | | | |
| L1 | | | | | | |
| L2 | | | | | | |
| L3 | | | | | | |
| L4 | | | | | | |
| L5 | | | | | | |
| L6 | | | | | | |
| L7 | | | | | | |
| L8 | | | | | | |
| L9 | | | | | | |
| L10 | | | | | | |
| L11 | | | | | | |
| L12 | | | | | | |
| L13 | | | | | | |
| L14 | | | | | | |
| L15 | | | | | | |
| L16 | | | | | | |
| L17 | | | | | | |
| L18 | | | | | | |
| L19 | | | | | | |
| L20 | | | | | | |
| L21 | | | | | | |
| L22 | | | | | | |
| L23 | | | | | | |
| L24 | | | | | | |
| M1 | | | | | | |
| M2 | | | | | | |
| M3 | | | | | | |
| M4 | | | | | | |
| M5 | | | | | | |
| M6 | | | | | | |
| M7 | | | | | | |
| M8 | | | | | | |
| M9 | | | | | | |
| M10 | | | | | | |
| M11 | | | | | | |
| M12 | | | | | | |
| M13 | | | | | | |

Sign-off: all **[blocker]** items pass on Android and iOS: yes / no. Tester signature and date:
