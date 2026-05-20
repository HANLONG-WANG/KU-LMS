# KU-LMS Design Code

> This document is the binding UI implementation standard for future AI/frontend work in this repository.
> Unless the user explicitly overrides it, new UI work MUST follow this file.

# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-05-18
- Primary product surfaces:
  - Login page
  - Logout page
  - Home dashboard
  - Course materials page
  - Course my-reports page
  - Notifications list page
  - Notice detail page
  - Messages inbox page
  - Messages detail page
  - Messages sent box page
  - Messages recycle box page
- Evidence reviewed:
  - `UI-Image/*.png`
  - `docs/ku-lms-extension-architecture.md`
  - `.omx/plans/prd-ku-lms-redesign.md`
  - `.omx/plans/test-spec-ku-lms-redesign.md`
  - `artifacts/fixtures/*.network-response`
  - current extension implementation under `src/content/*`

## Brand
- Personality:
  - Academic
  - Reliable
  - Calm
  - Efficient
  - Modern without being playful
- Trust signals:
  - Strong information hierarchy
  - Clean spacing
  - Clear labels for time, status, deadline, and ownership
  - Stable desktop-first layout
  - Predictable navigation across all pages
- Avoid:
  - Consumer/social-app styling
  - Excessive gradients, glassmorphism, neon, or heavy motion
  - Oversized hero sections
  - Marketing-style cards unrelated to academic workflows
  - Generic dashboard clutter

## Product goals
- Goals:
  - Make KU-LMS feel like a modern academic workspace.
  - Reduce scan time for schedule, deadlines, notifications, and messages.
  - Keep original LMS actions reachable and trustworthy.
  - Preserve information density while improving readability.
- Non-goals:
  - Reinventing the course workflows themselves
  - Social/community redesign
  - Mobile-first simplification at the expense of desktop utility
  - Decorative redesign that weakens usability
- Success signals:
  - A user can identify urgent tasks, open the right course, and reach the original actionable page with minimal friction.
  - Major surfaces feel visually unified despite different LMS source markup.
  - Future UI changes remain stylistically consistent.

## Personas and jobs
- Primary personas:
  - University students managing multiple courses
  - International students navigating Japanese academic interfaces
- User jobs:
  - Check weekly class schedule
  - Open a specific course quickly
  - Find urgent deadlines
  - Read notices and messages
  - Verify submission/report status
  - Reach source actions such as file download, detail view, pagination, sorting, and tab navigation
- Key contexts of use:
  - Laptop/desktop during study hours
  - High-cognitive-load contexts with many simultaneous tasks
  - Repeated daily use, so novelty must never outweigh clarity

## Information architecture
- Primary navigation:
  - Top bar is the global source of truth across all redesigned routes.
  - Required order:
    1. ホーム
    2. コース
    3. お知らせ
    4. メッセージ
    5. マニュアル
- Core routes/screens:
  - Login = pre-auth sign-in + support/notices surface
  - Logout = post-session confirmation + warning/next-step surface
  - Home = overview / triage surface
  - Course materials = course activity surface
  - My-reports = submission status surface
  - Notifications = system/course notice browsing surface
  - Notice detail = notice reading/detail surface
- Messages = inbox/work queue + sent/trash management surface
- Content hierarchy:
  - Level 1: page title / route identity
  - Level 2: route-specific navigation or filters
  - Level 3: primary actionable content
  - Level 4: secondary metadata and passive information

## Design principles
- Principle 1: **Urgency first**
  - Deadlines, unread state, important notices, and active route state must visually win.
- Principle 2: **Information-dense, not visually dense**
  - Preserve useful data, reduce visual noise.
- Principle 3: **One shell, many surfaces**
  - Global nav, card language, spacing, and type rhythm must remain consistent across pages.
- Principle 4: **Action proximity**
  - Detail links, download links, sort actions, and pagination controls must live near the data they operate on.
- Principle 5: **UI polish must never fake data**
  - If real data is unavailable, use neutral empty/loading/error states — never invented academic content.
- Tradeoffs:
  - Prefer desktop utility over aggressive responsive simplification.
  - Prefer stable classic patterns over experimental interaction models.

## Visual language

### Color
- Primary accent: `#2F6BFF`
- Primary hover/strong: `#1F5BE6`
- Soft primary background: `#EFF4FF`
- Text primary: `#1D2940`
- Text secondary: `#5D6785`
- Border: `#E6EBF5`
- Page background: `#F5F8FE`
- Card surface: near-white with high readability, visually equivalent to `rgba(255,255,255,0.97)` on pale background
- Danger: `#FF4D4F`
- Warning: `#FF9B33`
- Success: `#39B36B`
- Highlight gold: `#F4C51D`

#### Color rules
- Blue is for active navigation, links, positive focus, and neutral platform emphasis.
- Red is for urgency/importance/critical deadlines only.
- Orange is for pending/unsubmitted/attention-needed states.
- Green is for resources/completion-like calm status, not for success toasts everywhere.
- Do not invent extra brand colors unless explicitly approved.

### Typography
- Page title:
  - 28px
  - weight 900
- Section/card title:
  - 18px
  - weight 800
- Nav item:
  - 16px equivalent visual weight
  - weight 700–800
- Body primary:
  - 14–16px
- Metadata:
  - 12–13px
  - lower contrast than primary content
- Line-height:
  - generous enough for Japanese text blocks
  - do not compress multiline academic titles

### Spacing / layout rhythm
- Global page max width:
  - reference baseline remains 1448×1086
  - on wider desktop monitors, the shell may expand up to roughly 1720–1760px equivalent width when it improves information density and reduces unnecessary line wrapping
- Horizontal page padding: ~18–24px
- Card internal padding:
  - standard: 16–20px
  - hero/header card: 22–24px
- Grid gap:
  - primary: 18px
  - compact internal lists: 10–14px
- Use 4px rhythm but present mostly as 8/12/16/18/20/24 spacing choices.

### Shape / radius / elevation
- Large card radius: 22px
- Secondary card radius: 16–18px
- Small controls radius: 10–12px
- Chips radius: 10px or pill
- Shadow:
  - soft, cool-toned, low drama
  - similar intensity to `0 16px 40px rgba(38, 65, 139, 0.08)`
- Borders:
  - thin, pale, always present on major cards/tables

### Motion
- Motion must be restrained.
- Allowed:
  - hover color shift
  - active underline transition
  - panel fade/expand under 200ms
- Avoid:
  - springy animations
  - parallax
  - decorative loading transitions
  - large entrance animations

### Imagery / iconography
- Use thin outline icons.
- Stroke-based icons should visually align in weight and size.
- Icons support labels; they do not replace labels.
- Do not use emoji-style iconography.

## Components

### Existing components to reuse
- Top navigation shell
- White rounded card container pattern
- Message detail subject-first hero
- Status chip pattern
- Table/list row pattern
- Course tab bar pattern
- Sidebar navigation pattern

### New/changed components
- Login auth card
- Login support / notice side stack
- Weekly schedule matrix card
- Deadline stack card
- Notification card list
- Notice detail article shell
- Message inbox table shell
- Message folder warning banner
- Course section accordion/timeline hybrid
- My-report display settings popover
- Compact syllabus jump chip (`シ`) that sits immediately after course names and reuses the shared chip language

### Variants and states
- Chips:
  - red / orange / blue / green / neutral
  - purple for platform/tool-linked content when needed
  - compact blue micro-chip for direct syllabus jumps; it should stay small, bordered, and secondary to the course title link
- Buttons:
  - primary
  - ghost
  - neutral bordered
  - icon-only bordered
- Cards:
  - standard content card
  - summary card
  - sidebar card
  - route header card
- Table rows:
  - default
  - selected
  - clickable-link emphasis
- States:
  - active route
  - loading
  - empty
  - disabled
  - error-safe fallback

### Messages-specific hierarchy rules
- Message detail pages are **subject-first**:
  - the primary hero/title is the native `件名`
  - body-derived copy may appear only as secondary excerpt/supporting copy
  - the metadata grid must not repeat the subject as a separate tile/card once the hero already expresses it
- Message folder lists must keep native column truth while making `件名` the strongest scan anchor and demoting low-value whitespace.
- Message folder headers and body rows must share the same effective grid tracks; row-level horizontal padding may not shift body cells away from their matching headers.
- Receipt-style autogenerated subjects such as `レポートを受け取りました [...]` should render as a strong primary label plus small gray bracket metadata; keep that metadata inline in list rows, but place it on the line below the large title on the message-detail hero.
- Inbox subject rows should not add a second gray metadata line under the subject when the native table already exposes sender/date in dedicated columns.
- `その他のコース` may show the same red `締切が近い課題があります。` reminder chip used by timetable cards when same-tab cached evidence exists, but supporting copy/tooltip must still make the same-tab cache origin explicit; no chip must not visually imply that no deadline exists.

### Login-route guidance
- The login route is intentionally lighter than authenticated routes.
- It may show only:
  - login/auth controls
  - inquiry/contact information
  - notices
- It must not show authenticated top navigation, fake dashboard metrics, or unrelated decorative content.
- Brand treatment should stay calm and trustworthy; prioritize form clarity over hero imagery.
- If the route introduces helper/error/auth-status copy, it should reuse the same neutral/danger token logic as the rest of the redesign.


### Communication-route guidance
- Notice detail pages should feel editorial but still operational: metadata first, readable body second, return/navigation actions third.
- Message detail pages should feel like a calm record view inside the same shell: mode cue and immediate actions first, metadata second, body third, follow-up actions last.
- Sent box and recycle box should reuse the inbox workspace language, but their headings, warnings, actions, and columns must match the true folder semantics.
- Sent box rows should behave like a dense mail ledger: recipient first, subject visually dominant, attachment status compact, sent time compact and right-aligned.
- Sent box may keep its recipient-first semantics, but it should not quietly shrink typography or padding relative to inbox; cross-folder list styling should stay visibly unified unless semantics require a difference.
- Recycle box warning copy must be clearly visible and must visually outrank passive metadata.
- Folder navigation must preserve active-state orientation across inbox / sent / trash.

### Logout-route guidance
- The logout route is an auth-terminal surface, not an authenticated workspace.
- It may show only:
  - post-session warning/conflict text
  - farewell/session summary
  - next-step actions such as returning to login or closing the window
- It must not show authenticated top navigation, fake post-logout recommendations, or unrelated dashboard/course content.
- Brand treatment should stay calm and conclusive; prioritize state clarity and the next safe action.
- If the route introduces status chips or summary cards, they should reuse the same neutral/orange emphasis language as the rest of the redesign rather than inventing a new alert system.

### Token / component ownership
- Future AI must prefer updating the shared token/component patterns before adding one-off styling.
- If a component visually matches an existing one, extend the existing pattern instead of creating a new branch.

### Content-type visual tokens
- Course-material content should use stable semantic tokens when the type is known:
  - `資料` → blue + file/document icon
  - `アンケート` → green + checklist/list icon
  - `レポート` / `課題` → orange + clipboard/task icon
  - `試験` / `小テスト` → red + verified/badge icon
  - `LTIツール` → purple + link/tool icon
- The icon badge background must inherit the same semantic token family as the type chip; do not leave all material icons on a fixed blue background.
- `自習` and unknown/non-content utility types should use a neutral token instead of impersonating `資料`.
- Unknown types should fall back to a neutral token rather than reusing blue by default.

## Accessibility
- Target standard:
  - WCAG 2.1 AA equivalent intent
- Keyboard/focus behavior:
  - All actionable links/buttons/controls must be keyboard reachable.
  - Visible focus ring is mandatory.
  - Focus style should use blue accent without reducing readability.
- Contrast/readability:
  - Primary text must remain high contrast on white cards.
  - Metadata may be softer, but still readable.
- Screen-reader semantics:
  - Tables remain semantically table-like when data is tabular.
  - Navigation remains `<nav>`-like.
  - Buttons remain actual buttons when they trigger JS actions.
- Reduced motion and sensory considerations:
  - No essential information may depend on animation.

## Responsive behavior
- Supported breakpoints/devices:
  - Desktop-first baseline is authoritative.
  - Tablet collapse is allowed.
  - Small-screen support should degrade gracefully, not redefine the design language.
- Layout adaptations:
  - Desktop: multi-column layouts are preferred.
  - Narrow widths: columns may stack, but information order must remain logical.
- Touch/hover differences:
  - Hover is additive only.
  - Touch targets must remain comfortable when stacked.

## Interaction states
- Loading:
  - Use calm inline loading indicators or shell-level spinner.
  - Loading should preserve layout expectation.
- Empty:
  - Neutral, informative, non-accusatory copy.
  - Empty states must not look like errors.
- Error:
  - Fail open to native LMS when takeover cannot safely represent the page.
  - In supported shells, show concise explanation and keep user path forward.
- Success:
  - Minimal emphasis; avoid loud celebratory styling.
- Disabled:
  - Reduced contrast + pointer behavior off, but still readable.
- Offline/slow network:
  - Show stable placeholders or loading text; never fake missing academic records.

## Content voice
- Tone:
  - Calm
  - Practical
  - Institutional but modern
- Terminology:
  - Respect KU-LMS Japanese labels when they are already part of the user mental model.
  - Do not rename major navigation objects casually.
- Microcopy rules:
  - Short labels
  - No marketing language
  - No slang
  - Deadline/status wording should be explicit

## Implementation constraints
- Framework/styling system:
  - Current extension is repo-native JS/CSS under `src/content/*`; do not assume React/Vue/Tailwind.
- Design-token constraints:
  - Reuse the token vocabulary already encoded in `src/content/critical.css` unless intentionally revising the design system.
- Performance constraints:
  - Critical takeover shell must appear immediately.
  - Keep bootstrap lightweight.
- Compatibility constraints:
  - Must work with same-origin KU-LMS takeover architecture.
  - Must preserve native links/downloads/actions.
- Test/screenshot expectations:
  - Target screenshots are the approved `UI-Image/*.png` mappings recorded in `.omx/artifacts/visual-ralph/ku-lms-redesign/reference-manifest.json`.
  - Future UI work must compare against this visual language, even when exact pixel match is not the task.

## Hard rules for future AI UI work
1. Do **not** introduce a new color palette.
2. Do **not** replace the top nav structure without explicit approval.
3. Do **not** convert dense academic tables into oversized marketing cards.
4. Do **not** invent fake counts, fake deadlines, fake unread badges, fake course data, or fake user identity values.
5. Do **not** use modal-heavy UX where inline actions suffice.
6. Do **not** remove route-specific metadata that helps users scan time/status/source.
7. Do **not** create page-level visual styles that break shell consistency.
8. Do **not** use overly rounded, childish, or game-like UI treatment.
9. Do **not** use dark mode styling unless explicitly requested.
10. If uncertain, copy the existing repo design language more closely rather than improvising.

## Page-specific design contracts

### Home
- Must remain a two-column desktop dashboard.
- Left side is dominated by the schedule.
- Right side is a vertical urgency/communication stack.
- “Other courses” is secondary and lower on the page.

### Course materials
- Must feel like a course workspace, not a dashboard.
- Header card + subnav + 3-column information layout is the preferred pattern.
- Timeline left, core learning content center, section anchors right.

### My-reports
- Must remain table-first.
- Reading-heavy preview cells are allowed because they match the workflow.
- Display settings are secondary and unobtrusive.

### Notifications
- Must remain list/card browsing with clear importance and date/expiry visibility.
- Left sidebar is structural, not decorative.
- Pagination belongs at the top-right of the content pane.

### Messages inbox
- Must remain inbox-table-first.
- Bulk actions sit above the table.
- Search is right-aligned in the action bar region.
- Folder navigation remains in the left sidebar.

## Review checklist for future AI output
- Does it still look like the same product family?
- Is urgency visible within 2 seconds of scan?
- Are the primary actions still obvious?
- Did information density stay useful?
- Were any values faked instead of parsed from real data?
- Did the implementation preserve top-nav, card, and type rhythm consistency?
- Would this still plausibly match the approved UI images?

## Open questions
- [ ] Whether the design code should later be split into tokens/components/page contracts files if the extension grows substantially.
- [ ] Whether a formal dark theme is ever desired.
