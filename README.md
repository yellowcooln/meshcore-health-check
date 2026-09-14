# Mesh Health Check

Mesh Health Check is a self-hosted web app for measuring MeshCore message
coverage across MQTT-connected observers. It generates a short code, watches the
configured MeshCore group channel for that code, then scores how many selected
observers reported the matching message hash.

The idea for this app came from Nick D from Boston.

Other community Health Checks:

- https://healthcheck.ukmesh.com/ - UK Mesh Health Check

![Coverage example 1](image1.png)
![Coverage example 2](image2.png)
![Coverage example 3](image3.png)

## What It Does

- creates short-lived health-check codes
- matches MeshCore `GroupText` packets from MQTT
- scores observer coverage against a default or custom observer set
- shows receipts, paths, RSSI, SNR, timing, repeaters, and map coverage
- estimates packet-path distance between known observers, with mile or
  kilometer labels
- learns observer names and locations from MQTT metadata
- tracks recent observer activity and can auto-select the top observers
- supports region filters from GeoJSON boundary files
- keeps retained `/share/:sessionId` result links
- supports Cloudflare Turnstile and installable PWA behavior

## Nearby Observer Selection

Every reload starts with the website-configured default observer set. Nearby,
manual and region choices are temporary; location is optional and only requested
on click. Used session history remains available without changing the next-code defaults.

On the coverage map, click **Use my location** to select up to 10 nearest active
observers within the displayed radius (100 by default; adjustable from 25 to
500 in the configured `DISTANCE_UNIT=mi` or `km`). No permission is requested on page load. **Use map center** lets you pan
to an area without sharing device location; it is also the labeled fallback if
geolocation fails or requires HTTPS. Distances use the same environment-configured unit as packet estimates, but are straight-line distances, not
radio-path estimates: **proximity does not guarantee RF coverage**.

Selection uses recent packet activity, not merely saved observer metadata.
Missing/stale activity and invalid coordinates are excluded. If nothing qualifies,
your previous selection stays unchanged. Manual, region and Default Set controls
remain available. An unused code may be regenerated as in the existing selection
workflow; a used code keeps its target and the selection applies to the next code.
The app never transmits for you.

Precise device coordinates are only used for browser-side distance calculations;
they are not stored or sent to the backend. Only selected observer keys follow
the normal session workflow. See [HOWTO.md](HOWTO.md#select-nearby-observers) for
activity rules, privacy boundaries and troubleshooting.

## Quick Start

Clone the repo and run the local Compose build:

```bash
git clone https://github.com/yellowcooln/meshcore-health-check.git
cd meshcore-health-check
cp .env.example .env
docker compose up -d --build
```

Default local URL: `http://localhost:3090`

To run the published Docker image instead, use the production branch image
`yellowcooln/meshcore-health-check:latest`, which is built from `main`, or
`yellowcooln/meshcore-health-check:dev`, which is built from `dev`. See
[HOWTO.md](HOWTO.md) for a full image-based Compose example.

At minimum, configure MQTT and the test channel in `.env`:

- `MQTT_HOST`, `MQTT_PORT`, `MQTT_TRANSPORT`, `MQTT_TLS`
- `MQTT_USERNAME`, `MQTT_PASSWORD` when required
- `MQTT_TOPIC`
- `TEST_CHANNEL_NAME`
- `TEST_CHANNEL_SECRET` or `TEST_CHANNEL_HASH`
- `CARTO_BASEMAP_KEY` to enable CARTO Dark Matter coverage-map tiles

For full setup steps, read [HOWTO.md](HOWTO.md). For every runtime variable,
read [ENVIRONMENT.md](ENVIRONMENT.md).

## Project Layout

- [server.js](server.js): Express API, MQTT ingest, MeshCore decoding, session
  matching, observer persistence, Turnstile handling, and WebSocket snapshots
- [public/](public): dashboard, share page, landing page, styles, and service
  worker
- [data/observer.json](data/observer.json): observer names and coordinates
- [data/observer-activity.json](data/observer-activity.json): rolling observer
  packet history used for dynamic defaults
- [data/session-results.json](data/session-results.json): retained share-link
  session results
- [.env.example](.env.example): runtime config template
- [ENVIRONMENT.md](ENVIRONMENT.md): full environment variable reference
- [HOWTO.md](HOWTO.md): deployment and operator guide
- [CHANGES.md](CHANGES.md): release changelog

## Runtime Notes

- The app only decodes the configured test channel.
- Docker Compose is the supported runtime path.
- Keep `data/` mounted if observer profiles, observer activity, and share links
  must survive rebuilds.
- Leave `KNOWN_OBSERVERS` blank to let the app auto-select the top recent
  observers. Fixed `KNOWN_OBSERVERS` defaults apply only when `INITIAL_REGION`
  is blank; an initial region uses activity-ranked defaults instead.
- Set `OBSERVER_RETENTION_SECONDS=0` to keep known observers visible regardless
  of age.
- Share links use retained server-side results and remain available until
  `RESULT_RETENTION_SECONDS` expires.
- `DASH_BROKER_HOST` changes only the broker label shown in the UI. It does not
  change the actual MQTT connection.
- `CORESCOPE_URL` changes the matched message-hash link to CoreScope
  `#/packets/<hash>` routes.
- `CARTO_BASEMAP_KEY` enables CARTO Dark Matter tiles. Without it, the coverage
  map falls back to OpenStreetMap while the dark dashboard theme remains usable.
- `DISTANCE_UNIT=mi` or `DISTANCE_UNIT=km` controls packet distance labels,
  nearby distances, and search radii. Browser location accuracy is shown in meters.

## Runtime and dependency maintenance

Docker and CI use Node 24. For local checks, use Node 24 (`nvm use` reads
`.nvmrc`); other Node majors are not supported.

Dependabot checks npm, GitHub Actions, and Docker weekly and targets `dev`
for version updates. Node image major updates are ignored so the runtime stays
on Node 24; patch/minor updates remain enabled. Runtime-major migrations require
manual review. GitHub reads this policy from `main`, and security-update PRs
still target the default branch. Security alerts close after fixes reach `main`.

## Validation

```bash
npm run check
npm test
docker compose up -d --build
curl -s http://localhost:3090/api/bootstrap
```

Run `npm run test:smoke` when UI or routing behavior changes.

## Decoder

The app uses `@michaelhart/meshcore-decoder` for runtime MeshCore packet
decoding. A small postinstall compatibility patch keeps the published CommonJS
build loading cleanly across module formats.

## Star History

<a href="https://www.star-history.com/?repos=yellowcooln%2Fmeshcore-health-check&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=yellowcooln/meshcore-health-check&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=yellowcooln/meshcore-health-check&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=yellowcooln/meshcore-health-check&type=date&legend=top-left" />
 </picture>
</a>

## Geographic website scope

These settings work worldwide with bundled or custom GeoJSON boundaries. They
match region labels, not the website title or MQTT topic codes. For example,
`REGION_NAME_PROPERTY=title` reads a custom feature's `properties.title`; use that
exact value in `ALLOWED_REGIONS` and `INITIAL_REGION`. Group labels come from
`REGION_GROUP_PROPERTY`.

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
No precise device coordinates are stored or sent to the server.
Location requests a fresh high-accuracy estimate and displays browser-reported
accuracy in meters; GPS accuracy is not guaranteed. The public `/privacy` page
explains local storage, retained results, verification cookies and map providers.
