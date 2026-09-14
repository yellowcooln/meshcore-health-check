# How To Run Mesh Health Check

## Purpose

Mesh Health Check measures how well a MeshCore `GroupText` message reaches your
observer network. The app generates a short code, waits for that code to appear
in the configured channel, then scores coverage based on the observer set for
that code.

It does not transmit anything. It only watches MQTT, matches messages, and
summarizes observer coverage.

## Select Nearby Observers

1. Open the coverage map and choose a **Search radius**: 5, 10, 15, 20, 25, 50,
   75, 100, 150 or 200 (`NEARBY_DEFAULT_RADIUS=100` by default), in the website `DISTANCE_UNIT` (`mi` by default, or `km`). Radius changes do not change the current selection until you
   click a location-source button again.
2. Click **Use my location** and allow the browser prompt, or pan the map and
   click **Use map center**. HTTPS (or localhost) is required for geolocation.
   Denial, timeout and unavailable/insecure location use the current map center
   with an explicit status message. If the map itself is unavailable, use manual
   observer controls instead.
3. Review the selected count and distance list. At most ten observers are chosen
   from the whole available directory, independent of a prior region filter.
   Distance ties are ordered by public key. No candidates means the previous
   selection is preserved, not silently reset to defaults.
4. Continue the normal health-check workflow: an unused waiting code can be
   replaced after selection; a used code is unchanged, so use **New Code** for
   the new target set. Send the displayed code yourself on MeshCore.

Only observers with `isActive: true` and a finite, positive `lastPacketAt` inside
`observerStats.windowSeconds` qualify. The browser checks the timestamp again at
selection time against its current clock. Unknown, future-dated and stale activity
is excluded even if a cached snapshot calls it active. Retained metadata and
`OBSERVER_RETENTION_SECONDS=0` do not make a node active. Numeric latitude/longitude
must be valid, and the observer `0,0` no-position sentinel is excluded. Keep device
and server clocks synchronized. A disconnected feed eventually produces no
eligible observers; restore MQTT/connectivity and retry. Activity/distances are a
selection-time snapshot, not continuous automatic retargeting.

Device coordinates are never written to browser storage, sent to the app server,
or used to center a device marker. Observer selections are page-local and only
keys are submitted to session APIs. Reload always restores the website default
set, discarding old cached selections and replacing a mismatched unused waiting
code. Used session history remains intact; defaults apply to the next code. Your browser/OS location
provider may use its own location services. Existing third-party map tiles reveal
the viewed area, and selected observer keys can imply an approximate area; this
feature does not promise anonymity. Distances are straight-line distances using the same `DISTANCE_UNIT` as receipts, and **proximity is not an RF
coverage guarantee** (terrain, antennas, links and repeater paths still matter).
Manual checkboxes, region filters and **Default Set** remain available and cancel
any pending location selection.

Proximity browser tests use mocked geolocation, activity and session fixtures;
they do not prove GPS accuracy or live MQTT/RF delivery. Location requests use
fresh high-accuracy estimates and show browser-reported accuracy in the configured distance unit, but
a desktop browser may still return a coarse position. Check whether the status
says browser location or map-center fallback. Serve over HTTPS (localhost is
allowed) and ensure a reverse proxy does not override the app's
`Permissions-Policy: geolocation=(self)` with a deny rule. Permission remains
explicit; high accuracy is a request, not a guarantee of GPS.

The footer links to the public `/privacy` page, also accessible before Turnstile
verification. It explains location processing, browser storage, retained shared
results, cookies and third-party providers. Operators should review it against
their own proxy logging and deployment services.


Location refinement lasts at most 12 seconds and keeps the most accurate fix. A
fix within 1 km reported accuracy can finish early; coarser or unknown accuracy
requires **Use approximate location** or **Use map center** without changing
targets automatically. Desktop network estimates cannot be made into GPS by this
app. Changing radius, region or manual targets cancels pending location work.
The pending fix is memory-only and discarded on acceptance, cancellation or reload.

## Requirements

- Docker and Docker Compose
- network access to the MQTT broker
- a valid MeshCore channel name and secret or channel hash
- writable `data/` storage for observer profiles, observer activity, and
  retained share-link results

## Setup

You can either clone the repo and build locally, or run the published Docker
image directly.

### Build From Source

1. Clone the repo:

```bash
git clone https://github.com/yellowcooln/meshcore-health-check.git
cd meshcore-health-check
```

2. Copy the template:

```bash
cp .env.example .env
```

3. Edit `.env`:

- set MQTT connectivity
- set `TEST_CHANNEL_NAME`
- set `TEST_CHANNEL_SECRET` or `TEST_CHANNEL_HASH`
- set `KNOWN_OBSERVERS` only for fixed defaults with no `INITIAL_REGION`
- leave `KNOWN_OBSERVERS` blank if the app should auto-select top recent
  observers from packet history
- set `REGIONS_FILE` for region controls using bundled or custom GeoJSON
- optionally set `ALLOWED_REGION_GROUPS` / `ALLOWED_REGIONS` for the allowed area
- optionally set `INITIAL_REGION` for an activity-ranked initial/reload region;
  **Default Set** ranks within the region currently selected by the user
- set `SITE_URL` to the public HTTPS origin when running behind a reverse proxy
- set `CARTO_BASEMAP_KEY` to enable CARTO Dark Matter tiles for the coverage map
- keep `TRUST_PROXY=1` behind one trusted reverse proxy, or set it to `false`
  when exposing the app directly
- enable Turnstile if the site is internet-facing
- leave `LOG_LEVEL=info` unless actively troubleshooting

See [ENVIRONMENT.md](ENVIRONMENT.md) for the full variable reference.

CARTO now requires a project API key for its Dark Matter raster tiles. Request
one from <https://carto.com/basemaps/apikey/>, register every hostname that will
serve this deployment (including `localhost` when needed), and put the key only
in `.env`:

```env
CARTO_BASEMAP_KEY=your-carto-key
```

The key is intentionally visible in browser tile requests, so do not reuse it
outside this project. If it is blank, the dashboard still supports its dark UI
theme but the coverage map falls back to OpenStreetMap tiles.

4. Start the service:

```bash
docker compose up -d --build
```

5. Open `http://localhost:3090` or put the service behind your reverse proxy.

### Run The Published Image

Use this path when you do not want to keep a git checkout on the host.

1. Create a new folder:

```bash
mkdir meshcore-health-check
cd meshcore-health-check
mkdir -p data
```

2. Create `.env` from the variables documented in
[ENVIRONMENT.md](ENVIRONMENT.md). At minimum, set MQTT and channel values.

3. Create `docker-compose.yml`:

```yaml
services:
  mesh-health-check:
    image: yellowcooln/meshcore-health-check:latest
    container_name: mesh-health-check
    restart: unless-stopped
    env_file:
      - ./.env
    environment:
      PORT: "3090"
    volumes:
      - ./data:/app/data
    ports:
      - "3090:3090"
```

4. Start it:

```bash
docker compose up -d
```

Image tags:

- `main` is the production branch.
- `yellowcooln/meshcore-health-check:latest` is the Docker image tag built
  from `main`.
- `yellowcooln/meshcore-health-check:dev` is the Docker image tag built from
  `dev`.
- Release tags and short-SHA tags are also published by the Docker workflow.

## User Flow

1. The user opens the site.
2. If Turnstile is enabled, the user solves the challenge on `/`.
3. The dashboard loads and creates a code.
4. The user sends that code to the configured channel.
5. The backend matches the code to the message hash seen by MQTT observers.
6. The dashboard shows health, receipts, path detail, repeaters, and map
   coverage when coordinates are known.
7. The user can copy a retained `/share/:sessionId` result link.

Users can run a check against:

- legacy fixed `KNOWN_OBSERVERS` defaults when `INITIAL_REGION` is blank
- dynamic top observers globally or within the configured initial/selected region
- a browser-selected custom observer set
- a configured region group or child region

## Result Meaning

- `VERY HEALTHY`: most target observers saw the packet
- `GOOD` or `FAIR`: partial target coverage
- `POOR`: very limited coverage or no receipts yet

Each code expires after `SESSION_TTL_SECONDS` and can be used up to
`MAX_USES_PER_CODE` times. Shared results are retained server-side for
`RESULT_RETENTION_SECONDS` and then pruned automatically.

## Observer Data

The app loads `data/observer.json` at startup so known names and coordinates are
available before fresh MQTT metadata arrives. If MQTT metadata publishes a
better name or location, the server writes it back to that file.

Without `data/observer.json`, unnamed observers show as hash prefixes until
metadata propagates. Observers without coordinates still work for scoring, but
they do not appear on the map. Geographic scope excludes unlocated observers
from new selections because their membership cannot be established.

The dynamic default observer set is stored in `data/observer-activity.json`.
For dynamic defaults, including `INITIAL_REGION` and selected-region Default Set,
the app ranks observers over
`OBSERVER_TOP_WINDOW_DAYS` and selects up to `OBSERVER_TOP_COUNT` observers.

When path hops can be matched to observers with coordinates, the app estimates
distance between those observers and shows the longest packet-path distance for
the check. Set `DISTANCE_UNIT=mi` or `DISTANCE_UNIT=km` to choose the displayed
unit. If the path hops are not known observers with coordinates, the longest
packet metric falls back to the farthest pair of receipt observers that saw the
message. When known observer anchors exist on both sides of unknown or
no-coordinate hops, the app estimates across that gap and labels it as
estimated. The `Who saw the message` cards show the receipt's path distance
when available, otherwise they show an observer-span distance to the farthest
other located observer in the result.

## Region Filters

Set `REGIONS_FILE` to a GeoJSON FeatureCollection to enable region targeting.
The bundled files include:

- `regions/us-states.geojson` for grouped US region filtering such as
  `New England -> Massachusetts`
- `regions/us-places.geojson` for city/place-level US filtering
- `regions/uk.geojson` for UK regional filtering
- `regions/de-bundeslaender.geojson` for German region filtering

The server uses `REGION_NAME_PROPERTY` for child labels and
`REGION_GROUP_PROPERTY` for parent groups. If the GeoJSON has no usable group
property, the UI falls back to a flat region button list.

## Turnstile

Turnstile is recommended for public deployments because public users and bots
can create codes. Rate limits help, but Turnstile is the cleaner first line of
defense. Private/internal deployments can disable it.

## Operational Notes

- The app only decodes the configured test channel.
- Docker Compose is the intended runtime path.
- Keep `data/` bind-mounted so learned observer names, observer history, and
  retained share links survive rebuilds.
- Keep port `3090` private to your reverse proxy or internal network.
- Set `SITE_URL` behind a reverse proxy so share links and social previews use
  the public site URL instead of an internal Docker hostname.
- Set `CORESCOPE_URL` to a CoreScope root such as
  `https://analyzer.newenglandme.sh` to open matched message hashes in
  CoreScope.
- `DASH_BROKER_HOST` affects only the dashboard label shown to users.
- `OBSERVER_HASH_DISPLAY_BYTES` affects only observer prefix display.
- `OBSERVER_RETENTION_SECONDS=0` disables stale-observer pruning.
- `LOG_LEVEL=debug` is useful only when tracing MQTT ingest or decode issues.

## Troubleshooting

- `MQTT offline`: check broker settings and credentials in `.env`.
- `WAITING` forever: verify the code was sent to the correct channel and that
  the packet reached MQTT.
- Shared result unavailable: confirm `RESULTS_FILE` is under mounted `data/`
  and the result has not exceeded `RESULT_RETENTION_SECONDS`.
- Raw pubkeys instead of names: add mappings to `data/observer.json` or wait
  for MQTT metadata.
- Map missing observers: confirm they have valid saved coordinates and are not
  filtered by `OBSERVER_RETENTION_SECONDS`.
- Region button missing: confirm `REGIONS_FILE` points to a readable GeoJSON
  file and observer coordinates fall inside that file.
- Turnstile never appears: verify `TURNSTILE_ENABLED`, site key, and secret key.
- Turnstile always fails: verify the hostname is allowed in Cloudflare.

## Geographic website scope

`ALLOWED_REGION_GROUPS` and `ALLOWED_REGIONS` are comma-separated, exact,
case-sensitive labels from `REGIONS_FILE` (using `REGION_GROUP_PROPERTY` and
`REGION_NAME_PROPERTY`). Both blank means unrestricted. When both are set,
matching either list is sufficient (union, not intersection).

For a New England-only website, excluding New Jersey:

```env
REGIONS_FILE=regions/us-states.geojson
ALLOWED_REGION_GROUPS=New England
ALLOWED_REGIONS=
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
No precise device coordinates are stored or sent to the server.
Location requests a fresh high-accuracy estimate and displays browser-reported
accuracy in the configured distance unit; GPS accuracy is not guaranteed. The public `/privacy` page
explains local storage, retained results, verification cookies and map providers.
