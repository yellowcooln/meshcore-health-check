# How To Run Mesh Health Check

## Purpose

Mesh Health Check measures how well a MeshCore `GroupText` message reaches your
observer network. The app generates a short code, waits for that code to appear
in the configured channel, then scores coverage based on the observer set for
that code.

It does not transmit anything. It only watches MQTT, matches messages, and
summarizes observer coverage.

## Optional MeshCore Routing Scopes

This is separate from geographic `INITIAL_REGION`, `ALLOWED_REGIONS` and map
filters. Blank `MESHCORE_REGION_SCOPES_FILE` disables public-name matching.
No region registry is shipped or fetched. To opt in from a source checkout:

```bash
cp region-scopes.example.yml region-scopes.yml
# Edit regions: [] to a list of your own quoted public name strings.
```

The example is also packaged as `/app/region-scopes.example.yml` in the image.
For an image-only install, copy it from a stopped disposable container with
`docker create --name mhc-scope-example YOUR_IMAGE`,
`docker cp mhc-scope-example:/app/region-scopes.example.yml ./region-scopes.yml`,
then `docker rm mhc-scope-example`. Do not overwrite an existing operator file.
`region-scopes.yml` is ignored by Git and the build context.

Set this in your existing `.env` (do not replace it with `.env.example`):

```dotenv
MESHCORE_REGION_SCOPES_FILE=/app/config/region-scopes.yml
```

Only after creating the file, add an optional Compose override; do not add a
missing-file bind to the default Compose configuration:

```yaml
services:
  mesh-health-check:
    volumes:
      - type: bind
        source: ./region-scopes.yml
        target: /app/config/region-scopes.yml
        read_only: true
        bind:
          create_host_path: false
```

Build the new source image with `docker compose build mesh-health-check`, or
pull an explicitly selected published image containing this feature first.
Recreate using your existing Compose files/overrides (include any extra `-f`
arguments you normally use):

```bash
docker compose up -d --no-build --pull never --force-recreate mesh-health-check
```

Repeat recreation after editing the YAML; it is read once at startup.
`docker compose restart` does not reload changed env-file values. Preserve all
existing `.env`, data, logo mounts and overrides. Remove stale frontend binds
that mask packaged UI updates. Verify `/api/bootstrap` contains
`meshcoreScopes: {"enabled":true,"count":N}` and inspect Details/receipt info on
a decoded received test-channel GroupText result. An empty list is valid
(`enabled: true, count: 0`) but cannot recognize named scopes.

The only YAML key is `regions`, a list of at most 1024 public strings; maximum
file size is 65536 bytes. Each name must fit the firmware's **30 UTF-8 bytes as
written**, including an explicit `#`; an explicit hashtag leaves 29 bytes for
the body. Bare names may use 30 bytes before the implicit `#` is added. Names
are never silently truncated. Firmware-invalid punctuation such as `.` or `/`
is rejected; valid accented UTF-8 names and hyphens remain supported. Quote names
starting with `#` (otherwise YAML interprets them as comments). An implicit `#`
is added, case is preserved, and duplicate normalized names are rejected.
Malformed YAML, extra keys/documents, custom tags, aliases/anchors, nonstrings,
empty names, whitespace/control characters, wildcards and `$` private names
are rejected with `MESHCORE_REGION_SCOPES_FILE` startup errors. Missing,
unreadable or nonregular configured files also fail startup, never silently
disable recognition. Do not put private transport keys in this file.

**Interpretation:** Details and share pages show distinct recorded MeshCore
scope observations; each observer receipt preserves all distinct results even
when the same message is forwarded with different transport scope. `known`
means one configured public-name candidate, not proof of identity; the UI displays
just the matched name, without a Candidate prefix. `ambiguous` retains an explicit
label and means multiple configured candidates, `unknown` means a scoped packet with no
configured match (possibly an absent public name or private scope), and
`unscoped` means an ordinary route or first transport code zero/wildcard.
The UI displays **No scopes observed** for unscoped packets or no receipts;
the interpretation notes here are not repeated beneath the scope field.
`disabled` means a scoped packet arrived while name matching was off;
`unavailable` means the required decoded GroupText/raw payload was unavailable;
`not-present` means legacy data without a recorded scope. No historical result
is recalculated after a file change. Older records cannot be backfilled.

Codes are 16-bit packet-dependent HMACs, **not stable region IDs**. Matching
uses the original encrypted payload plus payload type and the first transport
code via the installed decoder; the second code is not another named scope.
It cannot infer repeater configured membership, geographic location or a
globally fixed message region. Only successfully decoded received GroupText
packets are evaluated; scoring, channel matching and observer selection do not
depend on scope recognition. No RF transmission is performed.

The wire semantics follow upstream firmware
[`Packet.h`](https://github.com/meshcore-dev/MeshCore/blob/main/src/Packet.h),
[`RegionMap.cpp`](https://github.com/meshcore-dev/MeshCore/blob/main/src/helpers/RegionMap.cpp)
and [`TransportKeyStore.cpp`](https://github.com/meshcore-dev/MeshCore/blob/main/src/helpers/TransportKeyStore.cpp):
route types 0/3 carry two codes, the first code selects a public-name candidate,
zero is wildcard, and public-scope transport keys derive from the first 16 SHA-256 bytes of
the case-preserved hashtag name. Matching uses the installed
`@michaelhart/meshcore-decoder` implementation rather than a local HMAC copy.

## Optional Longer Test Codes

Leave `ALLOW_LONGER_TEST_CODES=false` (the default) for six hex characters after
`MHC-`. To opt in, set `ALLOW_LONGER_TEST_CODES=true` in `.env` and recreate
the Compose service. A **Code length** slider beside the code actions starts at
6 and allows 6-16 characters in steps of 1, including odd lengths. Choose a length,
then click
**New Code**. Moving the slider never changes the current code, saved targets,
receipts, score or shared results. Newly generated codes, including automatic
unused-code replacements after observer changes, use the selected length.
Reload resets the slider to 6 without rewriting retained sessions. Copy code
copies the full code. This changes the code suffix itself, not message padding;
the app still does not transmit messages. Existing six-character codes remain valid.

## Select Nearby Observers

`BROWSER_LOCATION_ENABLED=true` (default) offers **Use my location** only as
an explicit visitor action; it never requests permission on load. Set it to
`false` in `.env` and recreate the Compose service to hide browser and approximate
location controls and deny geolocation. **Use map center**, the search radius,
region filters and manual observer selection remain available. Score guidance
points to the available action. Regional guidance appears only when bootstrap
provides usable regions, naming the selected region/group or all available
regions. When usable region options exist, the note also suggests choosing a region
under **Change observers**; no regional suggestion appears without those options.

1. Open **Change observers** above the coverage map, then choose a **Search radius**: 5, 10, 15, 20, 25, 50,
   75, 100, 150 or 200 (`NEARBY_DEFAULT_RADIUS=100` by default), in the website `DISTANCE_UNIT` (`mi` by default, or `km`). Radius changes do not change the current selection until you
   click a location-source button again. The previous distance list and blue search
   origin remain visible, with the changed radius explicitly marked as not applied.
2. When browser location is enabled, click **Use my location** and allow the browser prompt, or pan the map and
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
   the new target set (or **Generate new code** in the next-code selection notice).
   **Current code targets** and its score retain the used code's saved observers;
   the map previews the new selection. Send the displayed code yourself on MeshCore.
   Unmatched checks and history show **Awaiting message**, not a failed score.
   Open **Details** beside the code for secondary diagnostics.

Only observers with `isActive: true` and a finite, positive `lastPacketAt` inside
`observerStats.windowSeconds` qualify. The browser checks the timestamp again at
selection time against its current clock. Unknown, future-dated and stale activity
is excluded even if a cached snapshot calls it active. Retained metadata and
`OBSERVER_RETENTION_SECONDS=0` do not make a node active. Numeric latitude/longitude
must be valid, and the observer `0,0` no-position sentinel is excluded. Keep device
and server clocks synchronized. A disconnected feed eventually produces no
eligible observers; restore MQTT/connectivity and retry. Activity/distances are a
selection-time snapshot, not continuous automatic retargeting.

Device coordinates are never written to browser storage or sent to the app server.
A temporary blue dot marks the chosen search origin; it is not included in map
fit bounds and is cleared when the nearby selection is cleared or the page exits.
Observer selections are page-local and only
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
`Permissions-Policy` geolocation directive with a deny rule when
`BROWSER_LOCATION_ENABLED=true`. With the setting false, `geolocation=()` is
intentional; use map-center selection instead. Permission remains
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
- leave `CARTO_BASEMAP_KEY` blank for keyless OpenFreeMap dark tiles; set it only
  to retain optional CARTO Dark Matter raster tiles
- keep `TRUST_PROXY=1` behind one trusted reverse proxy, or set it to `false`
  when exposing the app directly
- enable Turnstile if the site is internet-facing
- leave `LOG_LEVEL=info` unless actively troubleshooting

See [ENVIRONMENT.md](ENVIRONMENT.md) for the full variable reference.

The dark coverage map uses OpenFreeMap by default; no API key is needed. MapLibre
6.15.0 and its Leaflet bridge are served locally as ordered modules, including
the self-contained same-origin module worker. The PWA precaches its exact
versioned URL for offline worker loading. The browser fetches the style,
tiles, sprites and fonts from `tiles.openfreemap.org`. Light mode uses
OpenStreetMap raster tiles. Unsupported WebGL2 or vector-provider errors fall back
to OpenStreetMap without disabling markers, popups or nearby selection. The
service worker caches the local renderer assets, not external map resources.

For optional CARTO Dark Matter raster tiles instead, request a project key from
<https://carto.com/basemaps/apikey/>, register the deployment hostnames (including
`localhost` when needed), and put the key only in `.env`:

```env
CARTO_BASEMAP_KEY=your-carto-key
```

The key is intentionally visible in browser tile requests, so do not reuse it
outside this project. Clear it to return to the default OpenFreeMap dark map.
CARTO tile images explicitly use `strict-origin` referrer policy so authorized
keys receive the site origin, but not dashboard/share paths or query strings.
Other resources retain the app's global `no-referrer` policy. Version 1.3.9
omitted this tile-specific policy and can receive HTTP 403 from CARTO even
with a correctly configured key. Upgrade/rebuild the app rather than rotating
the key, removing hostname restrictions, or weakening proxy security headers.

For an existing default source/Compose installation, after the fix is published
to the branch or release you deploy, run these commands from that checkout:

```bash
git status --short
git pull --ff-only
docker compose build --pull mesh-health-check
docker compose up -d --no-build --pull never mesh-health-check
```

Resolve or preserve local tracked changes before pulling. Keep the existing
`.env` and `data/` directory; no key rotation or environment changes are needed.
The default Compose file builds from source, so `docker compose pull` alone
cannot install this fix. Refresh the dashboard after the rebuilt container starts.

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

## Upgrading to v1.4.1

This dependency/security patch adds no environment settings or data migration.
Preserve `.env`, Compose overrides, logo mounts and persistent data. From the
selected source revision, run `docker compose build --pull mesh-health-check`,
then `docker compose up -d --no-build --pull never --force-recreate mesh-health-check`.
For image-only installs, select an actually published 1.4.1 tag, pull it, then
use the same recreate command; a local commit does not publish an image.
Verify `/api/bootstrap` reports `site.version: 1.4.1`. Reload installed apps
after the service worker activates so the new local renderer and exact versioned
worker are cached together. External tiles/styles still require network access.
The [v1.4.0 checklist](#upgrading-to-v140) below also applies when upgrading
from an older release, including reconciling frontend overrides.

## Upgrading to v1.4.0

Back up the existing `.env`, Compose/override files and mounted `data/` before
upgrading. Preserve your MQTT/channel settings, Turnstile keys, site branding,
networks and persistent mounts. Compare `.env.example` with your existing `.env`;
do not copy the template over a working configuration.

The new settings are optional:

- `ALLOW_LONGER_TEST_CODES=false`: six-character suffixes remain the default.
  Set `true` to offer the 6-16-character slider for newly generated codes.
- `BROWSER_LOCATION_ENABLED=true`: browser location remains opt-in per visitor.
  Set `false` to hide it while keeping map-center and manual selection.
- `NEARBY_DEFAULT_RADIUS=100`: choose a supported radius in `DISTANCE_UNIT`.
- `MESHCORE_REGION_SCOPES_FILE=`: leave blank to disable routing-scope name
  recognition. To opt in, copy the empty example, add your own public names,
  and configure the read-only YAML mount described under
  [MeshCore routing scopes](#optional-meshcore-routing-scopes). No public
  region list is included, and existing receipts are not backfilled.

Review `ALLOWED_REGION_GROUPS`, `ALLOWED_REGIONS` and `INITIAL_REGION` for regional
sites. Fixed `KNOWN_OBSERVERS` defaults remain supported when `INITIAL_REGION`
is blank. Blank `CARTO_BASEMAP_KEY` now uses keyless OpenFreeMap dark maps;
a configured key continues to select CARTO. Remove or reconcile any old full-file
`app.js` overrides, which otherwise mask the new frontend. Preserve logo mounts.

For a source checkout, select the branch or release containing v1.4.0, then run:

```bash
git status --short
git pull --ff-only
docker compose build --pull mesh-health-check
docker compose up -d --no-build --pull never --force-recreate mesh-health-check
```

For an image-only deployment, first select a published tag containing v1.4.0
in Compose, then run:

```bash
docker compose pull mesh-health-check
docker compose up -d --no-build --pull never --force-recreate mesh-health-check
```

A feature-branch push alone does not publish a release image or update `latest`/`dev`.
Use a tag that has actually been published. A checkout pinned to a tag must
explicitly select the desired release rather than relying on `git pull`.
Recreation reloads `.env`; `docker compose restart` alone does not.

After startup, check `/api/bootstrap`: `site.version` should be `1.4.0`,
`mqtt.connected` should become true, and `codeOptions.maxLength` should be 6
or 16 according to `ALLOW_LONGER_TEST_CODES`. Refresh the dashboard to pick up
the updated PWA shell. Confirm channel guidance is visible beside the code,
observer targets and map match your selection, and the slider appears only
when enabled. Test a new code on the configured channel to verify actual RF
receipts; successful HTTP responses alone do not prove radio delivery.

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
- `POOR`: very limited measured target coverage
- **Awaiting message**: no matching message yet; the check is unscored, not failed
- **Signal data unavailable**: a message matched, but its receipts lack usable
  RSSI/SNR readings; observer coverage can still be scored

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
unit. Set `CODE_PREFIX` to brand the generated test codes for your mesh, for
example `CODE_PREFIX=CUSTOM` produces codes like `CUSTOM-1A2B3C`; existing codes and
share links keep working because matching uses each session's full code. The
prefix is trimmed and uppercased; only 1-8 ASCII letters or digits are accepted,
and invalid values use `MHC`. It does not count toward the optional 6-16 hex
suffix length. Recreate the Compose service after editing `.env`; restart alone
does not reload it. Existing results are not regenerated.

If the path hops are not known observers with coordinates, the longest
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
With fixed `KNOWN_OBSERVERS` defaults and no `INITIAL_REGION`, **Default Set**
clears temporary region/group filters and restores that configured pubkey list.
With activity-ranked defaults, it uses recent top observers within the currently
selected region (active-window fallback when no history) and preserves that region.
Reload restores the site's initial defaults. Region buttons may select all
observers there; Default Set narrows them to the applicable default set.
No precise device coordinates are stored or sent to the server.
Location requests a fresh high-accuracy estimate and displays browser-reported
accuracy in the configured distance unit; GPS accuracy is not guaranteed. The public `/privacy` page
explains local storage, retained results, verification cookies and map providers.
