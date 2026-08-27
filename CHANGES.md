# Changes

## v1.3.8

- added `CARTO_BASEMAP_KEY` support for authenticated CARTO Dark Matter map
  tiles and exposed the public project key through `/api/bootstrap`
- changed dark-theme map rendering to fall back to OpenStreetMap when no CARTO
  key is configured instead of requesting unavailable keyless CARTO tiles
- updated the Docker runtime from Node `22-slim` to `26-slim`

## v1.3.7

- changed the coverage map to follow the active session's expected observer set
  so geographic region and manual observer selections no longer leave unrelated
  directory observers visible on the map
- filtered invalid map coordinates, including the `0,0` no-position sentinel,
  non-numeric values, and coordinates outside valid latitude/longitude ranges
- added browser regression coverage for selected-region map scoping and `0,0`
  observer suppression
- updated `ws` to `8.21.3` and added weekly Dependabot monitoring for the
  Docker base image

## v1.3.6

- updated `@playwright/test` to `1.62.1`, `ws` to `8.21.2`, and
  `actions/setup-node` to `v7`
- updated transitive `ip-address` to `10.4.0` to resolve the npm audit
  advisories affecting IPv4 and IPv6 trust-boundary classification
- made client-address rate limiting honor Express `TRUST_PROXY` handling
  instead of trusting `X-Forwarded-For` independently
- added explicit boolean and numeric `TRUST_PROXY` parsing, including safe
  direct-access operation with `TRUST_PROXY=false`
- restricted the optional external hero link to HTTP(S) URLs before exposing
  it to browser navigation
- changed Docker production dependency installation to deterministic `npm ci`
  lockfile installs

## v1.3.5

- improved observer name learning from MQTT status metadata by using `origin`
  as a fallback name when explicit name fields are absent
- improved decoded MeshCore advert handling so advert names and coordinates are
  saved against the decoded public key, even when another observer received the
  packet
- allowed high-quality decoded advert names to refresh stale saved observer
  names without renaming the MQTT receiver observer
- made dynamic top-observer defaults honor observer retention so stale high-volume
  observers are not selected after they drop out of the dashboard window
- added optional `CORESCOPE_URL` support so matched message hashes can open
  CoreScope `#/packets/<hash>` routes
- added regression coverage with a synthetic Worcester observer advert for
  decoded advert name/location learning and receiver-topic safety
- updated dependency maintenance versions: `mqtt` to `5.15.2`,
  `@playwright/test` to `1.61.1`, and `docker/build-push-action` to `v7`

## v1.3.4

- added `SITE_URL` so Docker/reverse-proxy deployments can generate public
  absolute share links and social preview metadata instead of internal hostnames
- added Dependabot checks for npm and GitHub Actions updates against `dev`
- updated production dependencies: `dotenv` to `17.4.2` and Express to `5.2.1`
- updated the Express catch-all route for Express 5 route parsing compatibility
- updated browser test tooling with `@playwright/test` `1.61.0`
- updated GitHub Actions dependencies: `actions/checkout` to `v7`,
  `actions/setup-node` to `v6`, `docker/setup-buildx-action` to `v4`,
  `docker/login-action` to `v4`, and `docker/metadata-action` to `v6`

## v1.3.3

- fixed retained share links so `/share/:sessionId` pages and session API
  responses are not cached by the browser or service worker
- changed the share button payload to share only the retained result URL so
  paste targets do not prepend extra observer text before the link
- added packet-path distance estimates between known observer hops and a
  longest-packet distance metric, configurable with `DISTANCE_UNIT=mi` or `km`
- added an observer-span fallback for the longest-packet metric when packet
  path hops are not known observers with coordinates
- marked path-distance segments as estimated when they bridge unknown or
  no-coordinate hops between known observer anchors
- added distance labels directly to each `Who saw the message` receipt card,
  falling back to observer-span distance when per-path distance is unavailable
- escaped untrusted observer labels in the receipt timeline and Leaflet map
  popups to prevent CVE-2026-45323-style stored XSS from MeshCore/MQTT names
- updated safe same-major dependency versions for Playwright and MQTT
- updated the PWA service worker cache version and bypassed caching for dynamic
  `/share/` and `/api/` requests
- added API regression coverage for share/session `Cache-Control: no-store`
  behavior
- bumped the app version to `1.3.3`
- reworked the documentation by shortening `README.md`, tightening `HOWTO.md`,
  and moving the complete runtime variable reference into `ENVIRONMENT.md`
- added clone-from-source quick-start steps and published Docker image
  deployment instructions
- updated contributor guidance so env changes and release work keep
  `.env.example`, `ENVIRONMENT.md`, `HOWTO.md`, and `CHANGES.md` in sync

## v1.3.2

- added rolling observer activity tracking in `data/observer-activity.json` so
  the app can rank recent MQTT-connected observers over a configurable time
  window and auto-select the top default target set when `KNOWN_OBSERVERS` is
  blank
- added the observer activity env controls:
  `OBSERVER_ACTIVITY_FILE`, `OBSERVER_TOP_WINDOW_DAYS`, and
  `OBSERVER_TOP_COUNT`
- improved observer name handling so saved observer profile names stay stable
  instead of being too easily replaced by lower-quality live MQTT metadata
- stabilized the Observer Set list so routine live snapshot updates no longer
  reset the list content and scroll position while users are browsing nodes
- refreshed the status and telemetry palette to rely less on red/green
  contrast and work better for color-blind users
- added `OBSERVER_HASH_DISPLAY_BYTES` so the UI can show observer prefixes as
  1-byte, 2-byte, or 3-byte hash labels without changing packet decode rules
- aligned the remaining map-marker and "Scored Against" standby colors with
  the same accessible score-state palette used across the rest of the app
- added non-color seen vs not-seen treatment to map markers and score cards so
  observer state stays distinguishable even when hue alone is not enough
- fixed the `Scored Against` card layout so longer status labels do not
  overlap observer names
- included dependency maintenance updates for `qs` and `express`

## v1.3.1

- bumped `ip-address` from `10.1.0` to `10.2.0`

## v1.3.0

- thank you to @gadgethd for PR #14, which added the region-based observer
  filtering foundation for this release
- added server-side observer region detection from configurable GeoJSON
  boundary files so observers with saved coordinates can be assigned to named
  regions and optional parent groups
- added grouped region-filter controls above the observer selector so users can
  target an entire division such as `New England` or drill into a child region
  such as `Massachusetts`
- added bundled region boundary files for the UK, US states, US Census places,
  Germany, Australia, Canada, and France
- added the new region env vars:
  `REGIONS_FILE`, `REGION_NAME_PROPERTY`, and `REGION_GROUP_PROPERTY`
- added Docker image support for bundled region files so region detection works
  in container deployments, not just local source checkouts
- added flat/no-group fallback handling so custom GeoJSON files without a group
  property still render usable region buttons
- added region hierarchy test coverage for both grouped and flat region
  boundary files
- fixed the "Who saw the message" receipt timeline so the last observer marker
  stays inside the track instead of rendering half off-screen

## v1.2.5

- thank you to @mitchellmoss for the new web UI design that drove this release
- redesigned the dashboard, shared-result page, and landing flow into the new
  control-center UI with the new hero, command, and glance layout
- carried the repeater count feature from `v1.2.4` into the redesigned health
  score cards on both the live dashboard and shared-result view
- updated the shared-result experience to mirror the redesigned dashboard
  instead of using the older score-shell presentation

## v1.2.4

- added a repeater count metric to the health card by extracting unique relay
  hops from matched receipt paths
- exposed the repeater total in both the main dashboard and shared-result
  score cards

## v1.2.3

- fixed receipt-path handling so the app preserves and displays 2-byte and
  3-byte MeshCore hops instead of collapsing terminal observer hops to 1 byte
- added API coverage for both 2-byte and 3-byte path rendering so multi-byte
  route display stays locked in
- changed `OBSERVER_RETENTION_SECONDS=0` to disable stale-observer pruning
  instead of collapsing to the minimum retention window
- stopped decoded packet adverts from renaming observers and started ignoring
  bogus `0,0` coordinates so repeater self-announces do not pollute the
  observer directory
- stopped MQTT `/status` metadata from renaming other observers through
  `origin_id` or `origin`, so only the actual MQTT-connected observer topic
  can update its own identity
- stopped MQTT metadata with a mismatched embedded observer key from assigning
  another node's location to the topic observer, which prevents marker
  pileups at copied coordinates
- merged PR #8 to improve the current health score ring with status-based
  coloring and SVG stroke rendering, avoiding the previous conic-gradient
  artifact
- merged PR #9 to add the optional `data-map-observer-scope="expected"` page
  hook so custom deployments can make the coverage map follow the active
  session scoring set
- linked the footer version label to the repository changelog so users can
  click straight through to `CHANGES.md`
- fixed the shared-result page to use the same SVG score ring markup as the
  main dashboard, keeping the PR #8 score ring rendering consistent across
  both views

## v1.2.2

- changed the coverage map to show all known observers with saved coordinates,
  not just the current target observer set
- added `OBSERVER_RETENTION_SECONDS` so stale observers can drop out of the
  dashboard directory and map after a configurable age
- tightened the matched-message panel so long payloads stop dominating the
  score card while keeping the full message available on hover
- kept configured default observers visible in the selector even when they are
  no longer retained, so the default target set stays aligned with scoring
- updated the target preview and unused-session regeneration flow so changing
  the observer selection immediately updates the next code's scoring target
- expanded API and smoke coverage for retained default observers and
  observer-target retargeting
- fixed the dashboard smoke test to expect the retained empty-map note on a
  fresh boot, which restores GitHub Actions green status for this release

## v1.2.1

- switched runtime packet decoding back to `@michaelhart/meshcore-decoder`
- added a local postinstall compatibility patch so the published decoder still
  loads on Node 18
- fixed Docker build ordering so the decoder postinstall patch is available
  during image builds
- fixed the dashboard `Share` button so supported browsers use the native share
  sheet with the retained `/share/:sessionId` link
- kept clipboard copy as the fallback when the Web Share API is unavailable
- added smoke-test coverage for the browser share flow and retained share link
  payload

## v1.2.0

- added retained share links for session results via `/share/:sessionId`
- added `RESULTS_FILE` and `RESULT_RETENTION_SECONDS` for persisted result storage and expiry control
- added unique code generation across retained session results
- added automatic pruning of expired retained results from `session-results.json`
- added a dashboard `Share` button that copies a retained result link
- added retained result support to Docker with a bind-mounted `data/` directory
- updated docs and API coverage for retained results and share links

## v1.1.1

- added installable browser app support with a web manifest and service worker
- added an `Install App` dashboard button for browsers that expose install prompts
- added Apple touch icon and app-capable metadata to dashboard and landing pages
- added manifest endpoint coverage in API tests
- added `DASH_BROKER_HOST` so the dashboard can show a public broker label
  without exposing the internal MQTT connection host
- updated docs for installable app support and current feature set

## v1.1

- added observer coverage map with dark mode by default and a light-map toggle
- observer markers now show green for observers that saw the matched message and red for observers that did not
- observer coordinates are now learned from MQTT metadata and persisted into `observer.json`
- `observer.json` now supports saved observer profiles with `name`, `lat`, and `lon`
- added observer receipt timeline visualization by first-seen time
- linked matched message hashes directly to the packet analyzer
- added optional env-driven external hero link via `EXTERNAL_LINK_URL` and `EXTERNAL_LINK_LABEL`
- moved the repo reference to a footer note and hard-coded it to the project repository
- added local Leaflet-based map rendering without a CDN dependency
- fixed map tile loading under CSP and fixed tile-layer reload flicker on refresh
- fixed active-session hash alias handling so in-flight receipts do not reset coverage mid-run
- added API coverage for MQTT-learned observer coordinates

## v1.0

- initial standalone release of Mesh Health Check
- Docker-first deployment with `docker compose up`
- local `.env` runtime configuration only
- MQTT ingest and MeshCore packet parsing with `meshcore-decoder-multibyte-patch`
- channel message matching by generated code and message hash
- per-observer receipt tracking with path and radio metrics
- browser-session-only previous check history
- 10-minute code expiration and configurable max uses per code
- public browser UI with internal JSON endpoints for app state
- rate limiting for session creation
- optional Cloudflare Turnstile gate for new code generation
- dedicated Turnstile landing page with redirect into `/app`
- proxy-friendly deployment for Nginx and Cloudflare
- persistent `observer.json` mapping for observer names across restarts
- browser-side custom observer selection for the next generated code
- deployment-wide default observer target set via `KNOWN_OBSERVERS`
- decode scope limited to the configured test channel only
- `LOG_LEVEL=info|debug` runtime logging control
- Node unit tests and GitHub Actions CI for shared helper logic
- fixture-driven packet ingest tests and Playwright smoke tests
