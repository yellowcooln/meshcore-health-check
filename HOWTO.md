# How To Run Mesh Health Check

## Purpose

Mesh Health Check measures how well a MeshCore `GroupText` message reaches your
observer network. The app generates a short code, waits for that code to appear
in the configured channel, then scores coverage based on the observer set for
that code.

It does not transmit anything. It only watches MQTT, matches messages, and
summarizes observer coverage.

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
- set `KNOWN_OBSERVERS` only if you want a fixed default observer target
- leave `KNOWN_OBSERVERS` blank if the app should auto-select top recent
  observers from packet history
- set `REGIONS_FILE` if you want region buttons above the observer selector
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

- the fixed `KNOWN_OBSERVERS` target set
- the dynamic top-observer set when `KNOWN_OBSERVERS` is blank
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
they do not appear on the map.

The dynamic default observer set is stored in `data/observer-activity.json`.
When `KNOWN_OBSERVERS` is blank, the app ranks observers over
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

- `regions/us-states.geojson` for grouped US state filtering such as
  `New England -> Massachusetts`
- `regions/us-places.geojson` for city/place-level US filtering
- `regions/uk.geojson` for UK regional filtering
- `regions/de-bundeslaender.geojson` for German state filtering

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
