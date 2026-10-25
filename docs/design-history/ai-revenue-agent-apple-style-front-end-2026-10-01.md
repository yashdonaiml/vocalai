# AI Revenue Agent — Apple-style front end

## Goal
A clean, Apple-inspired interface made of rounded, softly shadowed cards, organized into tabs where each tab covers one job. Front end only for now, with realistic sample data so every screen looks complete.

## Look and feel
- Light, airy background (soft off-white `#f5f5f7`), white cards, large rounded corners (around 24px), very soft shadows, thin dividers.
- Near-black text, gray secondary text, one accent color (Apple blue `#0071e3`) plus green/orange/red only for status.
- Large bold headings, generous spacing, frosted-glass top bar with a segmented tab switcher (like iOS/macOS).
- Subtle motion: cards fade and lift slightly on load and on tab change.
- Font: SF Pro system stack with "Inter Tight" as fallback for non-Apple devices.

## Tabs (each is its own page)
1. **Overview** — headline revenue number, 4 KPI cards (pipeline value, win rate, meetings booked, AI tasks done), revenue trend chart card, "Today's AI actions" card.
2. **Leads** — search plus filters, grid of lead cards (company, contact, fit score ring, source), side detail card when one is selected.
3. **Outreach** — campaign cards (status, open/reply rates), AI email draft card with tone picker and "Generate" button (sample output for now).
4. **Pipeline** — board of deal cards by stage (Prospect, Qualified, Proposal, Won), with stage totals.
5. **Insights** — AI recommendation cards ("Follow up with Acme — reply likely"), forecast card, top-performing channels card.
6. **Settings** — profile, connected services, and agent preferences as grouped cards (iOS settings style).

```text
[ Logo ]  ( Overview | Leads | Outreach | Pipeline | Insights | Settings )  [ Avatar ]
-------------------------------------------------------------------------------
  Big heading
  [ card ] [ card ] [ card ] [ card ]
  [     wide card          ] [ card ]
```

On phones the tab switcher becomes a bottom tab bar like iOS.

## Not included yet
Real data, logins, and live AI generation. These can be added next with Lovable Cloud.

## Technical details
- Routes: `/` (Overview), `/leads`, `/outreach`, `/pipeline`, `/insights`, `/settings`, each with its own head() metadata.
- Shared shell in `__root.tsx`: glass top nav with segmented `Link`s (active pill), mobile bottom bar.
- Reusable `GlassCard`, `StatCard`, `ScoreRing` components; design tokens (colors, radius, shadows) in `src/styles.css`.
- Sample data in `src/lib/mock-data.ts`; charts with recharts; motion via CSS/`motion`.
- Record the structure in `AGENTS.md` and save the design choices to project memory.
