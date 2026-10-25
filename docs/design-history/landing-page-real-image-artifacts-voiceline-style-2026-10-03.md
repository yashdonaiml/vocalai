# Landing page: real image artifacts, VoiceLine-style

VoiceLine's landing is built from rendered image artifacts, not just code-drawn cards: a hero product visual, a scrolling customer-logo strip, numbered Capture/Analyze/Coach sections each with its own app illustration, animated stat counters, and customer-quote photos. Our current landing only has code-drawn cards. This plan adds the missing artifact layer, generated in our earthy palette.

## What changes

1. **Hero product visual** — generate one wide rendered image of the aviroh console (agents list + live-call panel, warm off-white surfaces, taupe/sage/terracotta accents) and place it under the hero headline, replacing the code-drawn console preview. Slight tilt/shadow, floating above a soft gradient glow.

2. **Customer / industry logo strip** — a "Trusted by teams in…" marquee row of simple wordmark-style chips (Restaurant, Clinic, Realty, Salon, Logistics, Dental — generic industry marks, no real company names) scrolling slowly, muted Stone/Clay tones.

3. **Numbered section illustrations** — replace the three code-drawn artifact cards with three generated illustrations, one per step:
   - 1. Build — agent studio screen with a knowledge panel
   - 2. Deploy — deployment/version timeline visual
   - 3. Operate — live call with waveform and transcript
   Each in the same warm, soft, light style so the set reads as one family.

4. **Animated stat counters** — the stats band counts up when scrolled into view (0 → value), like VoiceLine's "0% efficiency" counters.

5. **Quote card** — one customer-quote block with a generated portrait photo, name/role, and a short quote, matching VoiceLine's testimonial photos.

## What stays

- Earthy pastel palette, light default; all images generated to match (warm off-white, taupe, sage, terracotta; no blue, no violet).
- Existing headline, proof strip, feature grid, three-steps, CTA, footer.
- Pixel font only on tiny system labels.

## Technical notes

- Images generated with the image tool into `src/assets/landing/` and imported as ES6 imports in `src/routes/index.tsx`.
- Counter animation: small `useInView`-style hook with requestAnimationFrame count-up, no new dependencies.
- Marquee: CSS keyframes in `src/styles.css` (duplicate the row for a seamless loop, `prefers-reduced-motion` respected).
- Verify with browser screenshots of each section in light mode; spot-check dark mode.
