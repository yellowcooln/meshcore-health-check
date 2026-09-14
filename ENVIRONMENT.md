# Environment Variables

Copy `.env.example` to `.env` and set only the values your deployment needs.
Runtime configuration should stay in `.env`; do not hardcode deployment values
in source files.

## App

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3090` | HTTP listen port inside the container. |
| `APP_TITLE` | `Mesh Health Check` | Main site title and metadata title. |
| `APP_EYEBROW` | `MeshCore Observer Coverage` | Small hero/dashboard label. |
| `APP_HEADLINE` | `Check your mesh reach.` | Hero headline on the dashboard. |
| `APP_DESCRIPTION` | Generated coverage description | Site description and social metadata. |
| `SITE_URL` | blank | Public site URL used for generated absolute share links and social metadata. Set this when running behind a reverse proxy. |
| `CORESCOPE_URL` | blank | Optional CoreScope root URL. When set, matched message hashes link to `#/packets/<hash>`. |
| `CARTO_BASEMAP_KEY` | blank | Public browser key for CARTO Dark Matter map tiles. Without it, the map uses OpenStreetMap tiles while the dashboard can remain in dark mode. |
| `EXTERNAL_LINK_URL` | blank | Optional HTTP(S) hero/control-center external link URL. Other URL schemes are rejected. |
| `EXTERNAL_LINK_LABEL` | blank | Label for the optional external link. |
| `LOG_LEVEL` | `info` | Use `debug` only while troubleshooting ingest or decode behavior. |
| `TRUST_PROXY` | `1` | Express proxy trust setting. Use `1` behind one trusted reverse proxy or `false` for direct access so client IP rate limits cannot be spoofed with forwarded headers. |
| `DISTANCE_UNIT` | `mi` | Distance labels for packet-path estimates and nearby observer distances/search radii. Use `mi` or `km`; the nearby radius defaults to 100 in that unit. |

As of August 2026, CARTO requires an API key for Dark Matter raster tiles. Keep
the project key in `.env`, not Git. CARTO's browser integration exposes the key
in tile request URLs, so scope it to this project and its deployment hostnames.

## Storage

| Variable | Default | Purpose |
| --- | --- | --- |
| `OBSERVERS_FILE` | `data/observer.json` | Persistent observer profile map with `name`, `lat`, and `lon`. |
| `OBSERVER_ACTIVITY_FILE` | `data/observer-activity.json` | Rolling observer packet history for dynamic default observer ranking. |
| `RESULTS_FILE` | `data/session-results.json` | Retained session result store for `/share/:sessionId` links. |

Keep these paths under the mounted `data/` directory if data should survive
container rebuilds.

## MQTT

| Variable | Default | Purpose |
| --- | --- | --- |
| `MQTT_HOST` | `mqtt.example.net` | MQTT broker hostname when `MQTT_URL` is not set. |
| `MQTT_PORT` | `443` | MQTT broker port. |
| `MQTT_USERNAME` | blank | Optional MQTT username. |
| `MQTT_PASSWORD` | blank | Optional MQTT password. |
| `MQTT_TOPIC` | `meshcore/SITE/#` | Topic filter the app subscribes to. |
| `MQTT_TRANSPORT` | `websockets` | Use `websockets` or a TCP transport. |
| `MQTT_WS_PATH` | `/` | WebSocket path for MQTT-over-WebSocket brokers. |
| `MQTT_TLS` | `true` | Enables TLS for MQTT connections. |
| `MQTT_CLIENT_ID` | blank | Optional fixed MQTT client ID. |
| `MQTT_URL` | blank | Optional full broker URL override, such as `wss://host.example:443/mqtt`. |
| `DASH_BROKER_HOST` | blank | UI-only public broker label. Does not affect the MQTT connection. |

## Channel

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHANNELS_FILE` | blank | Optional repo-local channel file. Leave blank to use the direct channel env vars. |
| `TEST_CHANNEL_NAME` | `test-channel` | Channel name users send the health-check code to. |
| `TEST_CHANNEL_SECRET` | blank | Channel secret used to decode the configured channel. |
| `TEST_CHANNEL_HASH` | blank | Optional explicit channel hash when secret-based hash calculation is not desired. |

The backend keeps packet handling scoped to the configured test channel.

## Sessions

| Variable | Default | Purpose |
| --- | --- | --- |
| `SESSION_TTL_SECONDS` | `600` | Active code lifetime. |
| `RESULT_RETENTION_SECONDS` | `604800` | How long retained share results stay available. |
| `MAX_USES_PER_CODE` | `3` | Maximum matching messages per generated code. |
| `SESSION_RATE_WINDOW_SECONDS` | `600` | Rate-limit window for creating sessions. |
| `SESSION_RATE_MAX` | `30` | Max session creations per rate-limit window. |

## Observers

| Variable | Default | Purpose |
| --- | --- | --- |
| `KNOWN_OBSERVERS` | blank | Comma-separated full pubkeys for legacy fixed defaults when `INITIAL_REGION` is blank. Initial-region and selected-region defaults use activity ranking instead. |
| `OBSERVER_TOP_WINDOW_DAYS` | `7` | Lookback window for dynamic top-observer ranking. |
| `OBSERVER_TOP_COUNT` | `10` | Maximum activity-ranked default observers, including initial-region and selected-region Default Set. Nearby location selection has a separate fixed maximum of 10. |
| `OBSERVER_HASH_DISPLAY_BYTES` | `1` | UI hash prefix width: `1` = `AB`, `2` = `ABCD`, `3` = `ABCDEF`. |
| `OBSERVER_ACTIVE_WINDOW_SECONDS` | `900` | Active observer fallback window when no ranking history exists. |
| `OBSERVER_RETENTION_SECONDS` | `0` | Age cutoff for dashboard/map observers. Set `0` to disable pruning. |

`OBSERVER_HASH_DISPLAY_BYTES` only changes display labels. It does not restrict
which packets or path-hop sizes the app accepts.

Packet path distances are estimates based on observer coordinates and path-hop
hashes that can be matched back to known observers. Unknown or ambiguous hops
are skipped. If no hop-by-hop distance can be calculated, the longest packet
metric falls back to the farthest pair of receipt observers with coordinates.
When known observer anchors appear on both sides of unknown or no-coordinate
hops, the app still estimates that gap and marks it as estimated. Receipt cards
show path distance when available and fall back to observer-span distance when
only receipt observer coordinates are available.

## Regions

| Variable | Default | Purpose |
| --- | --- | --- |
| `REGIONS_FILE` | blank | GeoJSON FeatureCollection used to assign observer regions. |
| `REGION_NAME_PROPERTY` | `name` | Feature property used as the child region label. |
| `REGION_GROUP_PROPERTY` | `group` | Feature property used as the parent group label. |
| `ALLOWED_REGION_GROUPS` | blank | Comma-separated exact group labels allowed on this website. Combined with `ALLOWED_REGIONS` using union semantics; both blank means unrestricted. |
| `ALLOWED_REGIONS` | blank | Comma-separated exact region labels allowed on this website. Applies to custom GeoJSON worldwide, not only states. |
| `INITIAL_REGION` | blank | One exact region label for initial load/reload. Activity-ranked defaults override `KNOWN_OBSERVERS`; must belong to the allowed scope. |

Bundled examples include:

- `regions/us-states.geojson`
- `regions/us-places.geojson`
- `regions/uk.geojson`
- `regions/de-bundeslaender.geojson`

Leave `REGIONS_FILE` blank to disable region detection only when allowed-scope
and initial-region settings are also blank. Geographic settings require a valid
boundary file. Property labels are case-sensitive and independent of site title.
For custom `properties.title` labels, set `REGION_NAME_PROPERTY=title`.

## Turnstile

| Variable | Default | Purpose |
| --- | --- | --- |
| `TURNSTILE_ENABLED` | `true` | Enables the Cloudflare Turnstile landing flow. |
| `TURNSTILE_SITE_KEY` | blank | Public Turnstile site key. |
| `TURNSTILE_SECRET_KEY` | blank | Secret Turnstile verification key. |
| `TURNSTILE_API_URL` | Cloudflare verify endpoint | Verification API endpoint. |
| `TURNSTILE_COOKIE_NAME` | `mesh_health_turnstile` | Signed access cookie name. |
| `TURNSTILE_TOKEN_TTL_SECONDS` | `86400` | Turnstile access lifetime. |
| `TURNSTILE_BOT_BYPASS` | `true` | Allows known link-preview bots to read public metadata. |
| `TURNSTILE_BOT_ALLOWLIST` | common social bots | Comma-separated lowercase user-agent fragments. |
| `TURNSTILE_VERIFY_RATE_WINDOW_SECONDS` | `600` | Rate-limit window for Turnstile verification. |
| `TURNSTILE_VERIFY_RATE_MAX` | `10` | Max verification attempts per rate-limit window. |

Turnstile is recommended for public deployments. Private/internal deployments
can disable it.

## Geographic website scope

`ALLOWED_REGION_GROUPS` and `ALLOWED_REGIONS` are comma-separated, exact,
case-sensitive labels from `REGIONS_FILE` (using `REGION_GROUP_PROPERTY` and
`REGION_NAME_PROPERTY`). Both blank means unrestricted. When both are set,
matching either list is sufficient (union, not intersection).

For example, allow New England and initially select Massachusetts:

```env
REGIONS_FILE=regions/us-states.geojson
ALLOWED_REGION_GROUPS=New England
ALLOWED_REGIONS=
INITIAL_REGION=Massachusetts
```

Scope filters the observer directory, region options, configured/dynamic defaults,
map and nearby candidates, and new custom session targets. Unknown or unlocated
observers are excluded while scope is enabled. Unknown configured labels or
missing/unreadable boundaries fail startup clearly. Out-of-scope custom targets
return HTTP 400 (`observer_outside_geographic_scope`); no default candidates
returns HTTP 400 (`no_observers_in_geographic_scope`), never an unrestricted
session. Existing retained results, target sets and scoring are not rewritten.
MQTT ingestion/subscriptions are unchanged: this is not an IATA whitelist, and
stored observer metadata is not deleted. Restart the container after editing.

### Initial region and Default Set

Set `INITIAL_REGION=Massachusetts` with `ALLOWED_REGION_GROUPS=New England`
and blank `ALLOWED_REGIONS` to start/reload in Massachusetts while keeping all
New England regions available, including nearby selection. `INITIAL_REGION`
is one exact GeoJSON region label (blank preserves the
existing default). Unknown labels, missing boundaries, or defaults outside the
allowed scope fail startup. No matching defaults never falls back outside that area.

With `INITIAL_REGION` set, initial defaults rank recent activity inside the
configured region before applying `OBSERVER_TOP_COUNT` (10); if there is no ranked
history, active observers in that area are used. This takes precedence over fixed
`KNOWN_OBSERVERS`; fixed keys remain the legacy default only with no initial region.
The dashboard's **Default Set** uses recent top observers within the currently
selected region (active-window fallback when no history), not a fixed pubkey list;
it preserves that region. Reload restores the configured initial region. Region
buttons may select all observers there; Default Set narrows them to the top set.
**All** selects every observer in the allowed website area. Default Set after All
ranks across that entire area, not the configured initial region.
No precise device coordinates are stored or sent to the server.
Location requests a fresh high-accuracy estimate and displays browser-reported
accuracy in meters; GPS accuracy is not guaranteed. The public `/privacy` page
explains local storage, retained results, verification cookies and map providers.
