# Heavy VoiceLine-inspired redesign (landing + public pages)

Goal: make aviroh's public pages feel like voiceline.ai: same structure, rhythm, image style and finishing touches, using aviroh's forest green, aviroh's content and our own generated images (VoiceLine's images are not copied).

## What changes

1. **Top menu island**
   - A rounded floating bar with the logo on the left, centered links (Platform, Industries, Customers, Pricing, Company) and Login plus a black "Book demo" pill on the right.
   - A small phone-number chip under the bar that disappears when you scroll.
   - Industries and Company open simple dropdown panels.

2. **Hero**
   - A very large, tightly spaced headline ("Answer every call with the AI voice agent built on your business"), a short subline, and a black pill button with a quiet secondary button.
   - Below it, a strip of trusted-by logos in grey.

3. **Platform showcase ("1. Build 2. Deploy 3. Operate")**
   - The current tabbed photo card, restyled: tabs advance automatically with a progress bar under the active tab.
   - Floating dark speech bubbles and "actions prepared" chips over real-life photos, like VoiceLine's driver scene.

4. **Real-life scenes with the product placed on top** (new generated images)
   - Clinic front desk, restaurant host stand, and a field technician in a van.
   - Each shows a phone or laptop running aviroh, with a green orb and a "How can I help?" bubble.

5. **Numbered feature sections** (VoiceLine's 01 / 02 / 03 pattern)
   - Big number, headline, short text, three checkmark bullets and a large stat ("<300 ms answers", "100% of calls transcribed", "1-click rollback").
   - Sections alternate image left and right, each with a phone mockup on a soft grain background.

6. **Industries grid**
   - Six rounded photo cards (Restaurants, Clinics, Real estate, Salons, Logistics, Home services), each with a hover lift and a one-line use case.

7. **Testimonials carousel**
   - Large quote cards with a portrait, name and role, and arrow controls.

8. **Integrations band**
   - A grid of grey tool-type tiles such as calendar, CRM, phone line, helpdesk and webhooks. No real brand logos.

9. **Final call to action, VoiceLine-style**
   - "Leading businesses trust aviroh" logo strip, then a big rounded green panel titled "Give every caller an answer" with a black pill button.

10. **Footer**
    - Four columns (Platform, Industries, Company, Legal), a large faint "aviroh" wordmark across the bottom and a phone chip.

11. **Pricing and demo pages**
    - Pricing: a stacked-card effect (faded cards behind the main one), a gradient-free green eyebrow, and the trust strip.
    - Demo: a personal touch beside the form with a host card (photo, name and role, which you supply) and a "What to expect" list.

12. **Polish across the public pages**
    - Fade-and-rise animation on scroll, count-up numbers, the marquee, and a grain texture on image backgrounds.
    - Reduced motion is respected.

The signed-in console keeps its current sidebar layout, with the rounder buttons and cards already applied.

## Content I will invent (to be replaced by you)
- Customer names and logos.
- Testimonials and portraits.
- Stats.
- The demo phone number.
- The demo host's name and photo.

## Technical details
- Split `src/routes/index.tsx` into section components under `src/components/landing/` (Hero, Showcase, Numbered, Industries, Testimonials, Integrations, CtaBand). `SiteNav`/`SiteFooter` stay shared.
- New `useReveal` hook (IntersectionObserver) plus an `animate-rise` class; marquee and grain as CSS utilities in `src/styles.css`.
- About 9 new generated images in `src/assets/landing/` (3 scenes, 6 industry cards), plus a reused phone mockup.
- No backend changes. Head metadata is kept per route.
