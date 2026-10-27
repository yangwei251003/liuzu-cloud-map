"""Convert a bounded Overpass JSON export into map-ready GIS layers."""

from __future__ import annotations

import json
import argparse
import re
from pathlib import Path

import geopandas as gpd
from shapely import make_valid
from shapely.geometry import LineString, Point, Polygon


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".local/gis-processed"
CRS = "EPSG:4326"

AREA_KEYS = {"building", "landuse", "leisure", "amenity", "tourism", "historic"}


def classify(tags: dict[str, str], geometry_type: str) -> str:
    if geometry_type == "Point":
        return "pois"
    if "highway" in tags:
        return "roads"
    if "waterway" in tags:
        return "waterways"
    if "building" in tags:
        return "buildings"
    return "landmarks"


def feature_from_element(element: dict) -> dict | None:
    tags = {key: value for key, value in element.get("tags", {}).items() if not re.search(r"(?i)^(?:addr:|contact:|phone|mobile|email|owner|operator|payment:)", key)}
    osm_type = element["type"]
    osm_id = element["id"]

    if osm_type == "node" and "lat" in element and "lon" in element:
        geometry = Point(element["lon"], element["lat"])
    elif osm_type == "way" and element.get("geometry"):
        coordinates = [(node["lon"], node["lat"]) for node in element["geometry"]]
        if len(coordinates) < 2:
            return None
        is_closed = len(coordinates) >= 4 and coordinates[0] == coordinates[-1]
        should_be_area = is_closed and (
            tags.get("area") == "yes" or any(key in tags for key in AREA_KEYS)
        )
        geometry = Polygon(coordinates) if should_be_area else LineString(coordinates)
    else:
        return None

    if not geometry.is_valid:
        geometry = make_valid(geometry)
    if geometry.is_empty:
        return None

    properties = {
        "osm_type": osm_type,
        "osm_id": osm_id,
        "name": tags.get("name") or tags.get("name:zh") or "",
        "category": next(
            (key for key in ("tourism", "historic", "amenity", "highway", "building", "natural", "landuse", "waterway", "leisure", "place") if key in tags),
            "other",
        ),
        "subtype": next(
            (tags[key] for key in ("tourism", "historic", "amenity", "highway", "building", "natural", "landuse", "waterway", "leisure", "place") if key in tags),
            "",
        ),
        "source": "OpenStreetMap contributors",
        "source_url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
        "source_crs": CRS,
        "tags_json": json.dumps(tags, ensure_ascii=False, sort_keys=True),
        "geometry": geometry,
    }
    properties["layer"] = classify(tags, geometry.geom_type)
    return properties


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Authorized Overpass JSON export; never a private location log")
    parser.add_argument("--output", type=Path, default=ROOT / ".local/gis-processed")
    parser.add_argument("--retrieved-at", default=None, help="Actual source retrieval date, if known")
    args = parser.parse_args()
    global OUT
    OUT = args.output.resolve()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    features = [feature for element in payload["elements"] if (feature := feature_from_element(element))]
    frame = gpd.GeoDataFrame(features, geometry="geometry", crs=CRS)
    OUT.mkdir(parents=True, exist_ok=True)

    package = OUT / "liuzu-osm.gpkg"
    if package.exists():
        package.unlink()

    summary: dict[str, object] = {
        "source": "OpenStreetMap contributors via Overpass API",
        "license": "ODbL 1.0",
        "retrieved_at": args.retrieved_at,
        "osm_snapshot": payload.get("osm3s", {}).get("timestamp_osm_base"),
        "crs": CRS,
        "bounds": [float(value) for value in frame.total_bounds],
        "layers": {},
    }

    for layer in ("pois", "roads", "waterways", "buildings", "landmarks"):
        subset = frame[frame["layer"] == layer].drop(columns="layer").copy()
        if subset.empty:
            continue
        subset.to_file(package, layer=layer, driver="GPKG")
        # GeoJSON properties consumed by MapLibre must remain scalar. Fiona's
        # GeoJSON writer may reinterpret the JSON string in tags_json as a
        # nested object, which geojson-vt cannot encode. GeoPandas.to_json()
        # preserves the audit payload as a string and emits RFC 7946 geometry.
        (OUT / f"{layer}.geojson").write_text(
            subset.to_json(ensure_ascii=False, drop_id=True),
            encoding="utf-8",
        )
        summary["layers"][layer] = {
            "features": int(len(subset)),
            "geometry_types": subset.geom_type.value_counts().to_dict(),
            "invalid_geometries": int((~subset.geometry.is_valid).sum()),
        }

    (OUT / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
