# TaskTracking mobile: UX design plan (Phase 2)

Owner: UI/UX designer. Implementer: senior-react-native-developer. Status: binding lead decisions applied.
Scope: `task-tracking-app` only. The web app is NOT changed. Every token change below is MOBILE-ONLY and listed as a web divergence in section 2.8.

Verification statement: this plan is derived from reading source (Phase 1 audit plus targeted re-reads of the API's `qaService.js`/`taskService.js` and web `TicketDetailPage.jsx`). Nothing has been seen rendered. Every pixel height, wrap and clipping claim is an estimate and **Needs visual verification** on the lead's phone after an APK build. Contrast ratios are computed from the token values (WCAG relative luminance); they are exact for the pairs listed.

Conventions: "dp" = density-independent pixels (RN units). `t` = `useTheme()`. P0 = must ship (fixes a High/Critical finding), P1 = should ship, P2 = nice, cut first.

---

## 0. Decisions that resolve the open questions

| Q | Decision |
|---|---|
| Q1 My tasks | A `Mine` filter chip on Tasks sends the existing `assignedTo=<me>` filter (API matches dev/qa/support OWNER columns only). Default OFF (default ON would silently hide tasks where the user is only a roster assignee). When active, helper text under the chips says so. The reliable "what do I work on today" surface is Dashboard "Today's focus" (developer-stats includes roster assignees), moved above the KPIs. |
| Q2 Tab priority | Role-aware presentation order in section 4.2. Still only server-granted AND `is_visible_on_mobile !== false`; modules not in a role's priority list keep registry order after it. |
| Q3 Start timer | Stays on Task Detail. Quick Start (icon button) only on Developer dashboard "Today's focus" rows where the user is a task OWNER (`dev_owner_id`/`qa_owner_id`/`support_owner_id` === me). Never on list cards. If another timer is running, confirm with a native Alert first (section 5.2). |
| Q4 Ticket controls | Verified web `TicketDetailPage.jsx` has no role gating of status/assignee controls (only filters Clients out of the assignee list). Mobile keeps parity. Raised as a permissions question to the lead (section 9). |
| Q5 Fail confirms | Verified in the API: a test-case Fail increments `task.reopen_count` (`qaService.js:87-89`); a task-level move to **REOPEN** increments it (`taskService.js:665-668`); a task-level move to FAIL does NOT. So: keep the test-case Fail confirm; ADD a confirm for task-level **Reopen** (verdict card, inline subtask rows if offered, status prompt choice) with accurate copy; do NOT add a reopen-count confirm to task-level Fail. |
| Q6 Overdue mismatch | No data change. Dashboard "Overdue" KPI gets an info icon opening a small explainer sheet (copy in 5.2). |
| Q7 Roles 7-9 | Keep the CTO dashboard view and the CTO tab priority. |
| Q8 Type floor | Mobile `2xs` becomes 12px (web 11px). Intentional divergence. |
| Q11 Read-only | Sprints and Dashboard stay read-only. Page header supports a trailing action slot so a future "New task" primary action can be added; nothing is drawn now. |
| Q12 | Developer verifies structure/bundling only; the lead signs off visually on a phone. |

---

## 1. Design principles and hierarchy rules

1. **Do the job first.** The thing the user came to do (see their work, file the day, give a verdict) is the first thing below the header. Counts and summaries come after the action list, never before it (exception: manager dashboards, where the status summary is the job).
2. **Chrome budget.** On list screens, fixed (non-scrolling) chrome above the list is at most 136dp of content (header row 52 + search row 44 + gaps). Everything else scrolls with the list.
3. **One way to do one thing.** One header, one back pattern, one sheet, one toast, one status badge, one empty/error pattern, one set of button variants. Chips are for filters only; tabs for views; buttons for actions.
4. **Never colour alone.** Every status, priority, state and tab selection has a text or shape cue (icon, border, weight, indicator) in addition to colour. Red is reserved for: Critical priority, blocked/QA-overdue flags, overdue dates, destructive actions, errors.
5. **Honest and recoverable.** Say what the data is (owner-only "Mine", display-only 8h target), keep drafts, show why something is disabled, confirm only what is hard to undo or has a side effect (reopen count, timer switch, submit day, delete), never auto-dismiss an error unread.
6. **Thumb-first, text-safe.** 44dp targets minimum (48dp where feasible on Android), primary actions in the lower half or a sticky footer, no fixed pixel widths around text, user font scaling stays ON (only tight elements are capped).
7. **Reuse before inventing.** Existing tokens, status/priority semantics, a11y work and behaviors are preserved; new components consolidate duplicated patterns, they do not add features.

**Hierarchy rule per screen type**

| Type | Order, top to bottom |
|---|---|
| Tab list screen (Tasks, Tickets, Sprints, QA) | PageHeader (title + project chip) -> search (+ filter button) -> [scrolls] filter chips + count -> list. |
| Detail screen | PageHeader (back + context title) -> identity (code, title, badges) -> action row (primary action + one secondary) -> sticky tab strip -> content. |
| Form / My Day | Header -> status and context (date, target) -> fields in task order -> sticky footer with one primary action (+ one secondary). |
| Dashboard | Header -> role action lists (Today's focus etc.) -> compact KPIs -> secondary lists. Managers: compact KPIs first, then lists. |
| Sheet | Grab handle -> title row (Cancel/Close) -> scrollable body -> sticky footer (form sheets only). |
| Settings (Profile) | Account -> Appearance -> Sign out (destructive, last). |

---

## 2. Token spec (mobile-only)

All values live in `src/theme/tokens.ts` (the only file with raw values) and are exposed through `useTheme()`. No feature file contains a literal colour, font size or off-scale spacing after step 1.

### 2.1 Type scale and fonts

Font: **Inter** (approved) via `@expo-google-fonts/inter`, loaded with `expo-font` `useFonts`. Android needs one family per weight, so `Text` maps `weight` to a family and does NOT set `fontWeight` when a custom family is active (avoids synthetic bold).

| `weight` | family name |
|---|---|
| regular (400) | `Inter_400Regular` |
| medium (500) | `Inter_500Medium` |
| semibold (600) | `Inter_600SemiBold` |
| bold (700) | `Inter_700Bold` |

Fallback: if fonts are not loaded within 2500ms the splash is released and `Text` uses the system font (`fontFamily` undefined, `fontWeight` as today). Numeric text (clock, durations, KPI, tables) uses `fontVariant: ['tabular-nums']` (Inter supports it).

| key | size/line (new) | web | typical use |
|---|---|---|---|
| `2xs` | **12/16** | 11/16 | badge, meta, code. Mobile floor is 12. |
| `xs` | 12/18 | same | secondary meta, helper, errors |
| `sm` | 13/20 | same | secondary body, button-compact, chip |
| `base` | 14/22 | same | body |
| `lg` | 16/24 | same | card title, button, input text |
| `xl` | 18/26 | same | screen title (tab), detail title |
| `2xl` | 22/30 | same | KPI/section emphasis (no longer the screen title) |
| `3xl` | 28/34 | same | KPI value, login wordmark |
| `4xl` | 36/40 | same | unused (keep) |

Rules: tab screen title = `xl bold` (was 2xl); detail title = `xl bold` (was 2xl, long titles stop dominating); card title = `lg semibold`, max 2 lines; meta = `xs` or `2xs` muted/subtle only; never body text below 12.

`maxFontSizeMultiplier` (new `Text` prop `maxFontScale`, forwarded to RN): tab labels 1.15; Badge 1.3; KPI value 1.3; Avatar letter 1.2; compact Button label 1.3; PageHeader title 1.5. Everything else uncapped (system maximum).

### 2.2 Spacing

Allowed values only: `2` (text stacks only), `4, 8, 12, 16, 20, 24, 32, 40, 48`. Token: `t.spacing` keeps keys `1..12` and gains `0.5: 2`. Aliases: `xs=4, sm=8, md=12, lg=16, xl=24, 2xl=32`.

Migration map (applies to every literal in `features/`, `screens/`, `navigation/`): `6 -> 4 or 8` (4 inside a text stack, 8 between siblings), `10 -> 8` (list separators, gaps) or `12` (card inner padding), `14 -> 12` (field gaps) or `16`, `18 -> 16` (section top) or `24`, `1,3,5,7 -> 4`. Screen horizontal padding 16; card inner padding 12 (dense) or 16 (forms); section gap 24; list separator 8; field gap 12.

Developer check (documented, not a build step): `rg -n "(gap|padding[A-Za-z]*|margin[A-Za-z]*): (6|10|14|18|7|9|11|13|15)\b" src` must return nothing outside tests.

### 2.3 Radii and elevation

Radii (unchanged values): `sm 6` (inline code), `lg 8` (segmented items, inline media), `xl 12` (buttons, inputs, cards, sheets' inner controls), `2xl 16` (sheet top corners), `pill 999` (chips, badges, avatars). Rule: controls and cards `xl`; chips/badges `pill`; never mix `lg` and `xl` on one card.

Elevation (values unchanged): `xs` cards (light only), `sm` sticky footer/tab bar top, `md` toast, `lg` sheet. **Dark mode:** black shadows are invisible on dark surfaces, so in dark `Card` drops the shadow and uses `border: line` plus `bg: surface`; sticky footer and tab bar use `border-top: line` in both modes. Selected segmented item uses a 1dp `fieldBorder` border (section 2.5), not a shadow alone.

### 2.4 Motion

| token | value | use |
|---|---|---|
| `motion.fast` | 120ms | press feedback, chip select, check mark |
| `motion.base` | 200ms | toast in/out, banner appear, sheet content fade |
| `motion.slow` | 300ms | sheet slide (RN `Modal animationType="slide"`) |
| `motion.pulse` | 1000ms loop | skeleton shimmer (opacity .55 to 1), ONE shared `Animated.Value` per screen via context, `useNativeDriver: true` |
| easing | `Easing.out(Easing.cubic)` enter, `Easing.in(Easing.cubic)` exit, `Easing.inOut(Easing.quad)` pulse | |

Rules: core `Animated` only (no reanimated); no animation inside list item renderers; no `LayoutAnimation` (Android needs an experimental flag, unverified on the New Architecture); new hook `useReducedMotion()` (wraps `AccessibilityInfo.isReduceMotionEnabled` + change listener): when true, durations become 0, skeleton is a static 0.8-opacity block, Modal `animationType` becomes `none`, toasts appear without translate. Haptics (`expo-haptics`), never on plain taps: timer start/stop `impactAsync(Medium)`, successful Submit day/Save draft `notificationAsync(Success)`, an error toast `notificationAsync(Error)`, destructive confirm accepted `impactAsync(Light)`. Wrap in try/catch, no-op on web/simulator.

### 2.5 Colour: semantic aliases and contrast-fixed values

Existing palette (`light`/`dark`) is unchanged EXCEPT the additions below. New `ThemeColors` members:

| token | light | dark | purpose |
|---|---|---|---|
| `placeholder` | `rgb(107,114,128)` (= fgSubtle) | `rgb(142,150,168)` (= fgSubtle) | input placeholder (replaces fgFaint) |
| `fieldBorder` | `rgb(135,142,155)` | `rgb(110,118,136)` | input/chip/secondary-button/segmented boundary (WCAG 1.4.11 3:1) |
| `fieldBorderFocus` | brand[500] | brand[500] | focused field (2dp) |
| `divider` | = `lineFaint` | = `lineFaint` | list hairlines (decorative) |
| `avatarDev` / `avatarQa` | brand[700] / success.fg | brand[700] / success.fg | avatar background; text = `onBrand` |
| `indicator` | brand[600] | brand[600] | active-tab bar, active tab strip underline |
| `dotWarn` | warning.base | warning.base | unfiled-day dot on tab bar |

Priority semantics (aliases, no new colours): `critical -> danger`, `high -> warning`, `medium -> info`, `low -> neutral`. Type is NOT colour-coded in lists (see 3.5). `fgFaint` remains only for disabled labels and purely decorative glyphs; it must never carry content.

**Computed before/after (WCAG contrast ratio)**

| pair | before | after |
|---|---|---|
| Placeholder on surface (light) | 2.54 (fgFaint) | **4.83** |
| Placeholder on surface (dark) | 3.93 | **6.03** |
| Field border on surface (light) | 1.47 (lineStrong) | **3.30** (3.15 on app bg) |
| Field border on surface (dark) | 1.87 | **3.93** (4.32 on app bg, 3.57 on elevated) |
| Avatar letter, QA, light | 3.30 (onBrand on success.base) | **5.02** (white on success.fg) |
| Avatar letter, Dev, light | 6.29 | **7.90** (white on brand700) |
| Avatar, dark: dev / qa | n/a / 11.06 | **9.67 / 13.73** |
| Tab active vs inactive, light | 1.30 (hue only) | hue 1.30 PLUS 3dp indicator bar (brand600 on surface 6.29) PLUS filled vs outline icon PLUS semibold vs medium label: three non-colour cues |
| Tab active vs inactive, dark | 1.09 | indicator 6.57 plus the same non-colour cues |
| Unfiled dot (warning.base) on tab surface | n/a | 3.19 light / 10.71 dark (non-text, needs 3:1) |
| Badge text 12px: success/warning/danger/info/neutral on soft, light | 4.79/4.84/5.91/5.57/7.24 | unchanged (all >= 4.5) |
| Primary button text (light/dark) | 6.29 / 7.08 | unchanged |
| Danger solid button text (light/dark) | 4.83 / 6.97 | unchanged (light is close; do not lighten danger.base) |

### 2.6 Icons

`Icon` wraps `Ionicons` from `@expo/vector-icons` (MaterialCommunityIcons only if an Ionicons glyph is missing). Sizes: **16** inline with 12-13px text, **20** in buttons/rows/chips, **24** tab bar and header actions, **40** empty/error illustrations. Colour from tone (`default | muted | subtle | brand | danger | warning | success | info | onBrand`). Decorative by default (`accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`); the parent carries the label. Names (typed union, verify each exists in the installed glyph map): tabs `grid`, `list`, `today`, `shield-checkmark`, `ticket`, `flash`, `ellipsis-horizontal-circle` with `-outline` for inactive; actions `play`, `stop`, `swap-horizontal`, `add`, `search`, `options-outline`, `chevron-back`, `chevron-forward`, `chevron-down`, `close`, `checkmark`, `calendar-outline`, `time-outline`, `alert-circle`, `warning`, `information-circle`, `checkmark-circle`, `lock-closed-outline`, `cloud-offline-outline`, `person-outline`, `bug-outline`, `globe-outline`, `remove-circle-outline`. Fonts: add `Ionicons.font` to the single `useFonts` call (no second loader).

### 2.7 Other layout constants

`MIN_TOUCH = 44` (kept); `ANDROID_TOUCH = 48` used for tab items, header icon buttons and sheet rows via `Platform.select`. Tab bar height 56 (+ safe-area bottom inset). Header row 52. Sticky footer 64 (+ inset). Max content width 600 centred (only matters on large Android devices). Supported: 320-430dp wide, >= 640dp high, portrait.

### 2.8 Web divergences (intentional, mobile-only)

1. `2xs` 12px not 11px. 2. `fieldBorder`, `placeholder`, `avatarDev/Qa`, `indicator`, `dotWarn` tokens do not exist on web. 3. Inter on mobile loaded via expo-font (web uses Inter var / system stack). 4. Dark-mode cards use border instead of shadow. 5. Screen/detail titles are `xl` not 2xl. Nothing in `index.css` or `tailwind.config.js` changes.

---

## 3. Component specs

All live in `src/components/ui/` and are exported from `index.ts`. "Stable" = existing props/testIDs/roles keep working. Anything additive is optional with a default equal to today's behavior.

### 3.1 Text
Props (all existing plus): `maxFontScale?: number`, `numeric?: boolean` (tabular-nums). Tones unchanged; `faint` documented as disabled/decorative only. Family mapping per 2.1. No new default props. Do not pass dynamic data as `accessibilityLabel` here.

### 3.2 Icon (new)
`<Icon name size={20} tone="default" color? label? />`. With `label` it becomes `accessible` + `accessibilityRole="image"` + that label; without it, hidden from screen readers. Never touchable on its own.

### 3.3 Button
Props: existing (`label, onPress, variant, loading, disabled, fullWidth, accessibilityHint, testID, style`) plus `size?: 'md'|'compact'` (default md), `icon?: IconName`, `iconPosition?: 'start'|'end'`, `iconOnly?: boolean`, `accessibilityLabel?: string` (default = `label`).

| variant | look | use |
|---|---|---|
| `primary` | brand600 bg, onBrand text | ONE per view/footer |
| `secondary` | surface bg, `fieldBorder` 1dp border, fg text | alternatives |
| `ghost` | transparent, brand600 text | tertiary, "Cancel", "Today" |
| `danger` (existing, solid) | danger.base bg, onBrand text | Stop timer, final delete confirm only |
| `dangerOutline` (new) | transparent, danger.base border, `danger.fg` text | Delete entry, Remove, Sign out |

Sizes: `md` min height 44, text `lg` semibold, padding 16x10->(12 vertical). `compact` visual height 36, `sm` semibold, horizontal 12, plus `hitSlop {top:4,bottom:4}` so the touch area is 44. `iconOnly` is 44x44 (compact 36 + hitSlop 4), REQUIRES `accessibilityLabel`; label is not rendered.

Rules (hard): visible `label` is static and <= 24 characters, never contains task/person names; `numberOfLines={1}` + ellipsis. Put the object in `accessibilityLabel` (Label-in-Name: the label must START WITH or contain the visible text, e.g. visible "Pass", a11y "Pass Login form test"). `loading` keeps the button width (label hidden, spinner centred, `accessibilityState.busy`). Disabled: opacity .55 (exempt from contrast), still announces `disabled`. Pressed: `primary` -> brand700 bg, others -> `hover` bg; Android `android_ripple` at 15% of the variant colour. States: default, pressed, disabled, loading. Two buttons side by side only when both are short; at `fontScale >= 1.3` footers stack vertically.

### 3.4 Chip, TabStrip, ChoiceChips, ActionButton (the split)
- `Chip` (kept, `FilterChip` alias): toggle filter. Unchanged API/testIDs. Min height 44 via hit area, visible pill height 36, selected = 2dp brand500 border + check icon + semibold (already non-colour). Unselected border `fieldBorder`.
- `TabStrip` (new): `{tabs:[{key,label,badge?}], value, onChange, scroll?: boolean}`. Role `tablist` / `tab` with `selected`. Equal-width up to 5 labels, else horizontal scroll. Underline indicator 3dp `indicator` under the active tab + semibold; inactive medium + fgSubtle. Row height 48. Used as the sticky strip on Task Detail and for the QA queue views is NOT used (QA keeps Chips).
- `ChoiceChips` (new, thin wrapper): single-select group with `accessibilityRole="radiogroup"`, items `radio` + `selected`; for Severity, Assignee role, Priority/Type in the filter sheet. Visuals identical to Chip.
- `ActionButton` = `Button size="compact"`. Ticket "Mark X" and similar are Buttons (variant `secondary`, compact), NOT chips.

### 3.5 Badge / StatusBadge / PriorityBadge / FlagLine
- `Badge` (kept): 12px semibold, height 22, padding 8x2->(8x4 vertical 2), optional `icon` (12px leading), `variant: 'soft'|'outline'` (outline = transparent, `fieldBorder`, neutral text). `maxFontScale 1.3`, `numberOfLines 1`.
- `StatusBadge` (replaces `StatusChip` in `TaskParts`, same export name kept as alias): dot (status colour from config) + label at 12px on `subtle` bg with `line` border. Optional `onPress` (task-move) adds a `chevron-down` 12px and 44dp hit area via `hitSlop`.
- `PriorityBadge` (new): icon + label. Critical `alert-circle` danger, High `arrow-up` warning, Medium `remove` info, Low `arrow-down` neutral. Shown ALWAYS in detail; in list cards: High/Critical as soft tone badge, Medium/Low as `outline` neutral badge with the icon (so colour never carries the level).
- Type: NOT a colour badge in lists. Card meta shows plain muted text ("Bug", "Improvement") with `bug-outline` icon for Bug only. Detail shows a neutral `outline` Badge. This removes the red-Bug + red-Critical + red-Blocked collision.
- `FlagLine` (new): `Blocked`, `QA overdue` (danger), `At risk` (warning): one row at the top of an EntityCard: icon 16 + 13px semibold text in the tone fg. At most one flag line per card (existing `cardFlag()` precedence). It replaces the flag Badge in cards.
- Reopen: text "Reopened 2x" (unchanged string in Detail), "x2" in cards becomes "Reopened 2x" with `refresh` icon (card a11y label gains it).

### 3.6 Input
Props: existing plus `optional?: boolean` (renders muted " (optional)" after the label; `accessibilityLabel` stays `label`), `helper?: string`, `counter?: boolean | number` (uses `maxLength`; shows `n/max` right-aligned xs subtle once length >= 80% of max, danger at max; live region off), `leadingIcon?`, `trailing?: ReactNode`, `numberOfLinesMin?: number` (multiline min height = lines * 22 + 20, default 3 lines = 88, grows up to 160 then scrolls).
Visuals: label `sm medium muted` above; field min height 44, radius xl, border `fieldBorder` 1dp, focus 2dp `fieldBorderFocus`, error 2dp danger + `alert-circle` 16 + error text `xs danger` below (text, not colour only), disabled bg `subtle`. Placeholder uses `placeholder`. `nativeID` made unique with `useId`. Error also in `accessibilityHint` (kept). iOS `number-pad`/`phone-pad` fields attach a `KeyboardDoneBar` (core `InputAccessoryView`, one "Done" button that blurs). Keyboard: see 3.9 `useKeyboardInset`.

`NumberField` (new, used by My Day; style-only): `{label, unit, value, onChangeText, disabled, error, min?, max?}` renders `[ - ] [ 12 ] unit [ + ]`: field width 64, unit text after, − / + icon buttons 44x44 that call the SAME handler as typing with `String(n±1)` (min 0). The existing validation/commit in `MinutesEditor` is reused untouched (the buttons call `onChangeText`). P2 for steppers; the unit text and width are P1.

### 3.7 Card, ListRow, EntityCard, OptionRow
- `Card`: kept. New `variant: 'plain'|'interactive'|'flat'`: `interactive` is a Pressable (pressed bg `hover`, optional trailing chevron), `flat` has no shadow. Dark: border instead of shadow (2.3). Padding 12 or 16.
- `ListRow` (new): `{leading?, title, subtitle?, meta?, trailing?, onPress?, chevron?, accessibilityLabel, testID, selected?}`. Min height 56; title `base medium` 2 lines; subtitle `xs muted` 1 line; divider hairline. Used by More rows, Dashboard TaskRow, Timesheet entries, sprint tasks, assignee/candidate rows.
- `EntityCard` (new): the shared shell for Task/Ticket/Sprint/QA cards: left accent bar (4dp, decorative), `header` slot (code + flag), `title` (lg semibold, 2 lines), up to 3 `meta` rows, `footer` slot. The main area is ONE Pressable; footer actions are sibling Pressables (never nested). `TaskCard` stays `memo` with the same stable props plus one boolean `showStatus`.
- `OptionRow` (new): `{label, description?, leading?, selected, onPress, disabled?}`. Role `radio`, `accessibilityState.selected`. Min height 48 (Android) / 44. Selected = trailing `checkmark` icon + visible text "Selected" (replaces "✓ Selected"), semibold label. Used by Project picker, Assignee sheet, Add-assignee candidates, Status "Move to", Create-ticket project sheet.

### 3.8 PageHeader (single header pattern)
`<PageHeader variant="tab"|"push" title subtitle? onBack? trailing? />`. It also renders the global strips (3.12) directly below the row, so strips appear on every screen that has a header.
- `tab`: 52dp, title `xl bold` left, `trailing` right (ProjectChip, or a compact Button). Top inset handled via `Screen`/`TopInsetHandledContext` as today.
- `push`: 52dp, back button 44x44 (`chevron-back` 24 + visible text "Back", `accessibilityLabel="Back"`, `accessibilityRole="button"`), title `lg semibold` 1 line centred-left (context title: task code, "Ticket", "Sprint", "Timesheet", "New ticket", "QA"), `trailing` slot.
- `RootNavigator`: set `headerShown:false` on `QATask`, `TaskDetail`, `TicketDetail`, `TicketCreate`, `SprintDetail`, `Timesheet`; each screen renders `PageHeader variant="push"`. `ModuleHost` renders the same component (keeps `TopInsetHandledContext.Provider`) and module screens inside it drop their own duplicate title row via a context flag (`HeaderProvidedContext`) so "Profile"/"Tickets" appear once. Platform back (Android hardware, iOS edge swipe) is a navigator feature and is unaffected by hiding the native header. `headerBackTitle` goes away.

### 3.9 BottomSheet (critical rebuild)
Props: existing (`visible, title, onClose, children`) plus `kind?: 'picker'|'form'|'prompt'` (default `picker`), `footer?: ReactNode`, `dirty?: boolean`, `onDiscard?`, `closeLabel?`, `maxHeightPct?` (default 0.9).
Structure (built on RN `Modal`, `transparent`, `statusBarTranslucent`, `navigationBarTranslucent` on Android): scrim (50%) -> sheet container (bg `elevated`, top radius 16, `accessibilityViewIsModal`) -> **grab handle** (36x4dp, `fieldBorder`, centred, 8dp top) -> header row -> `ScrollView` body (`keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="interactive"` iOS / `on-drag` Android, content padding 16, bottom padding = keyboard inset) -> optional sticky `footer` (border-top `line`, padding 12/16, bottom inset). Max height `0.9 * windowHeight - keyboardInset` (never taller than the visible area above the keyboard).
- Keyboard: new hook `useKeyboardInset()` (core `Keyboard` `keyboardWillShow/Hide` on iOS, `keyboardDidShow/Hide` on Android; returns `endCoordinates.height - safeAreaBottom` clamped at 0). Used by BottomSheet and by `Screen keyboardAvoiding` (replaces the `behavior: 'height'` KAV on Android; keep KAV `padding` on iOS as a fallback). This is correct under Android edge-to-edge where `adjustResize` no longer resizes the window. Needs device verification.
- Header copy (replaces ambiguous "Done"): `picker` -> trailing text button **"Close"** (`accessibilityLabel="Close {title}"`; Label-in-Name satisfied); `form` -> leading **"Cancel"** (ghost) + title; confirms discard via `Alert` ("Discard changes?" / "Keep editing" / "Discard") when `dirty`; the Save/Add/Delete buttons live in the sticky `footer`; `prompt` (TimerStatusPromptSheet) -> no header button, its own choices + dismiss button in body.
- Android hardware back and scrim tap call the same guarded close.
- Toast visibility inside the Modal: see 3.10.
- A11y: title `accessibilityRole="header"`; focus moves to the sheet on open (RN does this for `accessibilityViewIsModal`); scrim is `accessibilityLabel="Close"` (kept).
- `animationType`: `slide` normally, `none` if reduced motion.

### 3.10 Toast
`useToast().show(message, tone?, durationMs?)` unchanged signature; new `useToast().dismiss()`.
- Queue: max 3 pending, shown one at a time; identical message within 1500ms collapses; a danger toast is never displaced by a success toast (it is queued after).
- Anatomy: tone icon 20 + message (`sm medium`, up to 4 lines) + close button (icon-only, 44, `accessibilityLabel="Dismiss"`) on every toast; tapping the toast dismisses it.
- Duration (when not given): success 3000, info 4000, warning 7000, **danger: 8000 and extends to read time `max(8000, 50ms * chars)` capped at 15000**; paused while the screen reader is focused on it (not detectable cheaply: instead, danger toasts persist until dismissed when `AccessibilityInfo.isScreenReaderEnabled()`).
- Placement: top, `insets.top + 8`, and BELOW the PageHeader strips? No: overlay at the top of the screen as today (it is transient). Container `pointerEvents="box-none"`; the toast itself is touchable.
- Inside sheets: `BottomSheet` registers via a `ToastSheetContext`; while any sheet is open, the provider hides its root toast and the sheet renders `<ToastView/>` at its own top (inside the Modal) with the same state. One toast state, two possible mount points.
- `accessibilityRole="alert"`, `accessibilityLiveRegion="polite"` (danger: `"assertive"`), plus the existing `AccessibilityInfo.announce` calls stay.

### 3.11 Banner family (unified)
`Banner` gains `icon` (default per tone), `action?: {label, onPress}`, `onDismiss?`. `StaleBanner` unchanged text. `ReadOnlyNotice` = `Banner tone="info" icon="lock-closed-outline"`. `OfflineBanner` and `RunningTimerBanner` are re-implemented on top of one `StripBanner` shell (full-width, no radius, border-bottom) so offline/timer/stale/info share padding (12x8), icon slot, type scale and `accessibilityLiveRegion`. testIDs preserved (`offline-banner`, `running-timer-banner`, `running-timer-clock`, `stale-banner`).

### 3.12 Global strips (offline + timer on every screen)
`GlobalStrips` renders `OfflineStrip` then `TimerStrip`, and is mounted inside `PageHeader` (below the header row) so it appears on tabs AND pushed screens, above content, not in the tab bar. Auth screens have no PageHeader, so no strips. `AppTabs` `tabBar` becomes the plain `BottomTabBar`.
- `OfflineStrip`: 32dp, `warning.soft`, `cloud-offline-outline` 16, text "Offline. Showing saved data; changes can't be saved until you reconnect." (kept verbatim; becomes truthful by wording "Showing data already loaded" only if the lead wants. Keep verbatim for tests, note in 7.4).
- `TimerStrip`: 52dp, `brand50` bg with `brand300` bottom border; left: recording dot 8dp (static) + task title 1 line + project 12px; centre: clock `base bold tabular`; right: `Button variant="danger" size="compact" label="Stop"` (a11y label `Stop timer on {title}` unchanged). Row tap opens that task (`TaskDetail`), disabled when the current route is already that task. Hidden while on the Login/auth stack.

### 3.13 Skeleton
`Skeleton({width,height,radius})`, `SkeletonText`, and presets `SkeletonCards({count, variant:'task'|'ticket'|'sprint'|'row'})`, `SkeletonKpiGrid`, `SkeletonDetailHeader`. Colour `subtle` with `line` border; pulse per 2.4. Container: `accessible`, `accessibilityRole="progressbar"`, `accessibilityLabel` = the same label LoadingState used ("Loading tasks..." etc.) so text/label tests keep passing; also render the visible text label? No: tests that query `getByText('Loading tasks...')` would fail, so each skeleton container renders a visually hidden `Text` with the label (`position:absolute`, opacity 0). Rule: first load of a list/detail uses Skeleton; pull-to-refresh and refetch use the system indicator; tiny inline regions (comments, sheet lists) keep `LoadingState`.

### 3.14 EmptyState / ErrorState
`EmptyState({title, message?, icon?, action?:{label,onPress}, secondary?})`: icon 40 in a 72dp `subtle` circle, title `lg semibold` centred, message `sm muted`, action = compact primary Button. `ErrorState` same shell with `alert-circle` danger icon, existing `onRetry`/`secondary` props, `accessibilityRole="alert"` group retained, plus `retryLabel`. Rule: every empty state offers a next step when one exists (table in section 5). Copy keeps today's strings.

### 3.15 KpiCard, KpiGrid
`KpiCard({label,value,tone,hint,info?,icon?})`: value `3xl bold numeric maxFontScale 1.3`, label `xs medium muted`, hint `2xs subtle`; tone adds a leading 16dp icon (`alert-circle` danger, `warning` warning, `checkmark-circle` success) so state is not colour-only; `info` renders an icon-only 44dp button (`information-circle-outline`, label `About {label}`) that opens a small `BottomSheet kind="picker"`. Compact variant (`dense`): 56dp tall, value `2xl`, no hint, used in the Developer/QA dashboards below the focus list. `KpiGrid`: 2 columns, `minWidth 140`, wraps to 1 column automatically; gap 8.

### 3.16 SegmentedControl
Keep API. Selected item: surface bg + 1dp `fieldBorder` border + semibold + `brand600` text (not shadow only). Role stays `tablist`/`tab` (tests); P2 note: becomes `radiogroup` if tests are updated.

### 3.17 ProgressBar semantics
New prop `semantic?: 'progress'|'neutral'` (default `'progress'` = today's colour thresholds). `neutral` always uses brand500. Add optional `markerPct?: number` (a 2dp fg tick at that position) and `height?: number` (default 6; 8 for hero bars). Used: Burndown rows and per-person time bars use `neutral`; Burndown marker = ideal remaining. Text always accompanies the bar (already true).

### 3.18 Avatar
`Avatar({name, kind, size=28})` shows up to 2 initials, bg `avatarDev`/`avatarQa`, text `onBrand` `2xs bold`, `maxFontScale 1.2`, fixed size scales with `PixelRatio.getFontScale()` clamp 1-1.3. Role is never colour-only: any place showing a dev and a QA avatar also prints the role text ("Dev", "QA"); `TaskCard` no longer uses avatars (names as text, 5.3).

### 3.19 Keyboard and screen helpers
`useKeyboardInset()`, `KeyboardDoneBar`, `HeaderProvidedContext`, `useReducedMotion()`. `Screen` gains `footer?: ReactNode` (sticky, outside the ScrollView, border-top, bottom inset, hidden when the keyboard is open) and `header?: ReactNode`. `Screen` contract with `TopInsetHandledContext` is unchanged.

---

## 4. Navigation and information architecture

### 4.1 Tab bar
`Tab.Navigator`: `tabBarLabelPosition: 'below-icon'`, icon shown (remove `tabBarIconStyle: {display:'none'}`), height 56 + bottom inset, `tabBarItemStyle.minHeight` 56, bg `surface`, border-top `line`. Custom `tabBarIcon({focused})`: `Icon` 24 (filled when focused, `-outline` otherwise). Custom `tabBarLabel`: `Text` 12px (`2xs`), `numberOfLines 1`, `adjustsFontSizeToFit`, `minimumFontScale 0.85`, `maxFontScale 1.15`, semibold + brand600 when focused, medium + fgSubtle otherwise. Active indicator: 3dp bar, 28dp wide, radius bottom 3, `indicator` colour, pinned to the top edge of the item (non-colour cue; always paired with filled icon and weight change).
Badge: remove numeric `tabBarBadge: 1`. My Day tab: a 10dp `dotWarn` dot with 2dp surface ring at the top-right of the icon (rendered inside `tabBarIcon`), `tabBarAccessibilityLabel` stays `My Day, not filed yet`. If My Day is in the overflow (not a tab), the **More** tab shows the same dot and its label becomes `More, My Day not filed yet`.
Titles (strings) unchanged: Dashboard, Tasks, My Day, QA, Tickets, Sprints, More.

### 4.2 Role-aware tab priority (presentation order only)
Implement as `TAB_PRIORITY: Record<roleId, ModuleName[]>` in `navigation/moduleTabs.ts`; `grantedModules`/`splitModules` take the user's `roleId`, filter by grant + mobile visibility exactly as today, THEN order by the role list (unlisted granted modules appended in registry order). The first tab is the landing tab. `useOpenModule` uses the same ordering so tab-vs-pushed decisions stay consistent.

| Role | Priority (first 4 become tabs, rest in More) | Why |
|---|---|---|
| Developer (5) | Dashboard, Tasks, My Day, QA, Tickets, Sprints | Focus list, task work, file day |
| QA (4) | QA, Dashboard, Tasks, My Day, Tickets, Sprints | Land on the queue |
| Tech Lead (3) | Dashboard, Tasks, Sprints, My Day, QA, Tickets | Team health, sprints |
| Project Manager (2) | Dashboard, Sprints, Tasks, Tickets, My Day, QA | Delivery and tickets |
| CTO (1) and roles 7-9 | Dashboard, Tasks, Sprints, Tickets, My Day, QA | Overview first |
| Client (6) | Tickets, Dashboard, Tasks, Sprints, My Day, QA | Their main job is tickets; the client dashboard has a known server issue |

Assumption to confirm (Q-list): PM and CTO rarely file a personal day; their My Day sits in More with the dot on More when unfiled.

### 4.3 More (renamed "More", sections)
```
More
[ avatar  Aditya Jadhav                      >]  Profile row (name, role; label "Profile and settings", testID open-profile)
Modules                                          section label (only overflow modules; hidden if none)
[ icon  Sprints                              >]  ListRow, press = openModule
Not available in this version yet        (3) v   collapsed disclosure (Pressable, aria expanded), default collapsed
   Releases / Calendar / Users ...               neutral rows, no warning colour, no access badges
```
Changes: heading "More" (no "for <name>"); explanatory paragraph removed (the disclosure title carries the meaning); modules that are already tabs are NOT repeated; visible "Can edit / View only" badges removed (the `accessibilityLabel` keeps `{name}. {level}. Opens {title}` for modules and `{name}. {level}. Not available in this version yet.` for web-only rows); the warning-toned badge becomes the single disclosure title. Profile is the first row of More and stays there (no extra entry points), plus P2: a 36dp initials button at the right of the Dashboard header opens Profile.

### 4.4 Header, back and depth
One `PageHeader` (3.8). Back text "Back" with chevron. Depth rules: Dashboard row -> Task Detail (1 push); QA row -> QATask (1 push) with a header action "Open task" (`TaskDetail`, P2); parent/subtask links push `TaskDetail` (stack, back unwinds). Timesheet reachable from My Day header and Task Detail "Time" tab (unchanged). Sign-out: Profile -> Sign out (3 taps from any tab: More, Profile, Sign out; the existing confirm Alert stays).

### 4.5 Where strips live
Section 3.12. Because strips are inside `PageHeader`, a screen without a PageHeader has none. Every authenticated screen has a PageHeader (tab or push), including `QATask`.

---

## 5. Screen specs

Common to all list/detail screens: loading = Skeleton preset (3.13); stale = `StaleBanner` above content, data stays; error (no data) = `ErrorState` with Retry; pull-to-refresh retained; dark mode via tokens only; both orientations N/A (portrait only).

### 5.1 Login (`auth/LoginScreen.tsx`)
```
        (wordmark) TaskTracking   (3xl bold)
        Sign in to continue       (muted)
[banner: session expired | error | cooldown]
Email    [__________________]
Password [_______________][Show]
[            Sign in             ]
```
Keep structure and all strings (`Email`, `Password`, `Show`/`Hide`, `Sign in`, banners, testIDs `login-submit`, `session-expired-banner`, `login-error`). Changes: banners get icons; field errors get the icon + text; keyboard via `useKeyboardInset` (content stays scrollable; primary button never hidden behind the keyboard); wordmark is plain text (no invented logo). Cooldown: Button stays disabled and its label shows `Sign in` only (the banner shows the time). Acceptance: at 320x640 with keyboard open both inputs and the Sign in button are reachable by scrolling; errors are announced; tab order email, password, show, sign in.

### 5.2 Dashboard
Header: `PageHeader tab` title `Hi, {first name}` (kept; sub-label "Dashboard" moves into the header `subtitle`, `xs muted`).

**Developer**
```
Today's focus (3)            In progress and pending for today, by priority
 [!] Fix login crash                         [> start]   row: priority icon+label inline, project, status, due
 ...  (max 5, "Show all 8" expands in place)
Needs attention (1)          Failed QA or reopened
Overdue and old pending ...
- compact KPI strip (2x2 dense): Active 4 | Done today 1 | Overdue 2 (i) | Old pending 1
Next 7 days (5)
```
- Order change: Today's focus -> Needs attention -> KPI strip (dense) -> Old pending -> Next 7 days. Titles/hints keep their strings (`Today's focus`, `Needs attention`, `Old pending`, `Next 7 days`, hints unchanged).
- `TaskRow` (via `ListRow`): leading `PriorityBadge` icon-only is NOT enough, so the row shows a visible priority word in the meta line ("High · Acme · Due 12 Oct"), `StatusBadge` on the second line, blocked/reopen as `FlagLine`-style text. Trailing `3d late` stays (bold danger text with `alert-circle`).
- **Quick Start** (only here, only when `isAssignedToTask(task, me.id, undefined)` i.e. owner): trailing icon-only button `play` (accessibilityLabel `Start timer on {title}`). If a timer is running elsewhere: native `Alert` title "Switch timer?", body "This stops the timer on "{current title}" and starts one on "{this title}".", buttons Cancel / "Switch" (default). If none running: start immediately, haptic, toast "Timer started". If a timer runs on this row: the button is `stop`, label `Stop timer on {title}`, with the row tinted `brand50`. Uses the existing `useTimerActions` (locks/double-tap protection unchanged). The status-prompt sheet after start remains.
- "Overdue" KPI info sheet ("About Overdue"): "This count comes from the server and includes tasks due today. The Overdue filter on Tasks only counts tasks due before today, so the two numbers can differ." Same pattern for the QA/TL "Overdue" KPI.
- Section limit 5 with "Show all N" in-place expand (local UI state inside `TaskSection`, no data logic).

**QA**: Ready for QA (3), Needs retest, KPI strip dense (Active, Passed, Needs retest), Unassigned in QA. No quick Start.
**Tech Lead / Team health**: compact KPI grid FIRST (7 cards, 2 columns, dense variant), then Blocked and at risk, Blocker notes, Overdue, Sprint health, QA queue. **PM**: KPI grid (4), Active sprints, Release progress, Overloaded people, Tasks by status (dot + text, count right), Recent activity. **CTO**: segmented control (PM / Team health) stays at the top; contents as above. **Client**: KPI grid, Projects cards; an `ErrorState` with retry already covers the known server 500 (keep copy, add icon).
States: loading `SkeletonKpiGrid + SkeletonCards`; empty rows keep their strings ("Nothing urgent today." etc.) inside the card; stale banner; offline strip global.
Acceptance: On a developer account with >=1 focus task, the first task row is visible above the fold at 360x640 without scrolling (estimate: header 52 + title row 34 + section header 40 + first rows). KPI strip is below the focus list. Quick Start never shows for a task where the user is only on the roster.

### 5.3 Tasks (`TasksScreen.tsx`, `TaskCard.tsx`)
```
[ Tasks                               (o) All Projects v ]   PageHeader tab (project chip 44, max 55% width)
[ (search) Search tasks...                ][ (=) Filters 2 ]  search row 44 (Input label "Search tasks" kept)
-------------- scrolls with list below ------------------
[Mine][Overdue 3][QA overdue][Blocked 1][Unassigned 4]  ->    ONE chip row, horizontal scroll
Mine = tasks where you are the dev, QA or support owner.      (helper, xs muted, only when Mine is on)
12 tasks - Grouped by status                                    xs subtle (taps to open Filters)
[ section header: (o) In progress 4 ]  (sticky)
[ TaskCard ]
```
- Filters button: icon-only visual + text "Filters" and a count `Badge` of active filters among {priority, type, backlog, groupBy != status}. Opens `BottomSheet kind="form"`: sections Group by (`SegmentedControl` By status/By priority), Priority (`ChoiceChips`), Type (`ChoiceChips`), Backlog only (a single Chip). Footer: ghost "Clear all" + primary "Show {n} tasks" (live count, closes the sheet). Existing testIDs `chip-priority-*`, `chip-type-*` move into the sheet.
- Chips row: quick filters keep their labels and counts; `Mine` is new (`testID="chip-mine"`, filter `assignedTo: userId`). Toggling Mine is a filter change (data param only).
- Fixed chrome now ~24 status + 52 + 8 + 44 + 8 = 136dp (was ~330). At 360x640 with the tab bar (56) the list gets ~400dp (>= 2 cards) (estimate).
- **TaskCard layout** (memo, stable props + `showStatus`):
```
|bar| [flag line: (stop) Blocked]                           <- only when flagged
|bar| PROJ-0042 - Project name            (^) High           code xs subtle; PriorityBadge right
|bar| Fix login redirect on expired session  (lg semibold, max 2 lines)
|bar| (cal) Due 12 Oct   (clock) 5h           [status v]  or  Overdue 3d            <- due labelled, 13px semibold; overdue/today use danger/warning + icon
|bar| Priya (Dev) - Rahul (QA)         Subtasks 2/5 [====-]   Move to...
```
  Rules: due label is ALWAYS urgency-aware on mobile (call `dueLabel(task, true, formatDay)`; web only highlights under the Overdue chip. Intentional divergence, noted in 7.4). Assignee names appear as text (dev name; QA name only when a QA owner exists; "Unassigned" otherwise) truncated with ellipsis; avatars removed from the card. Status `StatusBadge` shown only when `showStatus` (grouped by priority). The full-width "Move to..." row is gone: a compact ghost button "Move to..." with `swap-horizontal` sits at the footer's right (label string and `accessibilityLabel` "Move {title}" unchanged), only when `canMove`. Subtask progress: text "Subtasks 2/5" + 48dp bar on the same row. Module appears in the project line ("PROJ-0042 - Module") instead of its own tag row. Type shown as plain meta text only for Bug/other types appended after the module (never a coloured badge). Estimated card height ~140-170dp (estimate).
  a11y label: title. code. status. priority. flag. due. assignee. reopen (adds reopen).
- States: skeleton `SkeletonCards task x5`; empty without filters: icon `checkmark-done-outline`, "No tasks yet", message as today; empty with filters: "No tasks match" + `Clear filters` button (kept); read-only: no Move button; no banner.
- Acceptance: all filters reachable with the sheet; search and chips never push the list below 400dp at 360x640; card text never overlaps at 150% font; Move still opens the status sheet and respects `canMove`.

### 5.4 Task Detail (`TaskDetailScreen.tsx`, `TaskDetailTabs.tsx`)
```
[<- Back]  PROJ-0042                                         PageHeader push (+ strips)
Acme Portal                                                    xs muted
Fix login redirect on expired session                          xl bold (all lines)
[In progress v] [^ High] [Bug] [(stop) Blocked]               badges (StatusBadge tappable when canEdit)
[ > Start timer          ][ Move to... ]                       action row: Button primary (flex 1) + secondary compact
Not assigned message OR "Starting here stops the timer on "X"." (xs subtle) 
====== sticky TabStrip: Overview | Time | QA* | Comments | More ======
```
- Header sticky behaviour: `Screen scroll` with `stickyHeaderIndices` on the TabStrip wrapper. The strip is `surface` bg with border-bottom.
- Tabs: `Overview`, `Time`, `QA` (shown only if `canView('/qa')` OR status in `READY_FOR_QA, PASS, FAIL, REOPEN`; read-only for others as today), `Comments` (badge with count if loaded), `More` containing a `SegmentedControl` People | History | Files. Max 5 labels; equal width, `sm` label, no truncation expected at 320 (5 x 64dp, label "Overview" ~58dp at 13px; if it does not fit the strip scrolls horizontally: `scroll` mode).
- Action row: Start/Stop is the same `TimerControl` logic, restyled: `Start timer` primary (flex 1, full row if Move absent), `Stop timer` danger. `Move to...` secondary compact, only when `canEdit && targets.length`. Elapsed time is shown in the global TimerStrip (3.12) so it is visible here without changing `TimerControl`.
- Overview content order: Description card, Blocked banner (moved ABOVE description when blocked), Dates and effort (labelled grid, 12px labels), Parent task, Subtasks. Field labels 12px.
- Time tab: "Open my timesheet" becomes a trailing text-button row at the top of the tab (kept string).
- Comments tab: composer sits at the top of the list? No: stays at the bottom (chat order), Post comment button, `Input counter`.
- States: skeleton (`SkeletonDetailHeader` + tab area), error full screen with `Go back`, stale banner, read-only People ("Only people with edit access can change assignees." shown when `!canAssign`, `ReadOnlyNotice`).
- Acceptance: at 360x640 the description (or the first content block) starts within the first screen; the TabStrip stays visible while scrolling any tab; Start/Move reachable without scrolling.

### 5.5 QA queue and QA task
**Queue (`QAScreen.tsx`)**
```
[ QA                                         ]  PageHeader tab
5 tasks awaiting QA                             (kept testID qa-awaiting)
[Ready for QA 3][Failed 1][Reopen 0][Overdue to QA 2] ->   ONE scroll row (Chips, testIDs qa-tab-* kept)
[ EntityCard ... ]
```
Card: title (lg, 2 lines), `StatusBadge`, "QA: {name|Unassigned}", FlagLine for overdue-to-QA ("3d overdue to QA"), "Reopened 2x" text, sprint line. Subtask rows: "Pass" / "Fail" compact buttons (visible static text; `accessibilityLabel` `Pass {title}` / `Fail {title}` unchanged). Task-level Fail from a subtask row: no confirm (no reopen increment). Reopen is not offered on this screen today; if offered it confirms. Empty: icon `checkmark-circle-outline`, "Nothing here" / "Nothing is overdue to QA" (kept).
**QA task (`QATaskScreen.tsx`, `QAPanel.tsx`)** order: header (code, title, StatusBadge) -> **Verdict card** -> compact summary line -> Test cases -> Add test case.
```
VERDICT
 [ Pass ]  [ Fail ]                (Pass = primary, Fail = dangerOutline)
 Reopen: [ Reopen ]  hint: "Increases the task's reopen count."   (only when status FAIL)
Summary: 5 cases | 3 passed | 1 failed | 1 pending | Pass rate 60%    (one wrapped row of text items; testID qa-summary kept)
Test cases (5)  -> CaseRow (title, Passed/Failed/Pending badge with icon, Steps/Expected collapsed under "Details" disclosure)
[ Add test case ]
```
Copy: Reopen confirm `Alert` title "Reopen this task?", body "This sends it back to development and increases its reopen count by one.", buttons "Cancel" / "Reopen" (destructive style). Test-case Fail confirm unchanged (`Record a failure?`, existing bodies). Task-level Fail: no confirm. Disallowed verdict explanation text stays (`verdict-reason-*`). Tile cards (4 big tiles) are replaced by the summary line to save ~90dp; each metric stays an accessible item with the same "Label: value" label.

### 5.6 My Day (style/layout only; no logic moves)
```
[ My Day                                  [Timesheet] ]   PageHeader tab; trailing compact secondary w/ calendar icon, label "Timesheet" kept
[ <  ]  Fri, 10 Oct 2026  [Draft]  [  > ]   [Today]       date stepper row
Total 6h 30m of 8h   tracked 6h                          text + 8dp ProgressBar (8h is a display-only target, existing constant)
[banners: rolled / dropped / merged / locked / error / editor errors]
[review card: Confirm auto-closed entries]
(o) Acme Portal                                  6h 30m
 +- Fix login (2 lines)            [Read-only|Auto-closed]
 |  tracked 1h - 2 sessions - +10m added
 |  [ - ][ 1 ] h  [ + ]   [ - ][ 30 ] m [ + ]
 |  What did you do on this?  [ note ........ ] 0/500
Summary (optional)  [ ... ]
Blockers (optional) [ ... ]
Tomorrow's plan (optional) [ ... ]
--- sticky footer ---------------------------------------------
[ Save draft ]                    [ Submit day ]                (hidden while keyboard open and when locked)
```
- Date stepper: `chevron-back`/`chevron-forward` icon-only buttons (44) with `accessibilityLabel` "Previous day"/"Next day" (kept; disabled logic unchanged), date text `base semibold`, Draft/Submitted `Badge` with icon (`create-outline` / `checkmark-circle`) at 12px, `Today` ghost button only when not on today (still disabled logic as today). The "Timesheet" link leaves the stepper row.
- Progress to target: `ProgressBar semantic="progress"` + text "Total 6h 30m of 8h" (and "8h target met" with check when >= 8h); tracked difference text kept ("tracked 6h"). Testids `day-date`, `day-totals` kept; string changes in `day-totals`: `Total 6h 30m` -> `Total 6h 30m of 8h` (see 7.4).
- Line cards: meta line 12px; `MinutesEditor` visual only: unit labels "h"/"m" become visible next to the field (already present), field width 64, error text under with icon; `NumberField` stepper buttons P2.
- Optional marks on Summary / Blockers / Tomorrow's plan; `counter` on every multiline.
- Footer: Save draft secondary + Submit day primary; Submit stays enabled/disabled by today's rules; `Alert` confirm stays; success haptic + existing toast. When the footer would stack (fontScale >= 1.3) the buttons stack vertically with Submit on top.
- Empty (no items): `EmptyState icon timer-outline`, "Nothing tracked yet", message kept, action `Go to Tasks` (hidden if Tasks is not granted; uses `useOpenModule('Tasks')`).
- Locked: no footer; `locked-banner` stays (info, lock icon); fields editable=false and visually `subtle`.
- Acceptance: Submit/Save visible without scrolling on every state where editable (footer); the target progress is visible at the top; date navigation does not wrap at 320dp; keyboard never hides the focused field.

### 5.7 Timesheet and TimeEntrySheet
**Timesheet (`TimesheetScreen.tsx`)** pushed screen, `PageHeader push title="Timesheet"`.
```
[ <  ]  6 Oct - 12 Oct 2026  [ > ]   [This week]
Week total 38h 30m  (card: byProject rows dot+name+duration)  + needs-review banner
Mon 6 Oct (today)                      [ 7h 30m of 8h ]       day header, text badge (check when met)
  09:30-11:00  1h 30m   Fix login redirect       [Timer] [Auto-closed]   entry row (time range first, task title 2 lines)
...
--- sticky footer: [ Add time ] (primary, disabled until tz known + helper text) ---
```
`Previous week`/`Next week` become icon buttons with the same `accessibilityLabel`; `This week` stays a compact ghost button. Add time moves to the sticky footer (string unchanged, `disabled={!tz}` unchanged). Entries show the time range as the first element (`base semibold tabular`), duration right. Dense data keeps a scrolling list (not a table; the screen is a per-day list on a phone). Empty week: "No time this week" + action "Add time". Skeleton: day blocks.

**TimeEntrySheet** `kind="form"`, title unchanged (`Add time` / `Edit time entry`):
```
(grab)  [Cancel]            Add time
[info banner: Times are in company time (Asia/Kolkata).]
Task        [ Choose a task                 > ]
Date (yyyy-MM-dd)  [ 2026-10-10 ]   Fri, 10 Oct        weekday text under field; presets [Today][Yesterday]
Start (HH:mm) [ 09:30 ][-15][+15]    End (HH:mm) [ 11:00 ][-15][+15]
1h 30m      (preview)         presets: [End +30m][End +1h][End +2h]  (P2)
Note (optional) [ ........ ] 0/500
--- sticky footer ---
[ Delete entry ] (dangerOutline, edit only)      [ Add entry | Save entry ]   (+ "Confirm entry as correct" secondary above when auto-closed)
```
Typed-input UX (no new dependency): date and time fields use `keyboardType="number-pad"` with an input MASK that inserts `-`/`:` while typing (digits only; paste is normalised), so the user never needs the punctuation keyboard; labels keep `Date (yyyy-MM-dd)`, `Start (HH:mm)`, `End (HH:mm)`; validation (`validateEntry`) is unchanged and runs on the masked string; ±15 minute buttons call the same `setStart/setEnd` with a pure helper `shiftHHmm(value, ±15)` clamped to 00:00-23:59 (P2). Presets "Today"/"Yesterday" set the date from a new prop `todayDate` (company date, passed from `TimesheetScreen`'s `today`). Weekday text is derived with `formatDateLabel` when the date is valid. `dirty` = any seeded value changed (passed to the sheet so Cancel/back confirms discard). Overnight/open entries keep their disabled inputs + hint. **Picker option:** if the lead's phone test shows masked typing is still error-prone, the single justified dependency to propose is `@react-native-community/datetimepicker` (Expo SDK 54 compatible via `npx expo install`, works with Expo Go and dev builds, native date/time dialogs, no extra native code). NOT recommended now (company-timezone semantics make a device-timezone picker risky); requires lead approval.
Acceptance: at 320x640 with the keyboard open the focused field and the footer are both reachable; Delete/Confirm/Save are never clipped; Cancel with edits asks to discard.

### 5.8 Tickets
**List**: `PageHeader tab` title `Tickets`, trailing `Button compact icon add label "New ticket"` (string kept), project chip in the row below? To save height the project chip is a trailing element of the SAME header row only when there is room; Tickets keeps both: header row `Tickets` + project chip (right) and the New ticket button moves to the search row right side: `[ search ........ ][ + New ticket ]`. Status chips (`All, Open, In progress, Closed, Converted` with counts) in one scroll row (testIDs kept). Card via `EntityCard`: line 1 severity `Badge` (icon + text, tone from `severityTone`) + status badge; title (2 lines); meta "Project - Client"; footer "Assignee: X - 10 Oct". Empty: "No tickets yet" + action `New ticket`.
**Detail**: header `Ticket`; title `xl bold`; badges; facts card (Project, Client, Raised by, Assignee + compact `Change assignee`); **Status** card: compact `Button secondary` per target ("Mark Open", "Mark In Progress", "Mark Closed"; strings and testIDs `ticket-status-*` kept; they are Buttons now, not Chips). `Mark Closed` asks `Alert` "Mark this ticket as Closed?" / "You can change the status again later." / Cancel, "Mark Closed". Description; convert note; linked tasks; attachments; Notes with composer (counter). Client/role gating: not changed (Q4).
**Create**: `PageHeader push "New ticket"`; fields order: Title, Description (counter), Project (`OptionRow` sheet), Severity (`ChoiceChips`, default Medium as today), Client name: label shortened to `Client name (optional)` with helper text "Used only if the project has no client." (the long label string changes: see 7.4). Sticky footer: `Create ticket` primary. Success: replace to detail (as today) + toast "Ticket created".

### 5.9 Sprints
**List**: `PageHeader tab` + project chip; SectionList grouped by status (sticky headers) with `EntityCard`: name (2 lines) + days-left `Badge` (icon `time-outline`), "Project - 1 Oct to 14 Oct", 8dp `ProgressBar`, "62% - 8/13 tasks done - 2 blocked". Read-only: no actions. Empty: "No sprints".
**Detail**: header `Sprint`; title `xl`; status + days badges; goal; progress. **Metrics** 2-column tiles with one-line explainers under each label (`info` icon opens the same explainer sheet; texts derived from the fields only, no invented formulas):
- Progress: "{pct}% of tasks completed" (+ "{x}% of the original commitment delivered" when present).
- Committed: "Tasks and hours agreed at sprint start" / "n/a: No baseline yet" (kept).
- Delivered: "Tasks finished so far".
- Scope: "Tasks in the sprint now" with "+3 since commit" explained as "tasks added after the sprint started".
- Effort: "Hours logged against hours estimated" with "1.3x" explained as "logged is 1.3 times the estimate".
- Duration: "Planned working days" / "{n} days actual".
**Burndown**: rows `date | bar | remaining / ideal`, layout with flex (no fixed widths; date `minWidth 56 flexShrink 0`, number column `flexShrink 1` right aligned, wraps to two lines at large scale); bar uses `ProgressBar semantic="neutral"` with `markerPct` = ideal remaining percentage of the same max. State word per row (derived): "On or under ideal" with `checkmark` or "Above ideal" with `arrow-up`, `xs`, only when an ideal value exists. Footer note kept. Sub-sprints and task rows as `ListRow`s.

### 5.10 More and Profile
More: section 4.3. **Profile** (`ProfileScreen.tsx`): `PageHeader push "Profile"` (no second 2xl title); Account card (name `xl`, email, role); Appearance (`ChoiceChips`-style radio group, strings `System`, `Light`, `Dark`, labels `{x} theme`); Sign out as `dangerOutline` (was solid danger) at the bottom with the same dialog logic. Version/build text `2xs subtle` at the bottom is P2 (needs `expo-constants`, already a transitive dependency; ask before adding).

### 5.11 Global states checklist (every screen)
default, loading (skeleton), empty (with action where one exists), error (retry), stale (banner), offline (global strip), read-only (notice where an edit action is hidden), success (toast + haptic where listed), dark mode, 130/150/200% font scale, 320 and 430dp width.

---

## 6. Accessibility checklist (WCAG 2.2 AA)

**Contrast (computed, after the token changes)** light/dark:
text fg 17.74/15.68; muted 7.56/8.99; subtle 4.83/6.03 (min allowed for text); placeholder 4.83/6.03; brand text 6.29/6.57; primary button 6.29/7.08; danger button 4.83/6.97; badges 4.79-7.24 / 8.42-10.87; links in RichText = brand600 6.29. Non-text 3:1: field borders 3.30/3.93, tab indicator 6.29/6.57, unfiled dot 3.19/10.71, focus ring 2dp brand500 4.47/6.00, progress fills >= 3.0 (success 3.15, warning 3.04 on track in light; bars always have text values). Disabled controls are exempt.
**Target size (2.5.8):** all interactive controls 44x44 minimum via min size or `hitSlop`; Android tab items, header icon buttons and sheet rows 48dp via `Platform.select`; compact buttons 36dp visible + 4dp `hitSlop`; icon-only buttons never below 44. Spacing between adjacent compact targets >= 8.
**Labels (2.5.3 Label in Name, 1.1.1):** visible text is contained in the accessible name (Button static label; sheet close "Close" -> `Close {title}`); icon-only buttons have `accessibilityLabel`; decorative icons hidden; Avatar/StatusBadge/PriorityBadge expose text. Form inputs keep `accessibilityLabel={label}`; "(optional)" is visual only.
**Non-colour cues (1.4.1):** status = dot + text; priority = icon + text; tab selected = indicator + filled icon + weight; chips = border width + check; segmented = border + weight; Dev/QA = text names; errors = icon + text; Draft/Submitted = icon + text; flags = icon + text; target met = check + text.
**Focus and order (2.4.3, 3.2.x):** screen reader order = header, strips, content, footer; sticky footer after content; sheet traps focus (`accessibilityViewIsModal`); after closing a sheet focus returns to the trigger (default RN behavior; verify on TalkBack/VoiceOver); keyboard (hardware): Enter submits Login (kept `returnKeyType`), Tab moves email -> password -> show -> sign in.
**Live regions (4.1.3):** banners/toasts `alert` + `polite` (danger `assertive`); field errors `polite`; timer start/stop announced via `announceForAccessibility` (kept); the clock is hidden from screen readers (kept).
**Large text (1.4.4, 1.4.10):** font scaling stays on. Caps only on tab labels (1.15), badges and KPI values (1.3), avatar letter (1.2), compact button labels (1.3). At 130%: tab labels clamp, everything else grows. At 150%: footers with two buttons stack vertically; PageHeader title wraps up to 2 lines; chips wrap or scroll; EntityCard footers wrap (`flexWrap`); Burndown number column wraps. At 200%: tab labels use `adjustsFontSizeToFit` and may truncate, nothing else may clip (acceptance: no horizontal page scroll at 320dp, no text overlapping, primary actions still reachable). Verify on device: 360x640 at 100/150/200 and 320dp width.
**Reduce motion (2.3.3):** `useReducedMotion()` disables sheet slide, toast translate, skeleton pulse; no auto-playing animation otherwise.
**Timing (2.2.1):** error toasts persist (>= 8s, dismissible, persistent with screen reader).
**Orientation:** portrait only (app config), noted not as a failure.

---

## 7. Implementation plan

Order follows the developer's proposal. After each step the developer runs `npm run typecheck`, `npm run lint`, `npm test` and updates the listed tests in the same step. Cut order if scope must shrink: drop P2 first, then P1 within a step, never P0.

### Step 0: baseline (P0)
Run typecheck/lint/test and record counts (876 tests / 46 suites). Record the list of strings/testIDs in 7.4 against suites with `rg`. No code change. Risk: none.

### Step 1: tokens (P0) `src/theme/tokens.ts`
- Add `placeholder`, `fieldBorder`, `fieldBorderFocus`, `divider`, `avatarDev`, `avatarQa`, `indicator`, `dotWarn` per 2.5; `2xs` to 12/16; `spacing[0.5]`; `motion` constants; `fontFamilies` map; `iconSizes`.
- Behavior: no visual change until consumers switch. Acceptance: typecheck passes; `tokens.ts` still the only file with raw colours; unit test for the new values (ratios asserted with a small luminance helper in a test).
- Risk: low. Strings changed: none.

### Step 2: assets, fonts, splash, haptics, system UI (P1)
- `npx expo install expo-font @expo-google-fonts/inter @expo/vector-icons expo-splash-screen expo-system-ui expo-haptics` (the developer confirms SDK 54 versions; `expo-doctor` clean).
- `App.tsx`: `useFonts({Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, ...Ionicons.font})`; `SplashScreen.preventAutoHideAsync()` at module load; hide when fonts loaded or after 2500ms; `SystemUI.setBackgroundColorAsync(t.colors.app)` in `Shell` on scheme change (removes the white flash).
- `app.json`: add `expo-splash-screen` plugin with `backgroundColor` (light `#EEF2FF` = brand50, dark `#090B12` = surfaceApp). **App icon and splash artwork: NOT designed; the lead will request real artwork.** If a placeholder is needed to build, use a flat `#4F46E5` (brand600) 1024x1024 square with NO symbol, clearly TEMPORARY, adaptive-icon foreground = same colour, `monochrome` omitted. Any file additions/`app.json` edits are the developer's.
- `jest.setup.ts`: mock `expo-font`, `@expo/vector-icons` (render a plain `Text`/`View` with the glyph name), `expo-splash-screen`, `expo-system-ui`, `expo-haptics` (the developer owns this file).
- Acceptance: app boots to the real first screen without a font flash; a font failure falls back to system font; tests pass with mocks.
- Risk: medium (new native modules; needs an EAS build to verify). Strings changed: none.

### Step 3: primitives (the largest step; P0 items marked)
Files: `components/ui/{Text,Icon,Button,Chip,TabStrip,ChoiceChips,Badge,StatusBadge(TaskParts),Input,NumberField,Card,ListRow,EntityCard,OptionRow,PageHeader,BottomSheet,Toast,Banner,Skeleton,States,Misc(KpiCard,SegmentedControl,ProgressBar,Avatar),Screen}.tsx`, `hooks/useKeyboardInset.ts`, `hooks/useReducedMotion.ts`, `components/ui/index.ts`.
| item | P | behavior |
|---|---|---|
| BottomSheet scroll/keyboard/handle/`kind`/footer/dirty guard, "Done" -> "Close"/"Cancel" | **P0** | 3.9 |
| Button static label + sizes + icon + dangerOutline | **P0** | 3.3 |
| Input placeholder/border tokens, counter, optional, helper, unique nativeID | **P0** | 3.6 |
| Toast queue/dismiss/inside-modal/durations | **P0** | 3.10 |
| Text family mapping + maxFontScale | P1 | 3.1 |
| Icon, Badge icon, StatusBadge/PriorityBadge/FlagLine | P1 | 3.2, 3.5 |
| Banner unification, StripBanner | P1 | 3.11 |
| Skeleton, EmptyState/ErrorState with icon/action | P1 | 3.13, 3.14 |
| ListRow, EntityCard, OptionRow, TabStrip, ChoiceChips, PageHeader | P1 | 3.4, 3.7, 3.8 |
| KpiCard dense/info, SegmentedControl border, ProgressBar neutral/marker, Avatar | P1 | 3.15-3.18 |
| NumberField steppers, KeyboardDoneBar | P2 | 3.6 |
Acceptance: every primitive has default/pressed/disabled/loading/error states per its spec; no raw colours; Storybook-style demo not required; tests: each component renders in light and dark and exposes the documented roles/labels.
Risk: high for BottomSheet (used by 6 sheets) and Screen keyboard; keep old props working; ship BottomSheet first and run all sheet suites.

### Step 4: navigation chrome, More, Profile, Login (P0 for tab bar/strips)
Files: `navigation/AppTabs.tsx`, `moduleTabs.ts`, `useOpenModule.ts`, `ModuleHost.tsx`, `RootNavigator.tsx`, `screens/HomeScreen.tsx`, `screens/ProfileScreen.tsx`, `auth/LoginScreen.tsx`, `components/OfflineBanner.tsx`, `features/timer/RunningTimerBanner.tsx`.
- Tab bar (icons, indicator, labels, dot) **P0**; role priority P1; strips global **P0**; PageHeader everywhere with native headers hidden **P0**; More redesign P1; Profile/Login polish P2.
- Acceptance: five tabs fit at 320dp with no label clipping at 100% and 130%; the timer and offline strips show on Task Detail and Timesheet; Android back from a pushed screen returns to the previous tab with state intact; the unfiled dot shows on My Day (or More).
- Risk: medium (`navigationModules`, `tabsOverflow`, `RootNavigator`, `step0Ui` tests).

### Step 5: list screens (P0 for Tasks)
Files: `features/tasks/{TasksScreen,TaskCard,TaskParts,StatusSheet}.tsx`, `features/tickets/TicketsScreen.tsx`, `features/sprints/SprintsScreen.tsx`, `features/qa/QAScreen.tsx`, `features/projects/ProjectPicker.tsx`.
- Tasks compact toolbar + Filters sheet + Mine + TaskCard redesign **P0**; Tickets/Sprints/QA cards P1; skeleton/empty actions P1; ProjectPicker -> OptionRow, search kept P1.
- Acceptance: section 5.3/5.8/5.9/5.5.
- Risk: medium (`TasksScreen`, `TaskCard` memo equality, `ticketsUi`, `sprintsUi`, `qa` suites).

### Step 6: dashboard and timer UI (P1)
Files: `features/dashboard/{DashboardScreen,DashboardFrame,views}.tsx`, `features/timer/*`, `features/tasks/TaskParts.tsx (TaskRow)`.
- Today's focus first, dense KPIs, info sheets, quick Start (owner-only) + switch confirm, section expand. Style/layout plus the single UI-only expand state.
- Acceptance: 5.2. Risk: medium (`DashboardScreen`, `dashboardDays`, `timerUi` suites); quick Start reuses `useTimerActions` untouched.

### Step 7: detail screens and sheets (P0 for TimeEntrySheet; others P1)
Files: `features/tasks/{TaskDetailScreen,TaskDetailTabs}.tsx`, `features/qa/{QAPanel,QATaskScreen}.tsx`, `features/tickets/{TicketDetailScreen,TicketCreateScreen}.tsx`, `features/timesheet/{TimesheetScreen,TimeEntrySheet}.tsx`, `features/sprints/SprintDetailScreen.tsx`, `features/timer/TimerStatusPromptSheet.tsx`.
- TimeEntrySheet scroll/footer/mask/dirty **P0**; Task Detail header/action row/sticky TabStrip with Comments + More **P1**; QA verdict-first + Reopen confirm P1; Ticket status buttons + Close confirm P1; Burndown/metric copy P1; masks presets/steppers P2.
- Logic stays untouched: no state or handler moves out of these files; new code is JSX/styles, prop wiring, one pure helper (`shiftHHmm`), and one UI state each for the Task Detail tab selection (already exists) and the More sub-tab.
- Risk: high for `taskdetail`, `taskDetailQa`, `qaTransitions`, `timesheetUi`, `ticketsUi` suites (labels/tabs move).

### Step 8: My Day style-only (P0 sticky footer, P1 rest)
File: `features/myday/MyDayScreen.tsx` (+ `dayForm.ts` untouched). Footer via `Screen footer`, date stepper, target progress, optional marks/counters, empty action, line card layout. No effect/guard/merge code is touched.
- Acceptance: 5.6; `myDayFresh`, `MyDayScreen`, `midnight`, `staleContinuations` suites pass unchanged except the strings in 7.4.
- Risk: medium (700-line file; do style changes only).

### 7.4 Strings, labels and testIDs that change (update tests in the same step)
| Step | Change | Old -> new |
|---|---|---|
| 3 | BottomSheet picker close text | "Done" -> "Close" (a11y `Close {title}` unchanged); form sheets: "Cancel" leading, no "Done" |
| 3 | `OptionRow` selected | "✓ Selected" -> icon + "Selected" (ProjectPicker, AssigneeSheet, TicketCreate project sheet) |
| 3 | Pass/Fail/Confirm/Make primary/Remove visible text | `Pass {title}` -> "Pass" (a11y label stays `Pass {title}`); same for `Fail`, `Confirm {task_title}` -> "Confirm", `Make {name} primary` -> "Make primary", `Remove {name}` -> "Remove" |
| 3 | Input labels | visible "(optional)" suffix added (a11y label unchanged) |
| 3 | Loading text | skeleton containers still expose the same label text (hidden Text) |
| 4 | Tab badge | numeric `tabBarBadge: 1` removed; dot in `tabBarIcon`; More label `More, My Day not filed yet` when applicable |
| 4 | Back control | visible "‹ Back" -> chevron icon + "Back" (a11y "Back") |
| 4 | Native header titles removed | "Task", "Ticket", "Sprint", "Timesheet", "New ticket", "QA" are now PageHeader titles (same words; `Task` becomes the task code) |
| 4 | More screen | "More for {name}" -> "More"; paragraph removed; "Can edit"/"View only" badges removed from visible rows; "Not available in this version yet" appears once as the disclosure title (rows no longer repeat it; a11y label keeps the sentence) |
| 4 | Offline/timer strips | moved from the tab bar into PageHeader; testIDs same; tabs-only assertions about position need updating |
| 5 | Tasks filters | chips `chip-priority-*`, `chip-type-*`, `Backlog` and the "By status/By priority" segmented control moved into the Filters sheet; new `chip-mine`, "Filters" button; tests must open the sheet first |
| 5 | TaskCard | due text now always urgency-aware ("3d overdue", "Due today", "Tomorrow"); reopen badge `x2` -> "Reopened 2x"; Dev/QA avatars removed in favour of names; the "Move to..." row is now a footer button (same label) |
| 5 | QA chips | wrap -> single scroll row (testIDs same) |
| 6 | Dashboard order | Developer: Today's focus first; KPI cards now `dense`; KPI "Overdue" gains an info button (label `About Overdue`) |
| 7 | Task Detail tabs | `Overview, Time, QA, People, Comments, History, Files` -> `Overview, Time, QA*, Comments, More` with `More` sub-control `People, History, Files`; `QA` hidden when not relevant |
| 7 | QA panel | 4 tiles -> one summary line (testID `qa-summary` kept); Reopen gets a confirm Alert (new strings in 5.5) |
| 7 | Ticket status | `Chip` -> compact `Button` (labels `Mark X`, testIDs `ticket-status-*` same); `Mark Closed` gets a confirm Alert |
| 7 | Create ticket | client name label "Client name (optional, used only if the project has no client)" -> "Client name (optional)" + helper "Used only if the project has no client." |
| 7 | Sprint metrics | each tile gains an explanatory sub-line; `Burndown` rows no longer green at 75% |
| 8 | My Day | `Previous day`/`Next day`/`Today`/`Timesheet` buttons -> icon buttons for the first two (a11y labels same); `day-totals` text gains " of 8h"; Save/Submit moved into a sticky footer (same labels); empty state gains `Go to Tasks` |
Everything else (testIDs such as `login-submit`, `open-profile`, `qa-awaiting`, `week-total`, `item-*`, `ticket-*`) is preserved.

---

## 8. Review protocol

**How I review (code reading only; nothing visual is claimed):** for each step I read the diff and (a) grep for hex/rgb literals, off-scale spacing, `fontSize:`/`fontWeight:` literals outside tokens, `accessibilityLabel` presence on every `Pressable`/`Button iconOnly`, visible-text-in-label compliance, `hitSlop`/min sizes; (b) confirm no handler/effect/mutation moved in the heavy files (diff must show JSX/style only); (c) confirm testIDs/strings in 7.4 changed exactly as listed; (d) check light and dark token usage and the reduce-motion branch; (e) check sheets for `ScrollView`, footer and keyboard inset use; (f) flag every layout claim as Needs visual verification. I report findings by file:line with severity and a fix, and re-review after changes.

**On-device checklist for the lead (per step, after an APK build; light and dark; 100% and 150% font; a 320-360dp phone if available)**
1. Tokens/fonts/splash: no white flash on start; text is Inter (rounded letterforms); icons render (no empty boxes); placeholder text readable; input borders visible.
2. Primitives/sheets: open Add time, Project picker, Filters; keyboard up: the focused field and the footer buttons are visible and tappable; Cancel with edits asks to discard; picker sheet says "Close"; an error toast stays until you close it and shows above an open sheet.
3. Chrome: five tabs with icons, the active one has a bar on top and a filled icon; label not cut at 150%; the My Day dot appears when unfiled; the timer strip and offline strip show on Task Detail and Timesheet; back gesture works; More shows Profile first and a collapsed "Not available" list.
4. Lists: Tasks shows at least two cards on first screen; search + Filters + Mine work; due date and assignee names are visible without opening the card; Move to... works; red is not used for both type and priority.
5. Dashboard/timer: Today's focus is the first block; the quick-start play button appears only on tasks you own; starting while another timer runs asks to switch; Overdue info explains the difference.
6. Details: Task Detail tabs stay visible while scrolling; Start/Stop and Move visible without scrolling; QA verdict is the first block; Reopen asks to confirm; Mark Closed asks to confirm; burndown shows no green at 80% remaining.
7. My Day: Save/Submit stay at the bottom; the 8h progress is at the top; date arrows do not wrap; with keyboard open nothing is hidden.
8. Accessibility spot check (TalkBack/VoiceOver): tabs announce selected; icon-only buttons are named; sheet focus is inside; toasts are announced.

## 9. Questions for the lead

1. Confirm the PM/CTO tab priority puts My Day in More (with the dot on More).
2. Q4: should Client users see ticket assignee/status controls? Code and web currently allow them; if the server rejects, hide them (needs a backend answer).
3. Confirm the temporary solid-colour icon/splash placeholder is acceptable until real artwork arrives.
4. Confirm "Mine" stays default OFF.
5. Are Android API 24+ and iOS 15.1+ the real support floor (affects edge-to-edge/keyboard behavior)?
