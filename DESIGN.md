---
name: Mesh Health Check field utility
description: App-only code-led controls and count-first reception results.
colors:
  action: "#245eb0"
  action-hover: "#1c4f99"
  action-text: "#ffffff"
  dark-bg: "#191c20"
  dark-surface: "#202429"
  dark-secondary: "#272c32"
  dark-line: "#393f46"
  dark-line-strong: "#59616c"
  dark-text: "#f1f2f3"
  dark-muted: "#b0b7c0"
  dark-accent: "#8cbcff"
  dark-warning: "#e4bd6d"
  dark-unseen: "#efa4a0"
  light-bg: "#f6f5f1"
  light-surface: "#fdfcf9"
  light-secondary: "#e8e7e2"
  light-line: "#d0d0ca"
  light-line-strong: "#868b90"
  light-text: "#20252b"
  light-muted: "#555e68"
  light-accent: "#245eb0"
  light-warning: "#7c560a"
  light-unseen: "#ad3935"
typography:
  title:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.8125rem"
    fontWeight: 400
    letterSpacing: "normal"
  code:
    fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace'
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
  count:
    fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace'
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  meter: "2px"
  control: "4px"
  surface: "6px"
spacing:
  tight: "4px"
  control-gap: "8px"
  row: "12px"
  mobile-panel: "16px"
  section: "20px"
  controls-section: "24px"
  result-divider: "28px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.action-text}"
  reception-meter:
    height: "10px"
    width: "100%"
    rounded: "{rounded.meter}"
---

# Design System: Mesh Health Check field utility

## Overview

**Creative North Star: "Field utility"**

The app is a practical transmit-and-check workspace. Controls and real reception
evidence carry the page; branding stays recognizable without taking over the
first viewport. Phone use in changing ambient light requires both a dark and a
light theme, not an assumed dark-only radio aesthetic.

**Key Characteristics:**
- Compact configured identity, prominent transmit code and channel.
- Count-first reception, with score and diagnostics secondary.
- Flat surfaces, subtle separators and compact observer rows.
- Restrained blue for actions, selection and received state.

This system is implemented in `public/field-utility.css`, loaded after
`styles.css` by `index.html` only. Every rule is scoped to the app/theme body.
The older shared-result, access and privacy visual systems are not redesigned.
This document records source decisions, not a completed browser review.

## Colors

The frontmatter colors map directly to the app stylesheet's custom properties.
Dark uses charcoal backgrounds; light uses off-white backgrounds. Blue identifies
Copy code, active selections and received state. Warning and unseen colors are
reserved for measured results. Pending observers use muted neutral text/markers,
never the unseen color. Text always names the state as well as color.

## Typography

Use system sans for headings, instructions, observer names and buttons. Reserve
mono for the transmit code, IDs, count and percentage. No tracked uppercase
status pills. The configured eyebrow remains as a small identity label because
retaining operator branding is an explicit product requirement.

Code is 2.5rem on desktop and 2.125rem at widths up to 760px. Result count is
2rem, headings 1.125rem, controls/body guidance 0.875rem and labels 0.8125rem.
Instructions use a 70ch measure; the full-width score explanation allows 100ch
so its conditional region/location guidance remains visible without a disclosure.

## Layout

Shell maximum: 1240px with 20px side gutters (12px at up to 760px). Desktop
header puts identity left and utility actions right; mobile wraps utilities below
identity. The command area places transmit controls beside the count result,
then a shared explanatory note and collapsed Details. It stacks at 760px.

Map and report ledger use 1.2fr/0.8fr columns above 1100px and stack below.
Observer customization stays one column inside the map panel to avoid narrow
checkbox/filter columns. Preserve the 16px filter-to-list margin and 24px gap
before nearby controls. Map height is 360px, reducing to 320px on mobile.

Target rows are a single list with a minimum 52px height, not auto-fit cards.
Checkbox rows have a minimum 56px height. Let exceptional long names wrap rather
than clip identity; ordinary rows should stay within 76px at acceptance widths.
Controls remain at least 44px tall, with wrap-capable action groups.

## Elevation & Depth

Use separators and a second neutral surface, not gradients, glow, glass or
hover lifts. App panels and list rows have no shadows. Map tile content remains
provider-controlled; retain the existing CARTO key behavior and OSM fallback.
Native map controls remain recognizable. The diagnostic drawer uses existing
open/close behavior, a flat opaque surface and visible keyboard focus.

## Shapes

Surfaces use 6px corners, controls 4px, meter tracks 2px. List rows use square
edges with a single bottom separator. Map markers remain circular positional
symbols, not decorative progress rings. Borders are 1px.

## Components

- **Transmit:** plain mono code with channel directly below; Copy code is the
  filled primary button, New Code and Share are adjacent outlined actions.
- **Reception:** native determinate progress element `#reception-progress`, named
  "Selected observers reached". Its value is observed targets / expected targets,
  not health percentage or elapsed time. Before measurement value is zero but
  accessible text explicitly says reception is not yet measured; score stays `--`.
- **Targets:** name and hash left, Pending/Seen/Not Seen right. No repeated pills.
  Saved targets indicates explicit stored keys, not manual-selection provenance.
- **Selection:** existing checkboxes and region buttons, not a new search feature.
  Healthy normal rows show identity; exceptional stale/unmapped detail is retained.
- **Buttons:** 150ms background/border changes; hover, active, disabled opacity and
  2px accent focus outlines. No transform. Native checkbox/select affordances.
- **Reports:** one no-report explanation, timeline and real receipt detail. Check
  history honestly includes the current check. No decorative sparklines.

## Do's and Don'ts

- Do keep configured branding and channel wording intact.
- Do distinguish pending reception from measured zero or unseen targets.
- Do keep score-selection guidance visible and conditional on available controls.
- Do verify dark/light layouts, keyboard focus and no horizontal overflow.
- Don't change scoring, observer selection or location privacy through layout work.
- Don't add gradients, glow, giant rounded tiles or monospace UI labels.
- Don't apply these app-only overrides to shared-result or access pages.
