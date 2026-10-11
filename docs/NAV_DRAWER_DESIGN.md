# Navigation drawer + bottom bar: design spec

Owner: UI/UX designer. Implementer: senior-react-native-developer. Builds on `docs/UX_DESIGN_PLAN.md` (tokens, components, a11y rules) and the current code (`AppTabs.tsx`, `moduleTabs.ts`, `HomeScreen.tsx` = "More", `PageHeader.tsx`, `ProfileScreen.tsx`, `signOutDialog.ts`).

Verification statement: derived from reading source only. Every visual, gesture, keyboard, Alert-over-Modal and edge-to-edge claim is **Needs on-device verification** (Android + iOS). Heights are estimates.

Constraints honoured: no new dependency (custom core-RN drawer: `Modal` + `Animated` + scrim); module gating untouched (server grant AND `is_visible_on_mobile !== false`, role-aware order, never invented); My Day dirty guard also runs from the drawer; sign-out keeps the existing confirm flow; global offline/timer strips stay in `PageHeader`; bottom bar <= 5 items; no information loss versus today's More screen.

---

## 1. Information architecture decision

### 1.1 Decision (one approach)
**Bottom bar = up to 4 role-prioritised modules + a fixed 5th item "Menu" that opens the drawer. The drawer lists ALL granted modules (the full navigation), plus Profile & settings, the web-only disclosure and Sign out. The old "More" tab and screen are removed.** A hamburger button in every tab-screen header opens the same drawer.

Why this and not "5 modules + drawer-only overflow":
1. **Predictable bar.** The bar always has the same shape (modules, then Menu). Today the 5th slot is already reserved for More; replacing it keeps the same width budget (5 x 64dp at 320dp) and the proven label fit.
2. **The drawer is complete.** Users who know the web sidebar get the same mental model: one place that lists everything they can open (parity with `Sidebar.jsx`: Menu section, account card with role, Sign out, close button). Tab modules are repeated in the drawer on purpose (a drawer that omits what is in the bar reads as broken).
3. **Nothing is lost.** Profile, overflow modules, web-only list and the unfiled-day cue all move into the drawer; Menu is the thumb-reachable opener, the hamburger is the conventional one. Two openers, one drawer, no duplicated content.
4. **Zero-module users** (no granted mobile modules) still reach Profile and Sign out through the drawer. With "5 modules + hamburger only" a user with 0 modules would have no bar at all.

### 1.2 Counts
| Granted mobile modules (after grant + mobile-visible filter) | Bottom bar | Drawer "Modules" list |
|---|---|---|
| 0 | `Menu` only (route is the initial route; its screen shows an empty state with an "Open menu" button, see 3.4) | empty message (4.8) |
| 1-4 | those modules (role order) + `Menu` | the same modules |
| 5-6 | first 4 (role order) + `Menu` | all, same order |
No module is ever in the bar twice; the bar never has more than 5 items. The 5th/6th module opens from the drawer as a pushed `Module` screen (today's behavior for overflow, unchanged, with Back).

### 1.3 Role priority (unchanged from `TAB_PRIORITY`, shown with the result)
The first four granted modules in this order are bar items; the rest only appear in the drawer, in the same order.
| Role | Order | Typical bar (if all granted) | Drawer only |
|---|---|---|---|
| Developer (5) | Dashboard, Tasks, My Day, QA, Tickets, Sprints | Dashboard, Tasks, My Day, QA, Menu | Tickets, Sprints |
| QA (4) | QA, Dashboard, Tasks, My Day, Tickets, Sprints | QA, Dashboard, Tasks, My Day, Menu | Tickets, Sprints |
| Tech Lead (3) | Dashboard, Tasks, Sprints, My Day, QA, Tickets | Dashboard, Tasks, Sprints, My Day, Menu | QA, Tickets |
| Project Manager (2) | Dashboard, Sprints, Tasks, Tickets, My Day, QA | Dashboard, Sprints, Tasks, Tickets, Menu | My Day, QA |
| CTO (1), roles 7-9 | Dashboard, Tasks, Sprints, Tickets, My Day, QA | Dashboard, Tasks, Sprints, Tickets, Menu | My Day, QA |
| Client (6) | Tickets, Dashboard, Tasks, Sprints, My Day, QA | Tickets, Dashboard (+ any others granted), Menu | rest |
Cases called out: **Client (2 granted modules)** -> bar = Tickets, Dashboard, Menu (3 items; items stretch equally). **CTO** -> bar of 4 modules + Menu; My Day and QA in the drawer, and My Day carries the unfiled cue (see 4.4). Landing tab = first bar item (unchanged); with 0 modules the landing screen is the Menu route.

### 1.4 Item labels in the drawer (decision)
Drawer module rows use the **server `menu_name`** (fallback: fixed module `title`). Reason: parity with the web sidebar and with the vocabulary users already use ("Task Board"); More already shows `menu_name`. The bar keeps the **fixed short titles** (Dashboard, Tasks, My Day, QA, Tickets, Sprints) because they must fit 64dp. Accessibility label of every module row keeps today's More format so the module is identifiable by both names:
`{menu_name}. {Can edit|View only}. Opens {title}` (+ `. Not filed yet` for My Day when unfiled, + `. Current page` for the current module). The visible access-level badges stay removed (a11y only), as in More today.

---

## 2. Components and files (what to build)

| New / changed | Purpose |
|---|---|
| `components/ui/Drawer.tsx` (new) | The drawer shell: Modal, scrim, panel, animation, close behaviors, focus. Props below. |
| `navigation/DrawerContent.tsx` (new) | The drawer body: account block, modules, disclosure, empty/stale states, footer. Replaces `screens/HomeScreen.tsx` (delete after migrating; keep helper `levelOf`). |
| `navigation/DrawerContext.tsx` (new) | `{ open, openDrawer(openerRef?), closeDrawer(then?), currentTab }` provided by `AppTabs`. Local state (not zustand) so it dies with `AppTabs` on sign-out. |
| `navigation/dirtyGuard.ts` (new, extracted) | `confirmLeaveDirtyDay(proceed: () => void): boolean`: the existing My Day Alert ("Discard changes?" / "You have unsaved changes to your day." / "Keep editing" / "Discard" -> `requestDiscard()` then `proceed()`). `AppTabs` `tabPress` and the drawer both call it. |
| `hooks/useSignOut.ts` (new, extracted from `ProfileScreen`) | `{ confirmSignOut, busy }` = the existing `confirmSignOut` body (time-boxed checks, `buildSignOutDialog`, Alert, `openModule('MyDay')`) + `signingOut`/`checking`. `ProfileScreen` and the drawer both use it. Pure extraction, no behavior change. |
| `AppTabs.tsx` | Replace the `More` screen with `Menu` (4.1), add the provider and `<Drawer/>`, track `currentTab`, extend `tabPress`. |
| `PageHeader.tsx` | `variant="tab"` renders a leading hamburger when a `DrawerContext` exists (3.2). Push variant unchanged. |
| `navigation/moduleIcons.ts`, `components/ui/Icon.tsx` | `More` key becomes `Menu`; add glyphs `menu`, `menu-outline`, `log-out-outline` to `ICON_NAMES` (the glyph test verifies they exist). |
| `navigation/types.ts` | `AppTabParamList`: `More` -> `Menu`. |
| `app.json`/package | none |

`Drawer` props: `{ visible: boolean; onRequestClose(): void; onClosed?(): void; children; accessibilityLabel?: string }`. It owns mount/animation only; content and actions are the caller's.

---

## 3. Drawer spec

### 3.1 Geometry and structure
- **Width** `min(320, 0.85 * windowWidth)`, minimum 256. (320dp phone -> 272, 360 -> 306, 430 -> 320.) Height = full window; panel is edge-to-edge (draws behind the status and navigation bars), content padded by insets.
- **Panel** background `t.colors.surface`, right border `line` 1dp, elevation `lg` on iOS shadow / Android `elevation`; dark mode: border only (shadows are invisible).
- **Scrim** `t.colors.scrim` (existing 50% token). Not focusable for screen readers (its role is replaced by the Close button); testID `drawer-scrim`.
- **Order, top to bottom** (360x640 estimate in brackets):
  1. Top inset padding.
  2. **Brand row** (56): wordmark text "TaskTracking" (`lg bold`, `accessibilityRole="header"`) left; icon-only Close button right (44/48, `close` 24, label `Close menu`, hitSlop 4).
  3. **Offline notice** (`OfflineBanner`, only when offline, 32). Reused component; it is already a live region.
  4. **Account block** = ONE pressable (72): `Avatar` 40 (initials), name (`base semibold`, 1 line ellipsis, `maxFontScale` 1.3, up to 2 lines at >= 130% text), role (`xs muted`), trailing `chevron-forward`. `accessibilityRole="button"`, `accessibilityLabel="Profile and settings"` (kept), `testID="open-profile"` (kept). Visible text is the name and role; **Label-in-Name:** the visible name and role must be part of the accessible name, so the label = `Profile and settings. {name}, {role}`; the exact-string tests that use `getByLabelText('Profile and settings')` must use a regex `/^Profile and settings/` (listed in 6.3).
  5. **Scroll body** (flex 1, `ScrollView`, `showsVerticalScrollIndicator` true when it overflows):
     - Section label `MODULES` (`xs semibold subtle`, header role; same string as today) with the module rows (4.2). Rows 56dp each.
     - Disclosure row "Not available in this version yet" + count (4.5), only when `webOnly.length > 0`.
     - Stale banner / empty state (4.8) when applicable.
  6. **Footer** (fixed, border-top `line`, padding 12/16 + bottom inset): `Sign out` button (4.6); optional version line (4.7).
- **Estimated content height**, 6 modules + unfiled badge: 24 + 56 + 72 + 28 + 6x56 + 48 + 80 = ~644dp > 640dp window, so the body scrolls on 640dp-high phones while the footer stays visible (fine). At 150% text the rows grow; nothing is clipped because only the body scrolls.

### 3.2 Open triggers
| Trigger | Where | Spec |
|---|---|---|
| **Hamburger** | `PageHeader variant="tab"`, **leading** (left of the title) | 44x44 (Android 48), `menu` icon 24, `tone default`, `accessibilityRole="button"`, `accessibilityLabel="Open menu"` (when My Day is unfiled and not a bar item: `Open menu, My Day not filed yet`), `accessibilityState={{expanded: open}}`, `testID="open-drawer"`. Header row becomes `[hamburger][title (flex)][trailing]`; left padding 4, title keeps `xl bold`. Project chip stays `trailing` (max 55%). At 320dp the title may wrap to 2 lines (already allowed). The hamburger shows only when a `DrawerContext` is present, so `PageHeader` rendered elsewhere (tests, Login error screens) is unchanged. |
| **Menu bar item** | 5th bottom-bar item | 4.1 |
| **Swipe from the left edge** | **NOT implemented.** An edge `PanResponder` on a tab screen fights the Android 10+ system back gesture (same edge) and ScrollViews/horizontal chip rows; unreliable in core RN without gesture-handler. Documented decision: skip. |
| Swipe left on the open panel | Inside the drawer only | **P2.** `PanResponder` on the panel: capture when `dx < -12 && |dx| > 2|dy|`; close when `dx < -60` or `vx < -0.5`; otherwise spring back (120ms). Vertical scrolling of the body must keep working (needs verification). |
| Pushed screens | `PageHeader variant="push"` | **Back only, no hamburger** (they are detail views; Back is the correct affordance). The drawer is reachable again on return to a tab. |
Opening always calls `Keyboard.dismiss()` first. Opening is ignored if a toast/Alert is irrelevant; it is ignored (no-op) while `TimerStatusPromptSheet` is visible (the sheet's scrim already blocks the screen).

### 3.3 Close behaviors
Scrim tap, Close button, Android hardware Back (Modal `onRequestClose` -> close drawer first, the screen's own Back handlers do not run), item navigation (4.2), and the P2 swipe. Closing returns accessibility focus to the opener (hamburger: `AccessibilityInfo.setAccessibilityFocus` on its ref; Menu item: skip, TalkBack/VoiceOver restore focus themselves). Verify on device.

### 3.4 Menu bar item and Menu route (bar spec, section 3 of the request)
- Route name `Menu` (was `More`) with component `MenuTabScreen`: when `granted.length > 0` it renders `null` (the route is never focused because the press is intercepted); when `granted.length === 0` it renders the hosted frame: `PageHeader tab title="Menu"` + `EmptyState icon="lock-closed-outline" title="Nothing here yet" message="Your role has no screens enabled for mobile. Ask an administrator for access." action={{label:'Open menu', onPress: openDrawer}}`.
- `screenListeners.tabPress`: for `route.name === 'Menu'`: `e.preventDefault(); openDrawer(); return;` BEFORE the dirty-day check (opening a drawer does not leave My Day). All other routes keep the existing guard, now via `confirmLeaveDirtyDay`.
- Custom `tabBarButton` for Menu (`MenuTabButton`): same ripple/hover as `TabButton`, but **no active indicator ever**, `role="button"` (not `tab`), `accessibilityState={{expanded: open}}`, `accessibilityHint="Opens the navigation menu"`. Label `Menu` (`TabLabel`, 12px, same cap/fit rules), icon `menu` 24 (single glyph, no filled/outline pair), `tabBarAccessibilityLabel`: `Menu` or `Menu, My Day not filed yet`. Label-in-Name satisfied.
- **Unfiled dot** on the Menu icon (same `dotWarn` dot as today's More) when My Day is granted, unfiled and NOT one of the bar items. If My Day is a bar item the dot sits on that item, and the Menu item has none (unchanged logic: `moreDot`).
- `tabBarHideOnKeyboard: true` stays (the Menu item hides with the bar; the hamburger remains reachable).
- **5 items at 320dp:** 64dp each. Labels unchanged from today (12px semibold/medium, `adjustsFontSizeToFit`, min scale .85, `maxFontScale` 1.15); "Menu" is no longer than "More", so the fit risk is unchanged. Longest label "Dashboard" is the existing risk (Needs on-device verification at 320dp and at 130%/150% text). **Large-text rule:** bar labels never exceed 1.15x and never wrap (numberOfLines 1); the bar height stays 56 + inset; the drawer is where large text is read.
- Selected state cannot be "Menu" (the route never focuses), so the bar always shows exactly one active module (or none when 0 modules).

---

## 4. Drawer content, states and flows

### 4.1 Current-module detection
`AppTabs` keeps `currentTab: ModuleName | null` from `Tab.Navigator screenListeners` `focus` event (`focus: () => setCurrentTab(route.name)`), initial = first bar item. The drawer highlights the row whose `name === currentTab`. If a pushed screen is on top of Main the drawer cannot be opened (Back is shown instead), so `currentTab` is always the visible tab.

### 4.2 Module row (`ListRow`-style, `Pressable`)
- Layout: icon 24 (module glyph, `off` variant, `tone brand` for the current module uses `on` variant), label `base medium` (current: `semibold`), 1-2 lines (2 at large text), trailing slot (My Day unfiled badge). Min height 56 (Android 56 >= 48), horizontal padding 16, gap 12.
- **Current module (non-colour cues, all three):** 3dp indicator bar on the left edge (colour `indicator`), filled icon variant, semibold label; plus `brand50` background (decorative). `accessibilityState={{selected: true}}`, label suffix `. Current page`. Contrast: label `fg` on `brand50` 15.9+ (light, from existing tokens), indicator 6.29 on surface.
- Press feedback: Android ripple `t.colors.ripple`, iOS `hover` background.
- **Trailing badge** only for My Day when unfiled: `Badge label="Not filed yet" tone="warning" icon="alert-circle"` (same as More); no badge on other rows.
- Role/state: `accessibilityRole="button"`; testID `drawer-item-{name}` (e.g. `drawer-item-Tasks`).
- Behavior by case (all close the drawer first, then act after the slide-out finishes; with reduced motion immediately):
| Row pressed | Action |
|---|---|
| Current module | Close only. No navigation. |
| Another module that is a **bar item** | `confirmLeaveDirtyDay(() => nav.navigate('Main', {screen: name}))` (the guard is skipped when the target is My Day or nothing is dirty) |
| A module that is **drawer-only (overflow)** | Same guard, then `nav.navigate('Module', {name})` (pushed, Back). This is what `useOpenModule` already decides: call `openModule(name)` inside the guard. |
| `Profile and settings` | Same guard (see 4.3), then `nav.navigate('Profile')`. |

### 4.3 My Day dirty guard (the rule)
`useDirtyGuard.getState().dirty` is true only while My Day is focused with unsaved edits, and the drawer (a Modal) does not change navigation focus, so it is still accurate when the drawer is open. Every drawer action that **leaves** the current screen (module row other than My Day, Profile, Sign out) first closes the drawer, then calls `confirmLeaveDirtyDay(proceed)`: if not dirty it calls `proceed()` immediately; otherwise the existing Alert (`Discard changes?` / `You have unsaved changes to your day.` / `Keep editing` (cancel) / `Discard` (destructive: `requestDiscard()` then `proceed()`)). Opening the drawer, closing it, and pressing the Menu item never trigger the guard. This keeps parity with today (the More tab press was guarded).

### 4.4 Unfiled-day cue
Source unchanged: `useDailyPending(hasMyDay).data.needsSubmit` computed in `AppTabs`. Cue locations: My Day bar item dot (when My Day is a bar item), Menu bar item dot and hamburger label (when My Day is drawer-only), `Not filed yet` badge on the My Day drawer row (always, when unfiled).

### 4.5 "Not available in this version yet" disclosure
Identical to More today, moved into the drawer body below the modules: `Pressable` row (min 44, `web-only-toggle` testID kept, text `Not available in this version yet`, count, chevron up/down, `accessibilityLabel="Not available in this version yet, {N}"`, `accessibilityState={{expanded}}`). **Collapsed every time the drawer opens.** Expanded: non-interactive neutral rows (`opacity .85`), label `{menu_name}. {Can edit|View only}. Not available in this version yet.` Hidden when there are none. Expanding scrolls nothing automatically (the user is already at that point in the list).

### 4.6 Sign out placement and flow
- Fixed footer button: `Button variant="dangerOutline" label="Sign out" icon="log-out-outline" fullWidth` (44/48), `loading={signingOut || checking}`. It sits last and apart from navigation items (destructive, not adjacent to module rows).
- Flow: press -> `confirmLeaveDirtyDay(() => confirmSignOut())`. **The drawer stays open while `confirmSignOut` runs** (its checks take up to 3s and the button spinner is the only feedback) and while the native Alert is shown. Alert buttons: `Cancel` -> drawer stays open; `Sign out`/`Sign out anyway` -> existing `logout()`; the navigator swaps to the auth stack and the drawer unmounts with `AppTabs`; `Review & submit` -> close the drawer, then `openModule('MyDay')`. Dialog strings are unchanged (`buildSignOutDialog`). **Needs on-device verification (iOS):** presenting a native `Alert` while an RN `Modal` is visible. Fallback if it fails: close the drawer first (wait for the slide-out), show a short toast `Checking before sign out...`, then run `confirmSignOut`.
- Profile screen keeps its own Sign out button (same hook).

### 4.7 Version footer (P2)
Single `xs subtle` line `TaskTracking {version}` below Sign out. Source: `expo-constants` `Constants.expoConfig?.version` ONLY with the lead's approval of declaring `expo-constants` (it is already installed transitively by `expo` but not in `package.json`); otherwise import the version from `app.json` if `tsconfig` has `resolveJsonModule`, otherwise omit. Do not hard-code the string. No test depends on it.

### 4.8 Body states
| State | Drawer body |
|---|---|
| Normal | account block + modules (+ disclosure) |
| Menus refetch failed (stale) | `StaleBanner` above `MODULES` (same text as today) |
| No granted mobile modules AND no mobile menus | `MODULES` section replaced by the same empty message as today: title `Nothing here yet`, message `Your role has no screens enabled for mobile. Ask an administrator for access.` (compact, centred, `lock-closed-outline`); Profile and Sign out remain |
| Granted modules = 0 but web-only menus exist | empty message under `MODULES` + the disclosure |
| Menus loading / load failed | unreachable from the drawer (`AppTabs` shows its own loading/error screen before the navigator mounts); the drawer is not rendered there |
| Offline | `OfflineBanner` row under the brand row (text unchanged); navigation still works |
| Theme | no theme switch in the drawer. Decision: theme stays in Profile (single source of truth, saves ~70dp of drawer height, no duplicate control to test). One tap deeper (Account block -> Appearance). |

### 4.9 Animation
| Part | Open | Close |
|---|---|---|
| Panel `translateX` | `-width` -> 0, `motion.slow` 300ms, `Easing.out(Easing.cubic)` | 0 -> `-width`, `motion.base` 200ms, `Easing.in(Easing.cubic)` |
| Scrim opacity | 0 -> 1, same duration/easing as the panel | 1 -> 0 |
`useNativeDriver: true` (transform and opacity only). The Modal uses `animationType="none"`, `transparent`, `statusBarTranslucent`, `navigationBarTranslucent` (Android); it stays mounted until the close animation ends (`onClosed`). **Reduced motion** (`useReducedMotion()`): durations 0, no translate (panel appears fully), scrim appears instantly; `onClosed` fires synchronously. Respect `animationsEnabled()` (`lib/motion`) so Jest does not wait on timers. No animation inside rows.

### 4.10 Safe area / edge-to-edge
Panel padding: top `insets.top` (brand row below the status bar), bottom `insets.bottom` (Sign out and version stay above the Android 3-button/gesture bar), left `insets.left`. The panel is drawn under the status bar (translucent) with `surface` background so no gap shows. Needs on-device verification on Android edge-to-edge and iOS notch devices.

### 4.11 Z-order and overlap rules
1. The drawer is a Modal, above the tab content, `PageHeader` strips (offline/timer), tab bar and root toasts.
2. **Toasts:** `Drawer` calls `useToastSheet(visible)` exactly like `BottomSheet`, so toasts mount inside the drawer Modal (top, `ToastView`) while it is open. A toast may overlap the brand row; it is dismissible (existing X).
3. **Sheets:** only one Modal at a time. If `TimerStatusPromptSheet` becomes visible while the drawer is open (async prompt after a timer start), the drawer closes immediately (no animation wait, no navigation) and the sheet shows. Other sheets are opened from screen content, which the drawer scrim blocks.
4. **Native Alerts** (guard, sign out) are shown after the drawer has closed, except the sign-out flow (4.6).
5. **Session loss while open** (401/expiry, sign out): `AppTabs` unmounts and the Modal goes with it; all deferred actions (`closeDrawer(then)`) check `captureSession()` (existing helper) before navigating and do nothing if the epoch changed.
6. The running-timer strip stays in `PageHeader` below the scrim; while the drawer is open it is dimmed and not focusable (the Modal's `accessibilityViewIsModal`).

### 4.12 Focus, roles, exact strings
| Element | role | accessibilityLabel | state / notes |
|---|---|---|---|
| Panel | none (container) | `Navigation menu` | `accessibilityViewIsModal` (iOS); first focus on the brand title |
| Brand title | header | `TaskTracking` (visible text) | |
| Close button | button | `Close menu` | |
| Scrim | none | none (hidden from AT) | `testID drawer-scrim`; closes on press |
| Account block | button | `Profile and settings. {name}, {role}` | `testID open-profile` |
| Module row | button | `{menu_name}. {Can edit|View only}. Opens {title}[. Not filed yet][. Current page]` | `selected` on the current row; `testID drawer-item-{name}` |
| Disclosure | button | `Not available in this version yet, {N}` | `expanded`; `testID web-only-toggle` |
| Web-only row | none | `{menu_name}. {level}. Not available in this version yet.` | disabled-looking, not focusable as an action |
| Sign out | button | `Sign out` | busy while checking |
| Hamburger | button | `Open menu` or `Open menu, My Day not filed yet` | `expanded` |
| Menu bar item | button | `Menu` or `Menu, My Day not filed yet` | hint `Opens the navigation menu`; `expanded` |
Screen-reader order: brand row, offline notice, account block, MODULES header, module rows, disclosure, footer. Focus never lands behind the scrim. Keyboard: no text inputs in the drawer; the keyboard is dismissed on open. Hardware keyboard Tab order follows the same order.
RTL: not required. Orientation: portrait only.

### 4.13 Flow / state tables

**Navigation outcomes** (drawer open over tab X; `dirty` = My Day unsaved edits while on My Day)
| Action | Not dirty | Dirty (X = My Day) |
|---|---|---|
| Row = current module | close | close |
| Row = other bar module | close, navigate tab | close, Alert; Keep -> stay on My Day; Discard -> discard + navigate |
| Row = My Day while on another tab | close, navigate | (dirty cannot be true: X != My Day) |
| Row = drawer-only module | close, push `Module` | close, Alert, then push |
| Account block | close, push Profile | close, Alert, then push |
| Sign out | checks + Alert (4.6) | Alert (discard) first, then checks + Alert |
| Menu bar item / hamburger | open drawer | open drawer (no Alert) |
| Back / scrim / Close / swipe | close | close (no Alert) |

**Race and overlap**
| Situation | Behavior |
|---|---|
| Drawer open, session expires or sign-out completes | drawer unmounts with `AppTabs`; no navigation executes (`captureSession`) |
| Drawer opened twice quickly (hamburger double tap) | second open ignored while `open` or animating |
| Close then immediate re-open before `onClosed` | animation reverses from the current value; `onClosed` for the first close is cancelled |
| Item pressed twice | first press closes; second is ignored (`pendingAction` ref set) |
| Toast arrives while open | shown inside the drawer Modal |
| Timer status prompt arrives while open | drawer closes immediately, sheet shows |
| Offline toggles while open | `OfflineBanner` row appears/disappears (live region) |
| Menus stale refresh fails while open | `StaleBanner` appears in the body |
| Pending-day result changes while open | the `Not filed yet` badge and dots update |
| App backgrounded while open | stays open (state is local); on return it is still open |

---

## 5. Wireframes (360 x 640, light; `[ ]` = control, `(i)` = icon)

**Tab screen, drawer closed**
```
status bar ------------------------------------------------
[ (=) ]  Tasks                         [ (o) All Projects v ]   PageHeader tab: hamburger + title + project chip
[ (timer strip when running) ......................... Stop ]
 ... screen content ...
--------------------------------------------------------------
 | (grid)  | (list)  | (today)•| (shield) | (=)    |            bottom bar, 5 items, 56dp
 Dashboard   Tasks     My Day     QA        Menu              • = unfiled dot (My Day) ; indicator bar on the active tab (not on Menu)
```
**Drawer open (panel 306dp, scrim right)**
```
+-------------------------------+//////////////////
| status bar                    |/// scrim 50% ///
| TaskTracking              [X] |//////////////////
|-------------------------------|//////////////////
| (offline notice, if offline)  |//////////////////
| (AJ)  Aditya Jadhav        >  |//////////////////   account block -> Profile and settings
|       Developer               |//////////////////
|-------------------------------|//////////////////
| MODULES                       |//////////////////
|#(grid) Dashboard              |  # = 3dp indicator + filled icon + semibold + tint (current)
| (list) Task Board             |//////////////////
| (today) My Day [! Not filed yet]|/////////////////
| (shield) QA                   |//////////////////
| (ticket) Tickets              |//////////////////   drawer-only modules continue here
| (flash) Sprints               |//////////////////
| Not available in this version yet  3  v |/////////
|                                |/////////////////
|-------------------------------|//////////////////
| [ (->) Sign out ]             |//////////////////   dangerOutline, full width
| TaskTracking 0.1.0            |//////////////////   xs subtle (P2)
| bottom inset                  |//////////////////
+-------------------------------+//////////////////
```
**150% text note (Needs on-device verification):** module labels grow to 21px and may wrap to 2 lines (rows grow, min 56); the account block name wraps to 2 lines; the body scrolls and the footer (Sign out) remains visible; bar labels stay capped at 1.15x; the hamburger and Close buttons keep 44/48dp. Panel width does not change.

**Zero modules**
```
[ (=) ]  Menu
        (lock icon)
   Nothing here yet
   Your role has no screens enabled for mobile. Ask an administrator for access.
   [ Open menu ]
 | (=) Menu |      <- only bar item
```

---

## 6. Test and acceptance list

### 6.1 Functional (each is a test the developer or QA can write)
1. Developer with Dashboard, Tasks, My Day, QA, Tickets, Sprints granted: bar items are `Dashboard, Tasks, My Day, QA, Menu` (no `More`); `getByLabelText('Menu')` exists; pressing it opens the drawer; tab route does not change.
2. The drawer lists all six modules in role order using `menu_name`; `Tickets` and `Sprints` are listed and open as pushed `Module` screens with Back.
3. Client with 2 granted modules: bar is `Tickets, Dashboard, Menu`.
4. Zero granted modules: only `Menu` in the bar, screen shows `Nothing here yet` + `Open menu`; pressing it opens the drawer with Profile and Sign out; no module rows.
5. `is_visible_on_mobile=false` or ungranted menu: the module is absent from bar AND drawer (never invented).
6. Hamburger `Open menu` appears on every tab screen header and on no pushed screen (Back present instead); `PageHeader` without a provider renders no hamburger.
7. Close paths: Close button, scrim press, Android back (`BackHandler`/Modal `onRequestClose`) close the drawer; Back closes the drawer before navigating.
8. Current module row has `accessibilityState.selected === true` and label ending `Current page`; pressing it closes without navigating.
9. Pressing a bar-module row navigates to that tab; a drawer-only row pushes `Module`.
10. My Day dirty: pressing another module row, `Profile and settings`, or `Sign out` shows `Discard changes?`; `Keep editing` leaves everything unchanged; `Discard` calls `requestDiscard` then navigates. Pressing Menu or hamburger does not show the Alert.
11. Sign out from the drawer: shows the existing dialog (unfiled day / running timer variants from `buildSignOutDialog`), `Sign out anyway` calls `logout`; button shows loading during checks; `Review & submit` closes the drawer and opens My Day.
12. My Day unfiled: dot on the My Day bar item; when My Day is drawer-only the dot is on `Menu` and the label is `Menu, My Day not filed yet`; the drawer row shows `Not filed yet`; hamburger label gains `, My Day not filed yet`.
13. Disclosure: collapsed by default every open; toggling sets `expanded`; counts match `mobileMenus` not mapped to a module; rows are not pressable.
14. Offline: `OfflineBanner` visible inside the drawer; navigation still works.
15. Toast shown while the drawer is open is visible inside the Modal (`useToastSheet`).
16. Timer status prompt becoming visible closes an open drawer.
17. Session expiry while open: no navigation after unmount; no errors.
18. Reduced motion: no animation, drawer closes and `onClosed` fires synchronously.
19. Keyboard open when pressing hamburger: keyboard dismissed.
20. Existing behaviors unchanged: tab order per role (`TAB_PRIORITY`), `useOpenModule` return values, timer/offline strips in `PageHeader`.

### 6.2 Accessibility acceptance (WCAG 2.2 AA)
- All targets >= 44dp (Android >= 48 where specified): hamburger, Close, rows (56), account block (72), disclosure (44), Sign out, Menu item (56).
- Current module = indicator bar + filled icon + semibold + tint + `selected` state (no colour-only cue).
- Visible text is contained in the accessible name for every control (Label-in-Name), including the account block and `Sign out`.
- Contrast: row label `fg` on `surface` 17.74 / 15.68; current row `fg` on `brand50` > 14; disclosure text `fgMuted` 7.56 / 8.99; `Not filed yet` badge 4.84 light / 10.87 dark; Sign out `danger.fg` on `surface` 6.47 / 9.42; indicator 6.29 / 6.57 (non-text >= 3:1).
- Drawer is modal (focus and AT order inside it), closes with Back, labelled.
- Text at 150%: no clipping, no horizontal scroll; footer reachable.
- Reduced motion honoured.

### 6.3 Existing tests that must change (same step)
| Test file | Change |
|---|---|
| `RootNavigator.test.tsx` (lines ~92-96), `navigationModules.test.tsx` (88-92, 225, 258), `navigationChrome.test.tsx` (129, 155, 159-280 `pressTab('More')`, `More` heading), `tabsOverflow.test.tsx` (107-194), `staleData.test.tsx` (100) | `More` tab -> `Menu` item; "open More" becomes "press Menu, then query the drawer" (Modal content queries). Profile/webOnly/overflow assertions move into the drawer (same testIDs `open-profile`, `web-only-toggle`). The "More" heading assertions are removed (there is no More screen). |
| Tests using `getByLabelText('Profile and settings')` | label is now `Profile and settings. {name}, {role}`: use a regex or `getByTestId('open-profile')`. |
| `ProfileScreen.test.tsx` | sign-out logic now comes from `useSignOut`; assertions on dialogs unchanged. |
| Icon glyph test | add `menu`, `menu-outline`, `log-out-outline`. |
Unchanged: `TaskDetailScreen` "More" tab (a different component), all `TAB_PRIORITY` tests (order function unchanged).

---

## 7. Implementation order for the developer (P0/P1/P2)
1. **P0** Extract `dirtyGuard.ts` and `useSignOut.ts` (no behavior change; run tests).
2. **P0** `Drawer.tsx` + `DrawerContent.tsx` + `DrawerContext` + `Menu` route and bar item + hamburger in `PageHeader`; remove the `More` tab and `HomeScreen` after content parity (tests 6.1 #1-#17).
3. **P1** Current-module tracking, close-on-prompt, `captureSession` guards, focus return, `useToastSheet`.
4. **P1** Offline notice in drawer, stale/empty states, `Not filed yet` cue propagation to hamburger/Menu.
5. **P2** Swipe-left-to-close, version footer (needs the approval note in 4.7).
Risk: medium. The riskiest items are the iOS Alert over a Modal (4.6 fallback ready) and Android Back with the Modal (verify). Do not change `TAB_PRIORITY`, `grantedModules`, `splitModules`, `useOpenModule` semantics, or module gating.

---

## 8. On-device checklist for the lead (12 items)
1. Bottom bar shows modules + **Menu**; no "More"; the active module has a bar on top; Menu never looks selected.
2. Tap **Menu**: the drawer slides in from the left in about 0.3s, scrim dims the screen; tap the dark area: it closes.
3. Tap the **hamburger** on Tasks/Dashboard/My Day headers: same drawer; pushed screens (a task, Profile) show **Back**, not the hamburger.
4. The drawer shows your name and role, all your modules (names as on the web, e.g. Task Board), the current one clearly marked, and My Day shows "Not filed yet" when relevant.
5. Android Back button closes the drawer first (not the app/screen). Check with the drawer open on My Day too.
6. Tap another module in the drawer: drawer closes, screen changes. Tap the current one: just closes.
7. On My Day, type a note without saving, open the drawer and tap another module: you get the "Discard changes?" prompt; Keep editing leaves the note intact.
8. Drawer > **Profile and settings** opens Profile (theme there); Back returns.
9. Drawer > **Sign out** shows the usual checks/dialog (try with an unfiled day or a running timer); on iOS confirm the dialog appears over the open drawer.
10. Offline (airplane mode): the drawer shows the offline notice and still navigates.
11. Phone font size at 150% and a 320-360dp screen if available: drawer rows wrap, Sign out stays visible, bar labels do not wrap; also check light and dark and the gesture/3-button navigation bar (drawer footer clear of it).
12. With a timer running: start a timer, open the drawer (strip is dimmed), then a "move status" prompt appearing closes the drawer cleanly; and enable "Remove animations" in system settings: the drawer appears/disappears without sliding.
