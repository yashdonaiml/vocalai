# Typography system: sans + mono + a rare pixel accent

## Goal
Make aviroh feel futuristic and technical while staying enterprise-grade. Almost every word stays in a clean modern sans. A monospace font handles technical data. A pixel or squared "machine" font appears only on tiny system labels, about 2–5% of visible text.

## The three fonts

```text
Primary UI     Inter Tight (current)    everything: nav, forms, body, tables, prompts
Technical      Geist Mono               IDs, keys, numbers, model names, timestamps
Machine accent Silkscreen (pixel)       tiny uppercase system labels only
```

Fallback for the accent font: Chakra Petch (squared, less retro), if the pixel look feels too arcade-like in practice.

## Where each font goes

Machine accent (small uppercase, letter-spaced):
- Status chips: `LIVE`, `DRAFT`, `V3`, `DEPLOYED`, `CONNECTED`
- Test call panel: call state (`CONNECTING`, `LIVE`) and the waveform caption
- Readout labels on Usage cards (`CALLS`, `MIN`, `PASSAGES`); the numbers themselves stay in mono
- Channel tags in Conversations (`WEB_TEST`)
- Landing eyebrow "VOICE AGENT PLATFORM"
- Optional: a small `VOICE` tag next to the aviroh wordmark. The logo itself stays as it is.

Mono:
- Key hints (`…a1b2`), model IDs, session and conversation IDs, durations, timestamps
- Retrieval scores in the knowledge search test
- Usage ledger quantities

Never accent (stays in sans):
- Body copy, navigation, forms, buttons, tables, settings, agent instructions and prompts, transcripts

## Guardrails
- The accent font is only used through one shared label component, so overuse stays visible and easy to roll back.
- The accent is used only at 10–11px, in uppercase, and at most once or twice per card.
- Accent colors follow the existing meanings: Ion Cyan for live, Mint for healthy, Amber for warnings, Stealth Blue for deployed.

## Technical details
- Load Geist Mono and Silkscreen through `<link>` tags in `src/routes/__root.tsx`, next to the existing Inter Tight link.
- In `src/styles.css`, add `--font-mono` and `--font-pixel` theme tokens, plus a `font-pixel` utility with uppercase, wide letter-spacing and a small size.
- In `src/components/apple.tsx`, add a `SystemLabel` component (props: tone = live | ok | warn | deployed | muted) and a `Readout` component (pixel label + mono value).
- Swap the existing status pills in the agents list, agent studio header, test call, conversations, usage and landing to use `SystemLabel` and `Readout`. Apply `font-mono` to IDs, key hints, scores and ledger values.
- Save the typography rule to project memory: sans by default, mono for technical data, pixel only for system labels and never for body text.
- Check at desktop and mobile widths that the labels stay crisp and legible.
