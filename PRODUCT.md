# Mesh Health Check

## Product and audience

A self-hosted browser utility for MeshCore users checking which MQTT-connected
observers receive a radio message. Operators use phones in the field and desktop
browsers when comparing checks or configuring observer targets. The app generates
a code; the visitor transmits it using MeshCore. The app never transmits for them.

## Core task

Copy a short code, send it to the configured channel, then inspect the received
observer count, score, map and receipts. Nearby/region/manual selection is
secondary. A used code retains its original scoring targets even when the current
map selection changes; applying different targets then requires a new code.

## Truth and constraints

- MQTT receipts are evidence of reception, not a guarantee of RF coverage.
- An unmatched code is unmeasured, not a failed check. A matched zero is a measured
  result. Keep these states distinct in counts, score text, lists and markers.
- Activity-ranked defaults may not suit a visitor's location. Keep the explanation
  visible beside/below the result, including conditional region and location guidance.
- Initial-region ranking, explicit All, selected-region defaults and geographic
  website scope retain their existing semantics. No UI redesign may broaden scope.
- Browser geolocation is opt-in and controlled by `BROWSER_LOCATION_ENABLED`.
  Device coordinates remain transient/browser-only; session requests send keys.
  Nearby choices reset on reload; used results and share links retain targets.
- Preserve configured title, headline, eyebrow, description, logo, channel and
  external links; do not replace operator identity with generic product copy.
- Preserve dark/light choice, PWA support, retained shares, history, diagnostics,
  and CARTO-key/OpenStreetMap fallback behavior. The environment remains the
  runtime configuration source.

## Confirmed visual commitment

A restrained, code-led field utility, not a rounded gradient dashboard. Use a
compact branded header, clear Copy code action, horizontal count-first reception
meter, small-radius controls, flat charcoal/off-white themes and compact list
rows. System sans serves operation; mono is for codes, identifiers and counts.
There is no new concept-selection round for this implementation.

## Scope and quality boundary

The replacement visual system applies to `/app`; shared results, access and
privacy pages keep their existing presentation. `DESIGN.md` records app tokens;
`.impeccable/surfaces/app.md` records this route's direction and acceptance checks.
Runtime, browser and deployment verification belong to the parent task. Source
implementation alone is not evidence of a visual or behavioral pass.
