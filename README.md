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
  observers. Set it to full pubkeys for a fixed default target set.
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
- `DISTANCE_UNIT=mi` or `DISTANCE_UNIT=km` controls packet distance labels.

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
build loading cleanly on Node 18.

## Star History

<a href="https://www.star-history.com/?repos=yellowcooln%2Fmeshcore-health-check&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=yellowcooln/meshcore-health-check&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=yellowcooln/meshcore-health-check&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=yellowcooln/meshcore-health-check&type=date&legend=top-left" />
 </picture>
</a>
