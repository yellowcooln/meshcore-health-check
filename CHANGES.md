# Changes

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
