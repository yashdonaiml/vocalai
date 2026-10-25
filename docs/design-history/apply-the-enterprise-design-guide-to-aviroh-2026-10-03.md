# Apply the enterprise design guide to aviroh

Use your Vocallay design guide and color board for **aviroh**. The product name stays aviroh, and the guide's ideas are adapted to it. The goal: minimal like ChatGPT, disciplined like Linear, packed with information like Databricks. Mostly neutral colors with deep forest green as a rare accent.

## What changes

**1. Colors (light and dark)**
- Light: page `#FAFAF8`, cards `#FFFFFF`, sidebar `#F4F4F1`, hover `#ECEDE9`, borders `#E7E7E2`, text `#202521` / `#6B6F6A` / `#888A85`, brand `#245C4F` (hover `#1B493F`), selected `#E4F0EA`.
- Dark: page `#191D1B`, sidebar `#151917`, cards `#222724`, hover `#2B312D`, borders `#353C37`, text `#F3F4F0` / `#A9B0AA` / `#828B84`, brand `#73B59D`, selected `#273D34`.
- Status colors: success `#278064`, warning `#C58B43`, error `#CB7164`, info `#647C85` (slate, not blue), each with a light tint for badges.
- Chart colors: muted teal, sage, sand, amber and coral from the board. Lavender is left out (no violet).

**2. Typography**
- Inter (with Geist Mono for IDs and numbers). Headings are compact and medium weight, not oversized.
- Numbers line up in columns in every metric and table.
- The tiny pixel labels (LIVE, DEPLOYED) become plain small uppercase Inter, since the guide asks for Inter/Geist only.

**3. Console layout: left sidebar instead of top tabs**
- A persistent left sidebar grouped as Build (Agents, Knowledge, Tools, Evals), Deploy (Deployments), Operate (Overview, Conversations, Usage) and Admin (Providers, Team).
- At the bottom of the sidebar: a usage meter and a workspace and user card, as on the board.
- It collapses to an icon strip and becomes a drawer on mobile.
- A compact top bar with search ("Search agents, calls…"), notifications, theme toggle and avatar.

**4. Shared building blocks, restyled once and used everywhere**
- Cards: 8px corners, 1px border, no shadow. Shadows only on menus and dialogs.
- Buttons in four flat styles: primary (green), secondary (outline), tertiary (quiet) and danger (soft red). Each has hover, focus, loading and disabled states. Square-ish corners, not pills.
- Status badges as small rounded labels with a dot: Online, Draft, Deployed, Error, Maintenance, Testing.
- Stat cards (label, number, change arrow, small icon tile), compact tables, inputs, selects and tabs, all matching the board.
- Pages are rebuilt from these pieces only, with no one-off styling.

**5. Pages**
- Overview matches the board: 4 stat cards, a call-volume bar chart, a call-outcomes donut and a recent-calls table.
- The other pages (Agents, Knowledge, Tools, Evals, Deployments, Conversations, Usage, Providers, Team) are restyled with the same pieces. Their features and data flow stay as they are.

**6. Home page clean-up**
- The guide bans glows, glass effects and gradients, so the new home page gets toned down. It keeps the floating menu bar, photo tabs, stats and testimonials.
- Removed or replaced: the green glow behind the headline, the frosted message cards (they become solid dark cards), the gradient call-to-action, and the pill-shaped buttons (they become 8px corners).

**7. Logo**
- Same mark, but on a solid forest-green tile with no gradient.

## Not changing
How the app works: routing, data, sign-in, runtime and providers are untouched.

## Technical details
- `src/styles.css`: rewrite the `:root` and `.dark` tokens and add `--hover`, `--sidebar`, `--muted-text`, `--brand-hover`, soft status tints and `--chart-1..6`. Set `--radius: 0.5rem`, set `font-family` on `body`, add a `tabular-nums` default for `.font-mono`, and drop the glow/gradient helpers.
- `__root.tsx`: load Inter instead of Inter Tight and drop the Silkscreen font. `SystemLabel`/`Readout` in `apple.tsx` switch to an Inter small-caps style, which keeps one place to change it.
- `app-shell.tsx`: rebuild on the shadcn `Sidebar` (`collapsible="icon"`) with the trigger in the top bar. Each group stays open when it holds the active route.
- `apple.tsx`: becomes the shared kit (Card, StatCard, StatusBadge, DataTable wrappers, PageHeader). The `ui/button` variants are updated to the four flat styles.
- Overview charts use recharts with muted token colors, in both themes.
- Landing (`index.tsx`): remove radial and gradient backgrounds, `backdrop-blur` and `rounded-full` buttons.
- Update memory (palette, typography with the pixel font retired, the never-glow rule) and the AGENTS.md rules about the pixel font and card primitives.
- Verify the landing, Overview and two other console pages in both themes in the browser.
