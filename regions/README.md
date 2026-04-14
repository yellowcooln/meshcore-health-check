# Region Boundary Files

GeoJSON FeatureCollections used for observer region detection. Set the `REGIONS_FILE` environment variable to the path of one of these files.

Each bundled feature has a `name` and `group` property. The server assigns
observers to the matching feature and the UI uses `group` for the top-level
filter, then `name` for the deeper region filter.

| File | Coverage | Filter groups | Region detail |
|------|----------|---------------|---------------|
| `uk.geojson` | United Kingdom | England, Devolved nations | 9 English regions + Scotland, Wales, Northern Ireland (12 total) |
| `us-states.geojson` | United States | Northeast, Midwest, South, West, Territories | 50 states + DC + Puerto Rico (52 total) |
| `de-bundeslaender.geojson` | Germany | North, South, East, West | 16 Bundesländer |
| `au-states.geojson` | Australia | Eastern Australia, Southern Australia, Western Australia, Territories, External territories | 12 states, territories, and external territories |
| `ca-provinces.geojson` | Canada | Atlantic Canada, Central Canada, Prairies, West Coast, Territories | 13 provinces and territories |
| `fr-regions.geojson` | France | North, West, Central, East, South | 13 metropolitan regions |

## Usage

```env
REGIONS_FILE=regions/uk.geojson
# Optional when using your own GeoJSON:
REGION_NAME_PROPERTY=name
REGION_GROUP_PROPERTY=group
```

When `REGIONS_FILE` is set, each observer with known coordinates is assigned to a region on startup. Region filter buttons appear above the observer list in the UI. Clicking a group selects all observers in that group; clicking a child region selects only observers in that region.

For custom GeoJSON, set `REGION_NAME_PROPERTY` to the feature property that
should become the selectable region. Set `REGION_GROUP_PROPERTY` to the feature
property that should become the parent group. If no group property is present,
the UI falls back to a flat region button list.

Observers without coordinates, or located outside all boundaries, get `region: null` and remain visible in the list but are not reachable via region buttons.

## Sources

- **UK**: [martinjc/UK-GeoJSON](https://github.com/martinjc/UK-GeoJSON) (ONS data)
- **US states**: [PublicaMundi/MappingAPI](https://github.com/PublicaMundi/MappingAPI) (MIT)
- **Germany, Australia, Canada**: [Natural Earth](https://www.naturalearthdata.com/) 10m admin-1 (public domain)
- **France**: [gregoiredavid/france-geojson](https://github.com/gregoiredavid/france-geojson)

All geometries are simplified for file size (tolerance ~0.05°, ~5 km).
