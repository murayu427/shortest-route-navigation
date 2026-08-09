#!/usr/bin/env python3
"""OpenStreetMap の歩行可能道路を Overpass API から取得する。

例:
    python fetch_osm_data.py \
        --bbox 31.7265 130.7220 31.7490 130.7470 \
        --output data/hayato_walking_roads.json

取得データ: © OpenStreetMap contributors / ODbL 1.0
"""

from __future__ import annotations

import argparse
import http.client
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)


def build_road_query(south: float, west: float, north: float, east: float) -> str:
    """道路・線路と、それらを構成するノードだけを取得するクエリ。"""
    bbox = f"{south:.7f},{west:.7f},{north:.7f},{east:.7f}"
    return f"""[out:json][timeout:30];
(
  way[\"highway\"][\"highway\"!~\"^(motorway|motorway_link|trunk|trunk_link|construction|proposed|raceway)$\"]({bbox});
  way[\"railway\"~\"^(rail|subway|tram|light_rail|monorail|narrow_gauge)$\"]({bbox});
);
out body qt;
>;
out skel qt;"""


def build_feature_query(south: float, west: float, north: float, east: float) -> str:
    """駅と周辺検索用施設を、形状ノードを展開せず軽量に取得するクエリ。"""
    bbox = f"{south:.7f},{west:.7f},{north:.7f},{east:.7f}"
    return f"""[out:json][timeout:20];
(
  nwr[\"railway\"~\"^(station|halt|tram_stop)$\"]({bbox});
  nwr[\"public_transport\"=\"station\"]({bbox});
  nwr[\"shop\"~\"^(convenience|supermarket|deli)$\"]({bbox});
  nwr[\"amenity\"~\"^(school|university|college|restaurant|cafe|pharmacy|hospital|clinic|doctors|library)$\"]({bbox});
  nwr[\"cuisine\"~\"bento\",i]({bbox});
  nwr[\"leisure\"=\"park\"]({bbox});
);
out body center qt;"""


def merge_elements(*datasets: dict) -> list[dict]:
    """分割取得した要素を type/id で統合する。"""
    merged: dict[tuple[str, int], dict] = {}
    for dataset in datasets:
        for element in dataset.get("elements", []):
            key = (str(element.get("type")), int(element.get("id", 0)))
            if key not in merged:
                merged[key] = element
                continue
            existing = merged[key]
            combined = {**existing, **element}
            combined["tags"] = {**existing.get("tags", {}), **element.get("tags", {})}
            if "nodes" not in element and "nodes" in existing:
                combined["nodes"] = existing["nodes"]
            if "center" not in element and "center" in existing:
                combined["center"] = existing["center"]
            merged[key] = combined
    return list(merged.values())


def download(query: str, endpoints: tuple[str, ...] = DEFAULT_ENDPOINTS) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    last_error: Exception | None = None

    for endpoint in endpoints:
        request = urllib.request.Request(
            endpoint,
            data=body,
            headers={
                "User-Agent": "shortest-route-education-gif/1.0",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
        )
        try:
            print(f"取得中: {endpoint}", file=sys.stderr)
            with urllib.request.urlopen(request, timeout=90) as response:
                payload = response.read().decode("utf-8")
            data = json.loads(payload)
            if "elements" not in data:
                raise ValueError("Overpass 応答に elements がありません")
            return data
        except (
            OSError,
            ValueError,
            json.JSONDecodeError,
            urllib.error.URLError,
            http.client.HTTPException,
        ) as exc:
            last_error = exc
            print(f"  失敗: {exc}", file=sys.stderr)
            time.sleep(1)

    raise RuntimeError(f"すべての Overpass API で取得に失敗しました: {last_error}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="指定範囲のOpenStreetMap道路データを取得します。"
    )
    parser.add_argument(
        "--bbox",
        nargs=4,
        type=float,
        metavar=("SOUTH", "WEST", "NORTH", "EAST"),
        required=True,
        help="取得範囲（南緯度 西経度 北緯度 東経度）",
    )
    parser.add_argument("--output", type=Path, required=True, help="保存先JSON")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    south, west, north, east = args.bbox
    if not (south < north and west < east):
        raise SystemExit("bbox は SOUTH < NORTH、WEST < EAST にしてください")

    road_data = download(build_road_query(south, west, north, east))
    poi_incomplete = False
    try:
        feature_data = download(build_feature_query(south, west, north, east))
    except RuntimeError as exc:
        print(f"警告: 周辺施設だけ取得できませんでした: {exc}", file=sys.stderr)
        feature_data = {"elements": []}
        poi_incomplete = True
    data = {"elements": merge_elements(road_data, feature_data)}
    data["_route_gif_metadata"] = {
        "bbox": [south, west, north, east],
        "downloaded_by": "fetch_osm_data.py",
        "attribution": "Data © OpenStreetMap contributors, ODbL 1.0",
        "poiIncomplete": poi_incomplete,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"保存: {args.output} ({len(data['elements']):,} elements)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
