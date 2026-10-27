"""Build clearly-labelled prototype routes from the local OSM road extract.

The result is useful for UI development only. It does not establish a safe,
official, or walkable route and must remain visibly marked as unverified.
"""

from __future__ import annotations

import json
import argparse
import math
from pathlib import Path

import networkx as nx
from shapely.geometry import LineString, shape


ROOT = Path(__file__).resolve().parents[1]
ROADS = ROOT / "project-intelligence/source/data/gis/processed/roads.geojson"
OUTPUTS = [
    ROOT / "project-intelligence/source/data/gis/processed/prototype-routes.geojson",
    ROOT / "source-code/web/public/data/gis/prototype-routes.geojson",
]
REPORT = ROOT / "project-intelligence/source/data/gis/processed/prototype-routes-report.json"

SPOTS = {
    "guoen-temple": (112.22292, 22.592478),
    "huineng-residence": (112.21084, 22.594125),
    "longshan-spring": (112.217653, 22.582133),
    "chanyu-town": (112.22957, 22.642818),
}


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6_371_000 * 2 * math.asin(math.sqrt(h))


def rounded(coord: tuple[float, float]) -> tuple[float, float]:
    return round(coord[0], 7), round(coord[1], 7)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roads", type=Path, default=ROOT / "public/data/gis/roads.geojson")
    parser.add_argument("--output", type=Path, default=ROOT / ".local/prototype-routes.geojson")
    args = parser.parse_args()
    global OUTPUTS, REPORT
    OUTPUTS = [args.output.resolve()]
    REPORT = args.output.resolve().with_name("prototype-routes-report.json")
    payload = json.loads(args.roads.read_text(encoding="utf-8"))
    graph = nx.Graph()
    for feature in payload["features"]:
        geometry = shape(feature["geometry"])
        lines = [geometry] if geometry.geom_type == "LineString" else list(getattr(geometry, "geoms", []))
        for line in lines:
            if line.geom_type != "LineString":
                continue
            coords = [rounded(coord[:2]) for coord in line.coords]
            for start, end in zip(coords, coords[1:]):
                length = distance_m(start, end)
                if length > 0:
                    graph.add_edge(start, end, weight=length)

    nodes = list(graph.nodes)
    if not nodes:
        raise ValueError("The provided public-road extract has no usable edges")
    snaps: dict[str, tuple[float, float]] = {}
    snap_distances: dict[str, float] = {}
    for spot_id, point in SPOTS.items():
        nearest = min(nodes, key=lambda node: distance_m(point, node))
        snaps[spot_id] = nearest
        snap_distances[spot_id] = round(distance_m(point, nearest), 1)

    features = []
    failures = []
    ids = list(SPOTS)
    for index, start_id in enumerate(ids):
        for end_id in ids[index + 1 :]:
            try:
                path = nx.shortest_path(graph, snaps[start_id], snaps[end_id], weight="weight")
                length = nx.path_weight(graph, path, weight="weight")
            except nx.NetworkXNoPath:
                failures.append({"from": start_id, "to": end_id, "reason": "disconnected"})
                continue
            if len(path) < 2:
                failures.append({"from": start_id, "to": end_id, "reason": "same-snapped-node"})
                continue
            geometry = LineString(path)
            features.append({
                "type": "Feature",
                "properties": {
                    "id": f"{start_id}--{end_id}",
                    "from": start_id,
                    "to": end_id,
                    "distance_m": round(length),
                    "status": "UNVERIFIED_OSM_PROTOTYPE",
                    "warning": "未现场核验，不可作为安全导航承诺",
                    "source": "OpenStreetMap contributors",
                },
                "geometry": geometry.__geo_interface__,
            })

    collection = {"type": "FeatureCollection", "features": features}
    serialized = json.dumps(collection, ensure_ascii=False, separators=(",", ":"))
    for output in OUTPUTS:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(serialized, encoding="utf-8")
    REPORT.write_text(json.dumps({
        "graph_nodes": graph.number_of_nodes(),
        "graph_edges": graph.number_of_edges(),
        "connected_components": nx.number_connected_components(graph),
        "snap_distance_m": snap_distances,
        "routes_created": len(features),
        "failures": failures,
        "status": "DEVELOPMENT_ONLY",
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(REPORT.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
