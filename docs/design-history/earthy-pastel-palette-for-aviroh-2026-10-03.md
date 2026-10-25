# Earthy pastel palette for aviroh

Replace the current blue industrial palette with the warm, earthy board you uploaded. No blue, no violet anywhere.

## Color roles
- **Primary (Brand, warm taupe):** Primary 500 `#8A6F47` for main buttons, selected tab, focus ring. Tints 50–300 for hover and selected backgrounds.
- **Secondary (sage):** Secondary 500 `#6F8F6B` for secondary buttons, "healthy" and "deployed" states.
- **Accent (warm terracotta):** Accent 500 `#C76F3D` for "live" and realtime moments (live calls, waveform, LIVE label). Used sparingly.
- **Earth (neutral):** Earth 500 `#7A6A54` for AI/agent markers and chart categories.
- **Status:** Success `#4F7F4E`, Warning `#D99A1B`, Danger `#B83A3A`, each with its 50 tint for soft badge backgrounds.
- **Surfaces:** page `#FFFCF7`, cards `#FFFFFF`/`#F7F4EE`, raised `#E2DDD4`, sidebar `#D4CEC4`.
- **Text:** primary `#1E1E1C`, secondary `#4A4843`, tertiary `#7A776F`, disabled `#A8A39C`.
- **Borders:** light `#E8E4DC`, default `#D6D1C7`, dark `#B8B1A7`.
- **Charts:** the 8 chart colors in order (`#C76F3D`, `#6F8F6B`, `#D9A46A`, `#A3B18A`, `#B85C3C`, `#E2C26E`, `#8C7A6B`, `#3E5A47`).
- **Tags:** green/yellow/orange/red/grey tag backgrounds from the board.

## Light and dark
- **Light becomes the default**, since the board is built around warm off-white surfaces.
- **Dark mode stays available** through the existing toggle: a warm charcoal version (deep brown-gray backgrounds, Stone-toned text) with the same accents, brightened slightly so they read on dark.

## Logo and favicon
Tile gradient changes to taupe → sage (`#8A6F47` → `#6F8F6B`), with the dark "A" peak and spark kept.

## What stays the same
Layout, cards, tabs, fonts (Inter Tight, Geist Mono, pixel only on tiny labels), and all functionality.

## Technical details
- Rewrite `:root` (light) and a `.dark` dark block in `src/styles.css` as oklch values converted from the hexes; add tokens `--color-earth`, tint tokens (`primary-50/100`, `success-soft`, `warning-soft`, `danger-soft`), and tag tokens; map `realtime` → accent terracotta, `intelligence` → earth, `info` → earth 300.
- Flip the theme toggle and the inline head script in `__root.tsx` to light-default, persisted under the same `aviroh-theme` key.
- Update `SystemLabel`/`Pill` tones in `src/components/apple.tsx` to use the soft tint backgrounds.
- Update `public/favicon.svg` and `logo.tsx` gradient stops.
- Swap any hard-coded chart colors to `chart-1..8`.
- Update memory (palette, Core line "never purple", light default) and the AGENTS.md color-token rule.
- Verify both themes in the browser for contrast on buttons, badges and text.
