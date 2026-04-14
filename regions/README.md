# Region Boundary Files

GeoJSON FeatureCollections used for observer region detection. Set the `REGIONS_FILE` environment variable to the path of one of these files.

| File | Coverage | Granularity |
|------|----------|-------------|
| `uk.geojson` | United Kingdom | 9 English regions + Scotland, Wales, Northern Ireland (12 total) |
| `us-states.geojson` | United States | 50 states + DC |
| `de-bundeslaender.geojson` | Germany | 16 Bundesländer |
| `au-states.geojson` | Australia | 8 states and territories |
| `ca-provinces.geojson` | Canada | 13 provinces and territories |
| `fr-regions.geojson` | France | 13 metropolitan regions |

## Usage

```env
REGIONS_FILE=regions/uk.geojson
```

When `REGIONS_FILE` is set, each observer with known coordinates is assigned to a region on startup. Region filter buttons appear above the observer list in the UI — clicking one selects all observers in that region.

Observers without coordinates, or located outside all boundaries, get `region: null` and remain visible in the list but are not reachable via region buttons.

## Sources

- **UK**: [martinjc/UK-GeoJSON](https://github.com/martinjc/UK-GeoJSON) (ONS data)
- **US states**: [PublicaMundi/MappingAPI](https://github.com/PublicaMundi/MappingAPI) (MIT)
- **Germany, Australia, Canada**: [Natural Earth](https://www.naturalearthdata.com/) 10m admin-1 (public domain)
- **France**: [gregoiredavid/france-geojson](https://github.com/gregoiredavid/france-geojson)

All geometries are simplified for file size (tolerance ~0.05°, ~5 km).
