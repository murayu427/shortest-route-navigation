#!/usr/bin/env python3
"""道路グラフ上の最短経路探索を、探索済み道路が広がる GIF にする。

依存ライブラリは Pillow のみ。標準では同梱の隼人駅周辺データを使い、
BFS・ダイクストラ法・A* の3本を生成する。

任意地点での例:
    python route_gif.py --data roads.json \
      --start 35.0 135.0 --goal 35.01 135.02 \
      --start-label 出発地 --goal-label 目的地 --algorithm all
"""

from __future__ import annotations

import argparse
import heapq
import itertools
import json
import math
import os
import sys
import time
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:  # pragma: no cover - 利用者向けエラー
    raise SystemExit("Pillow が必要です: python -m pip install Pillow") from exc


EARTH_RADIUS_M = 6_371_008.8

DEFAULT_DATA = Path(__file__).with_name("data") / "hayato_walking_roads.json"
DEFAULT_START = (31.7439369, 130.7401732)
DEFAULT_GOAL = (31.7313150, 130.7276633)

EXCLUDED_HIGHWAYS = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "construction",
    "proposed",
    "raceway",
}
EXCLUDED_ACCESS = {"no", "private"}

ROAD_WIDTH = {
    "primary": 4,
    "primary_link": 3,
    "secondary": 3,
    "secondary_link": 3,
    "tertiary": 3,
    "tertiary_link": 2,
    "residential": 2,
    "unclassified": 2,
    "living_street": 2,
    "service": 1,
    "pedestrian": 2,
    "footway": 1,
    "path": 1,
    "steps": 1,
    "cycleway": 1,
}

ROAD_PRIORITY = {
    "primary": 8,
    "primary_link": 7,
    "secondary": 6,
    "secondary_link": 5,
    "tertiary": 4,
    "tertiary_link": 4,
    "residential": 3,
    "unclassified": 3,
    "living_street": 2,
    "service": 1,
    "pedestrian": 1,
    "footway": 0,
    "path": 0,
    "steps": 0,
    "cycleway": 0,
}

PALETTE = {
    "bg": (5, 14, 23),
    "map_bg": (7, 20, 31),
    "grid": (12, 35, 49),
    "panel": (9, 24, 36),
    "panel_soft": (14, 34, 48),
    "border": (31, 56, 72),
    "road_major": (43, 68, 84),
    "road_minor": (29, 52, 67),
    "road_foot": (23, 44, 57),
    "text": (236, 245, 249),
    "muted": (145, 168, 181),
    "muted2": (96, 124, 141),
    "start": (48, 217, 150),
    "goal": (255, 105, 120),
    "route": (255, 207, 90),
    "route_glow": (94, 70, 25),
    "white": (255, 255, 255),
}


ALGORITHM_STYLE = {
    "bfs": {
        "index": "01",
        "name": "BFS",
        "ja": "幅優先探索",
        "accent": (39, 221, 190),
        "explored": (17, 118, 106),
        "equation": "優先度 ＝ 通った区間数",
        "tagline": "近い“段数”から、波紋のように調べる",
        "search_text": "先に見つけた地点から順番に取り出し、となりの道を全部チェック。",
        "note": "道路1区間をすべて同じ「1」として数えるため、区間数最小のルートです。",
    },
    "dijkstra": {
        "index": "02",
        "name": "DIJKSTRA",
        "ja": "ダイクストラ法",
        "accent": (74, 177, 255),
        "explored": (24, 101, 154),
        "equation": "優先度 ＝ ここまでの距離 g",
        "tagline": "出発点からの実距離が短い順に調べる",
        "search_text": "候補の中から、隼人駅からの合計距離 g がいちばん短い地点を選択。",
        "note": "道の長さを重みとして使うので、合計距離が最短だと保証されます。",
    },
    "astar": {
        "index": "03",
        "name": "A*",
        "ja": "A* 探索",
        "accent": (181, 137, 255),
        "explored": (92, 62, 151),
        "equation": "優先度 ＝ g ＋ 残り予想 h",
        "tagline": "ゴールの方向を予想して、むだを減らす",
        "search_text": "ここまでの距離 g と、ゴールまでの直線距離 h の合計が小さい地点を選択。",
        "note": "正しい距離予想なら、最短を保ったまま探索範囲を絞れます。",
    },
}


@dataclass(frozen=True)
class GeoNode:
    id: int
    lat: float
    lon: float


@dataclass(frozen=True)
class RawSegment:
    u: int
    v: int
    highway: str
    name: str


@dataclass(frozen=True)
class GraphEdge:
    id: int
    u: int
    v: int
    length_m: float
    geometry: tuple[tuple[float, float], ...]
    highway: str
    name: str


@dataclass
class RoadGraph:
    nodes: dict[int, GeoNode]
    edges: dict[int, GraphEdge]
    adjacency: dict[int, list[int]]
    start: int
    goal: int

    def other(self, edge_id: int, node_id: int) -> int:
        edge = self.edges[edge_id]
        return edge.v if edge.u == node_id else edge.u


@dataclass(frozen=True)
class SearchEvent:
    current: int
    examined_edges: tuple[int, ...]
    settled_count: int
    frontier_count: int
    g: float
    h: float
    priority: float


@dataclass
class SearchResult:
    algorithm: str
    events: list[SearchEvent]
    path_nodes: list[int]
    path_edges: list[int]
    distance_m: float
    hops: int
    settled_count: int
    calculation_ms: float


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    """緯度経度2点間の大円距離（m）。"""
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def walkable(tags: dict[str, str]) -> bool:
    highway = tags.get("highway", "")
    if not highway or highway in EXCLUDED_HIGHWAYS:
        return False
    if tags.get("access") in EXCLUDED_ACCESS or tags.get("foot") == "no":
        return False
    return True


def _components(nodes: dict[int, GeoNode], segments: list[RawSegment]) -> list[set[int]]:
    adjacency: dict[int, list[int]] = defaultdict(list)
    for seg in segments:
        adjacency[seg.u].append(seg.v)
        adjacency[seg.v].append(seg.u)

    unseen = set(adjacency)
    components: list[set[int]] = []
    while unseen:
        seed = unseen.pop()
        component = {seed}
        stack = [seed]
        while stack:
            current = stack.pop()
            for nxt in adjacency[current]:
                if nxt in unseen:
                    unseen.remove(nxt)
                    component.add(nxt)
                    stack.append(nxt)
        components.append(component)
    return components


def _nearest(component: Iterable[int], nodes: dict[int, GeoNode], point: tuple[float, float]) -> tuple[int, float]:
    best_id = -1
    best_distance = math.inf
    for node_id in component:
        node = nodes[node_id]
        distance = haversine((node.lat, node.lon), point)
        if distance < best_distance:
            best_id, best_distance = node_id, distance
    return best_id, best_distance


def _choose_component(
    nodes: dict[int, GeoNode],
    segments: list[RawSegment],
    start_point: tuple[float, float],
    goal_point: tuple[float, float],
) -> tuple[set[int], int, int, float, float]:
    candidates = [component for component in _components(nodes, segments) if len(component) >= 20]
    if not candidates:
        raise ValueError("十分な大きさの道路ネットワークが見つかりません")

    best: tuple[float, set[int], int, int, float, float] | None = None
    for component in candidates:
        start_id, start_gap = _nearest(component, nodes, start_point)
        goal_id, goal_gap = _nearest(component, nodes, goal_point)
        score = start_gap + goal_gap
        if best is None or score < best[0]:
            best = (score, component, start_id, goal_id, start_gap, goal_gap)
    assert best is not None
    _, component, start_id, goal_id, start_gap, goal_gap = best
    return component, start_id, goal_id, start_gap, goal_gap


def load_graph(
    path: Path,
    start_point: tuple[float, float],
    goal_point: tuple[float, float],
) -> tuple[RoadGraph, dict[str, float | int]]:
    """Overpass JSON を読み、交差点間の道路グラフへ単純化する。"""
    raw = json.loads(path.read_text(encoding="utf-8"))
    node_elements = [element for element in raw.get("elements", []) if element.get("type") == "node"]
    way_elements = [element for element in raw.get("elements", []) if element.get("type") == "way"]
    nodes = {
        int(element["id"]): GeoNode(int(element["id"]), float(element["lat"]), float(element["lon"]))
        for element in node_elements
    }

    segments: list[RawSegment] = []
    for way in way_elements:
        tags = way.get("tags", {})
        if not walkable(tags):
            continue
        highway = str(tags.get("highway", "unclassified"))
        name = str(tags.get("name", ""))
        refs = [int(node_id) for node_id in way.get("nodes", []) if int(node_id) in nodes]
        for u, v in zip(refs, refs[1:]):
            if u != v:
                segments.append(RawSegment(u, v, highway, name))

    component, start_id, goal_id, start_gap, goal_gap = _choose_component(
        nodes, segments, start_point, goal_point
    )
    segments = [seg for seg in segments if seg.u in component and seg.v in component]
    nodes = {node_id: nodes[node_id] for node_id in component}

    raw_adjacency: dict[int, list[int]] = defaultdict(list)
    for segment_id, seg in enumerate(segments):
        raw_adjacency[seg.u].append(segment_id)
        raw_adjacency[seg.v].append(segment_id)

    terminals = {node_id for node_id, edge_ids in raw_adjacency.items() if len(edge_ids) != 2}
    terminals.update((start_id, goal_id))
    visited_segments: set[int] = set()
    simplified_edges: dict[int, GraphEdge] = {}
    edge_id = 0

    for terminal in sorted(terminals):
        for first_segment_id in raw_adjacency.get(terminal, []):
            if first_segment_id in visited_segments:
                continue

            current = terminal
            segment_id = first_segment_id
            geometry = [(nodes[current].lat, nodes[current].lon)]
            length = 0.0
            highway_counts: Counter[str] = Counter()
            names: list[str] = []

            while True:
                if segment_id in visited_segments:
                    break
                visited_segments.add(segment_id)
                segment = segments[segment_id]
                nxt = segment.v if segment.u == current else segment.u
                p1 = (nodes[current].lat, nodes[current].lon)
                p2 = (nodes[nxt].lat, nodes[nxt].lon)
                length += haversine(p1, p2)
                geometry.append(p2)
                highway_counts[segment.highway] += 1
                if segment.name:
                    names.append(segment.name)
                current = nxt

                if current in terminals:
                    break
                next_segments = [sid for sid in raw_adjacency[current] if sid not in visited_segments]
                if not next_segments:
                    terminals.add(current)
                    break
                segment_id = next_segments[0]

            if current == terminal or len(geometry) < 2:
                continue
            highway = max(
                highway_counts,
                key=lambda kind: (ROAD_PRIORITY.get(kind, 2), highway_counts[kind]),
            )
            name = Counter(names).most_common(1)[0][0] if names else ""
            simplified_edges[edge_id] = GraphEdge(
                edge_id,
                terminal,
                current,
                length,
                tuple(geometry),
                highway,
                name,
            )
            edge_id += 1

    graph_nodes = {
        node_id: nodes[node_id]
        for edge in simplified_edges.values()
        for node_id in (edge.u, edge.v)
    }
    adjacency: dict[int, list[int]] = defaultdict(list)
    for eid, edge in simplified_edges.items():
        adjacency[edge.u].append(eid)
        adjacency[edge.v].append(eid)
    for node_id in adjacency:
        adjacency[node_id].sort()

    graph = RoadGraph(graph_nodes, simplified_edges, dict(adjacency), start_id, goal_id)
    metadata = {
        "raw_nodes": len(nodes),
        "raw_segments": len(segments),
        "graph_nodes": len(graph_nodes),
        "graph_edges": len(simplified_edges),
        "start_snap_m": round(start_gap, 1),
        "goal_snap_m": round(goal_gap, 1),
    }
    return graph, metadata


def _reconstruct(
    graph: RoadGraph,
    parents: dict[int, tuple[int, int]],
) -> tuple[list[int], list[int]]:
    if graph.goal != graph.start and graph.goal not in parents:
        raise ValueError("出発地から目的地へ到達できません")
    path_nodes = [graph.goal]
    path_edges: list[int] = []
    current = graph.goal
    while current != graph.start:
        previous, edge_id = parents[current]
        path_nodes.append(previous)
        path_edges.append(edge_id)
        current = previous
    path_nodes.reverse()
    path_edges.reverse()
    return path_nodes, path_edges


def search(graph: RoadGraph, algorithm: str) -> SearchResult:
    """BFS / Dijkstra / A* を実行し、アニメーション用イベントも返す。"""
    if algorithm not in ALGORITHM_STYLE:
        raise ValueError(f"未対応アルゴリズム: {algorithm}")

    started_ns = time.perf_counter_ns()
    events: list[SearchEvent] = []
    parents: dict[int, tuple[int, int]] = {}
    goal_node = graph.nodes[graph.goal]

    if algorithm == "bfs":
        queue = deque([graph.start])
        depth = {graph.start: 0}
        discovered = {graph.start}
        settled = 0
        while queue:
            current = queue.popleft()
            settled += 1
            examined: list[int] = []
            if current != graph.goal:
                for edge_id in graph.adjacency.get(current, []):
                    examined.append(edge_id)
                    nxt = graph.other(edge_id, current)
                    if nxt not in discovered:
                        discovered.add(nxt)
                        depth[nxt] = depth[current] + 1
                        parents[nxt] = (current, edge_id)
                        queue.append(nxt)
            events.append(
                SearchEvent(current, tuple(examined), settled, len(queue), depth[current], 0.0, depth[current])
            )
            if current == graph.goal:
                break
    else:
        distances = {graph.start: 0.0}
        counter = itertools.count()
        start_node = graph.nodes[graph.start]
        start_h = haversine((start_node.lat, start_node.lon), (goal_node.lat, goal_node.lon))
        start_priority = start_h if algorithm == "astar" else 0.0
        heap: list[tuple[float, int, int]] = [(start_priority, next(counter), graph.start)]
        closed: set[int] = set()

        while heap:
            priority, _, current = heapq.heappop(heap)
            if current in closed:
                continue
            closed.add(current)
            current_node = graph.nodes[current]
            current_h = haversine(
                (current_node.lat, current_node.lon), (goal_node.lat, goal_node.lon)
            )
            examined: list[int] = []
            if current != graph.goal:
                for edge_id in graph.adjacency.get(current, []):
                    examined.append(edge_id)
                    nxt = graph.other(edge_id, current)
                    if nxt in closed:
                        continue
                    tentative = distances[current] + graph.edges[edge_id].length_m
                    if tentative < distances.get(nxt, math.inf):
                        distances[nxt] = tentative
                        parents[nxt] = (current, edge_id)
                        nxt_node = graph.nodes[nxt]
                        h = haversine((nxt_node.lat, nxt_node.lon), (goal_node.lat, goal_node.lon))
                        f = tentative + h if algorithm == "astar" else tentative
                        heapq.heappush(heap, (f, next(counter), nxt))
            events.append(
                SearchEvent(
                    current,
                    tuple(examined),
                    len(closed),
                    len(heap),
                    distances[current],
                    current_h if algorithm == "astar" else 0.0,
                    priority,
                )
            )
            if current == graph.goal:
                break

    path_nodes, path_edges = _reconstruct(graph, parents)
    distance = sum(graph.edges[edge_id].length_m for edge_id in path_edges)
    calculation_ms = (time.perf_counter_ns() - started_ns) / 1_000_000
    return SearchResult(
        algorithm,
        events,
        path_nodes,
        path_edges,
        distance,
        len(path_edges),
        events[-1].settled_count,
        calculation_ms,
    )


class MapProjection:
    def __init__(self, graph: RoadGraph, bounds: tuple[int, int, int, int]):
        left, top, right, bottom = bounds
        all_points = [point for edge in graph.edges.values() for point in edge.geometry]
        mean_lat = sum(lat for lat, _ in all_points) / len(all_points)
        self.cos_lat = math.cos(math.radians(mean_lat))
        metric = [self._metric(lat, lon) for lat, lon in all_points]
        min_x = min(x for x, _ in metric)
        max_x = max(x for x, _ in metric)
        min_y = min(y for _, y in metric)
        max_y = max(y for _, y in metric)
        padding = 32
        scale = min(
            (right - left - padding * 2) / max(1.0, max_x - min_x),
            (bottom - top - padding * 2) / max(1.0, max_y - min_y),
        )
        used_w = (max_x - min_x) * scale
        used_h = (max_y - min_y) * scale
        self.origin_x = left + (right - left - used_w) / 2 - min_x * scale
        self.origin_y = top + (bottom - top + used_h) / 2 + min_y * scale
        self.scale = scale

    def _metric(self, lat: float, lon: float) -> tuple[float, float]:
        return (
            EARTH_RADIUS_M * math.radians(lon) * self.cos_lat,
            EARTH_RADIUS_M * math.radians(lat),
        )

    def pixel(self, lat: float, lon: float) -> tuple[int, int]:
        x, y = self._metric(lat, lon)
        return round(self.origin_x + x * self.scale), round(self.origin_y - y * self.scale)

    def line(self, geometry: Sequence[tuple[float, float]]) -> list[tuple[int, int]]:
        return [self.pixel(lat, lon) for lat, lon in geometry]


class Fonts:
    def __init__(self, custom_path: Path | None = None):
        candidates = [
            custom_path,
            Path("C:/Windows/Fonts/NotoSansJP-VF.ttf"),
            Path("C:/Windows/Fonts/BIZ-UDGothicR.ttc"),
            Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
            Path("/usr/share/fonts/truetype/noto/NotoSansJP-Regular.ttf"),
        ]
        bold_candidates = [
            custom_path,
            Path("C:/Windows/Fonts/NotoSansJP-VF.ttf"),
            Path("C:/Windows/Fonts/BIZ-UDGothicB.ttc"),
            Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
        ]
        self.regular_path = next((path for path in candidates if path and path.exists()), None)
        self.bold_path = next((path for path in bold_candidates if path and path.exists()), self.regular_path)
        if self.regular_path is None:
            raise FileNotFoundError("日本語フォントが見つかりません。--font で指定してください。")
        self.cache: dict[tuple[int, bool], ImageFont.FreeTypeFont] = {}

    def get(self, size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
        key = (size, bold)
        if key not in self.cache:
            self.cache[key] = ImageFont.truetype(
                str(self.bold_path if bold else self.regular_path), size=size
            )
        return self.cache[key]


def _road_color(highway: str) -> tuple[int, int, int]:
    priority = ROAD_PRIORITY.get(highway, 2)
    if priority >= 5:
        return PALETTE["road_major"]
    if priority <= 1:
        return PALETTE["road_foot"]
    return PALETTE["road_minor"]


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.splitlines() or [""]:
        current = ""
        for char in paragraph:
            candidate = current + char
            if current and draw.textlength(candidate, font=font) > width:
                lines.append(current)
                current = char
            else:
                current = candidate
        lines.append(current)
    return lines


def _draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int],
    width: int,
    spacing: int = 6,
) -> int:
    x, y = xy
    lines = _wrap_text(draw, text, font, width)
    bbox = draw.textbbox((0, 0), "あAg", font=font)
    line_height = bbox[3] - bbox[1] + spacing
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_height
    return y


def _draw_panel(
    image: Image.Image,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int],
    outline: tuple[int, int, int] | None = None,
    radius: int = 18,
) -> None:
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=1 if outline else 0)


def _edge_points(graph: RoadGraph, projection: MapProjection, edge_id: int) -> list[tuple[int, int]]:
    return projection.line(graph.edges[edge_id].geometry)


def _oriented_route_points(
    graph: RoadGraph, projection: MapProjection, result: SearchResult
) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    for index, edge_id in enumerate(result.path_edges):
        edge = graph.edges[edge_id]
        current = result.path_nodes[index]
        geometry = edge.geometry if edge.u == current else tuple(reversed(edge.geometry))
        edge_points = projection.line(geometry)
        if points and edge_points and points[-1] == edge_points[0]:
            points.extend(edge_points[1:])
        else:
            points.extend(edge_points)
    return points


def _partial_polyline(points: list[tuple[int, int]], fraction: float) -> list[tuple[int, int]]:
    if len(points) < 2:
        return points
    fraction = max(0.0, min(1.0, fraction))
    lengths = [math.dist(a, b) for a, b in zip(points, points[1:])]
    target = sum(lengths) * fraction
    result = [points[0]]
    travelled = 0.0
    for a, b, length in zip(points, points[1:], lengths):
        if travelled + length <= target:
            result.append(b)
            travelled += length
            continue
        if length > 0:
            ratio = (target - travelled) / length
            result.append((round(a[0] + (b[0] - a[0]) * ratio), round(a[1] + (b[1] - a[1]) * ratio)))
        break
    return result


def _metric_label(value: float, algorithm: str) -> str:
    if algorithm == "bfs":
        return f"{int(round(value))} 区間"
    if value < 1000:
        return f"{value:.0f} m"
    return f"{value / 1000:.2f} km"


def _time_label(milliseconds: float) -> str:
    if milliseconds < 1:
        return f"{milliseconds:.3f} ms"
    if milliseconds < 10:
        return f"{milliseconds:.2f} ms"
    return f"{milliseconds:.1f} ms"


def _draw_marker(
    draw: ImageDraw.ImageDraw,
    point: tuple[int, int],
    label: str,
    color: tuple[int, int, int],
    fonts: Fonts,
    align_left: bool,
) -> None:
    x, y = point
    draw.ellipse((x - 11, y - 11, x + 11, y + 11), fill=PALETTE["map_bg"], outline=color, width=4)
    draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=color)
    font = fonts.get(17, True)
    text_box = draw.textbbox((0, 0), label, font=font)
    text_w = text_box[2] - text_box[0]
    box_w = text_w + 28
    box_h = 38
    box_x = x + 18 if align_left else x - 18 - box_w
    box_y = y - 19
    draw.line((x + (10 if align_left else -10), y, box_x if align_left else box_x + box_w, y), fill=color, width=2)
    draw.rounded_rectangle((box_x, box_y, box_x + box_w, box_y + box_h), radius=12, fill=PALETTE["panel"], outline=color, width=2)
    draw.text((box_x + 14, box_y + 7), label, font=font, fill=PALETTE["text"])


def _draw_base(
    graph: RoadGraph,
    projection: MapProjection,
    width: int,
    height: int,
    map_right: int,
) -> Image.Image:
    image = Image.new("RGB", (width, height), PALETTE["bg"])
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, map_right, height), fill=PALETTE["map_bg"])
    for x in range(0, map_right, 48):
        draw.line((x, 0, x, height), fill=PALETTE["grid"], width=1)
    for y in range(0, height, 48):
        draw.line((0, y, map_right, y), fill=PALETTE["grid"], width=1)

    ordered_edges = sorted(
        graph.edges.values(), key=lambda edge: ROAD_PRIORITY.get(edge.highway, 2)
    )
    for edge in ordered_edges:
        points = projection.line(edge.geometry)
        road_width = ROAD_WIDTH.get(edge.highway, 2)
        if road_width >= 3:
            draw.line(points, fill=(8, 24, 35), width=road_width + 3, joint="curve")
        draw.line(points, fill=_road_color(edge.highway), width=road_width, joint="curve")

    # 地図と情報パネルの境界
    draw.line((map_right, 0, map_right, height), fill=PALETTE["border"], width=1)
    return image


def _draw_map_chrome(
    draw: ImageDraw.ImageDraw,
    projection: MapProjection,
    graph: RoadGraph,
    fonts: Fonts,
    start_label: str,
    goal_label: str,
    map_right: int,
    height: int,
) -> None:
    _draw_panel_on_draw(draw, (24, 22, 355, 70), PALETTE["panel"], PALETTE["border"], 14)
    draw.text((42, 33), f"{start_label}  →  {goal_label}", font=fonts.get(19, True), fill=PALETTE["text"])

    start = graph.nodes[graph.start]
    goal = graph.nodes[graph.goal]
    _draw_marker(draw, projection.pixel(start.lat, start.lon), start_label, PALETTE["start"], fonts, False)
    _draw_marker(draw, projection.pixel(goal.lat, goal.lon), goal_label, PALETTE["goal"], fonts, True)

    # 方位記号
    cx, cy = map_right - 48, 54
    draw.polygon(((cx, cy - 18), (cx - 6, cy + 5), (cx, cy + 1), (cx + 6, cy + 5)), fill=PALETTE["text"])
    draw.text((cx - 7, cy + 8), "N", font=fonts.get(14, True), fill=PALETTE["muted"])

    # 500 m スケールバー
    bar_pixels = max(20, round(500 * projection.scale))
    x2 = map_right - 32
    x1 = x2 - bar_pixels
    y = height - 31
    draw.line((x1, y, x2, y), fill=PALETTE["text"], width=3)
    draw.line((x1, y - 5, x1, y + 5), fill=PALETTE["text"], width=2)
    draw.line((x2, y - 5, x2, y + 5), fill=PALETTE["text"], width=2)
    draw.text((x1, y - 25), "500 m", font=fonts.get(13), fill=PALETTE["muted"])


def _draw_panel_on_draw(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int],
    outline: tuple[int, int, int] | None = None,
    radius: int = 14,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=1 if outline else 0)


def _draw_sidebar(
    draw: ImageDraw.ImageDraw,
    result: SearchResult,
    event: SearchEvent | None,
    phase: str,
    progress: float,
    fonts: Fonts,
    width: int,
    height: int,
    map_right: int,
) -> None:
    style = ALGORITHM_STYLE[result.algorithm]
    accent = style["accent"]
    x = map_right + 34
    panel_width = width - x - 28

    draw.text((x, 32), "NAVIGATION ALGORITHM LAB", font=fonts.get(13, True), fill=PALETTE["muted2"])
    draw.text((x, 60), style["name"], font=fonts.get(34, True), fill=PALETTE["text"])
    ja_x = x + int(draw.textlength(style["name"], font=fonts.get(34, True))) + 14
    draw.text((ja_x, 72), style["ja"], font=fonts.get(16, True), fill=accent)
    _draw_wrapped(draw, (x, 112), style["tagline"], fonts.get(16), PALETTE["muted"], panel_width, 5)

    _draw_panel_on_draw(draw, (x, 162, width - 28, 230), PALETTE["panel_soft"], PALETTE["border"], 14)
    draw.text((x + 18, 178), "選ぶルール", font=fonts.get(13, True), fill=PALETTE["muted2"])
    draw.text((x + 18, 201), style["equation"], font=fonts.get(17, True), fill=accent)

    # 進捗
    phase_label = {"intro": "準備", "search": "探索中", "route": "最短ルートを復元", "done": "ルート確定"}[phase]
    draw.text((x, 258), phase_label, font=fonts.get(15, True), fill=accent if phase != "done" else PALETTE["route"])
    draw.rounded_rectangle((x, 286, width - 28, 294), radius=4, fill=PALETTE["border"])
    fill_right = x + round(panel_width * max(0.0, min(1.0, progress)))
    if fill_right > x:
        draw.rounded_rectangle((x, 286, fill_right, 294), radius=4, fill=accent if phase != "done" else PALETTE["route"])

    settled = event.settled_count if event else 0
    current_value = event.priority if event else 0.0
    metric_y = 322
    gap = 10
    box_w = (panel_width - gap) // 2
    metrics = [
        ("探索済み地点", f"{settled}"),
        ("探索計算（実測）", _time_label(result.calculation_ms)),
        ("現在の評価", _metric_label(current_value, result.algorithm)),
        ("確定ルート", f"{result.distance_m / 1000:.2f} km" if phase == "done" else "—"),
    ]
    for index, (label, value) in enumerate(metrics):
        col = index % 2
        row = index // 2
        bx = x + col * (box_w + gap)
        by = metric_y + row * 82
        _draw_panel_on_draw(draw, (bx, by, bx + box_w, by + 70), PALETTE["panel"], PALETTE["border"], 12)
        draw.text((bx + 14, by + 10), label, font=fonts.get(12), fill=PALETTE["muted2"])
        value_fill = PALETTE["route"] if label == "確定ルート" and phase == "done" else PALETTE["text"]
        draw.text((bx + 14, by + 33), value, font=fonts.get(19, True), fill=value_fill)

    action_y = 500
    _draw_panel_on_draw(draw, (x, action_y, width - 28, action_y + 118), PALETTE["panel_soft"], PALETTE["border"], 14)
    draw.text((x + 18, action_y + 15), "いま何をしている？", font=fonts.get(13, True), fill=PALETTE["muted2"])
    if phase == "done":
        action = f"ゴールから親をたどって完成。{result.hops}区間・{result.distance_m / 1000:.2f} km。"
    elif phase == "route":
        action = "ゴールから「どこから来たか」を逆向きにたどり、黄色いルートを描画。"
    else:
        action = style["search_text"]
    _draw_wrapped(draw, (x + 18, action_y + 43), action, fonts.get(14), PALETTE["text"], panel_width - 36, 5)

    legend_y = 642
    draw.line((x, legend_y, x + 28, legend_y), fill=style["explored"], width=5)
    draw.text((x + 38, legend_y - 9), "調べた道", font=fonts.get(12), fill=PALETTE["muted"])
    draw.line((x + 130, legend_y, x + 158, legend_y), fill=PALETTE["route"], width=5)
    draw.text((x + 168, legend_y - 9), "決定ルート", font=fonts.get(12), fill=PALETTE["muted"])

    note = style["note"]
    _draw_wrapped(draw, (x, 672), note, fonts.get(11), PALETTE["muted2"], panel_width, 3)


def _draw_frame(
    base: Image.Image,
    graph: RoadGraph,
    projection: MapProjection,
    result: SearchResult,
    fonts: Fonts,
    start_label: str,
    goal_label: str,
    map_right: int,
    examined_edges: set[int],
    event: SearchEvent | None,
    phase: str,
    progress: float,
    route_fraction: float = 0.0,
) -> Image.Image:
    image = base.copy()
    draw = ImageDraw.Draw(image)
    style = ALGORITHM_STYLE[result.algorithm]
    accent = style["accent"]
    explored_color = style["explored"]

    for edge_id in examined_edges:
        points = _edge_points(graph, projection, edge_id)
        draw.line(points, fill=(8, 25, 34), width=7, joint="curve")
        draw.line(points, fill=explored_color, width=4, joint="curve")

    if event and phase in {"search", "route"}:
        current = graph.nodes[event.current]
        cx, cy = projection.pixel(current.lat, current.lon)
        draw.ellipse((cx - 9, cy - 9, cx + 9, cy + 9), outline=accent, width=3)
        draw.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=PALETTE["white"])

    if route_fraction > 0:
        route_points = _oriented_route_points(graph, projection, result)
        partial = _partial_polyline(route_points, route_fraction)
        if len(partial) >= 2:
            draw.line(partial, fill=PALETTE["route_glow"], width=11, joint="curve")
            draw.line(partial, fill=PALETTE["route"], width=6, joint="curve")
            head_x, head_y = partial[-1]
            draw.ellipse((head_x - 6, head_y - 6, head_x + 6, head_y + 6), fill=PALETTE["white"], outline=PALETTE["route"], width=3)

    _draw_map_chrome(draw, projection, graph, fonts, start_label, goal_label, map_right, image.height)
    _draw_sidebar(draw, result, event, phase, progress, fonts, image.width, image.height, map_right)
    draw.text((26, image.height - 19), "道路データ © OpenStreetMap contributors", font=fonts.get(10), fill=PALETTE["muted2"])
    return image


def _sample_indices(total: int, maximum: int) -> list[int]:
    if total <= maximum:
        return list(range(total))
    if maximum <= 1:
        return [total - 1]
    indices = {round(index * (total - 1) / (maximum - 1)) for index in range(maximum)}
    return sorted(indices)


def create_gif(
    graph: RoadGraph,
    result: SearchResult,
    output: Path,
    start_label: str,
    goal_label: str,
    width: int,
    height: int,
    max_search_frames: int,
    fonts: Fonts,
) -> Path:
    map_right = round(width * 0.685)
    projection = MapProjection(graph, (12, 10, map_right - 12, height - 10))
    base = _draw_base(graph, projection, width, height, map_right)
    frames: list[Image.Image] = []
    durations: list[int] = []

    # 導入
    frames.append(
        _draw_frame(
            base,
            graph,
            projection,
            result,
            fonts,
            start_label,
            goal_label,
            map_right,
            set(),
            None,
            "intro",
            0.0,
        )
    )
    durations.append(900)

    # 探索。表示フレームを間引いても、塗った道路はすべて累積する。
    sampled = _sample_indices(len(result.events), max_search_frames)
    examined: set[int] = set()
    previous_event_index = -1
    for display_index, event_index in enumerate(sampled):
        for skipped_index in range(previous_event_index + 1, event_index + 1):
            examined.update(result.events[skipped_index].examined_edges)
        event = result.events[event_index]
        progress = (display_index + 1) / (len(sampled) + 14)
        frames.append(
            _draw_frame(
                base,
                graph,
                projection,
                result,
                fonts,
                start_label,
                goal_label,
                map_right,
                examined,
                event,
                "search",
                progress,
            )
        )
        durations.append(75)
        previous_event_index = event_index

    # 親ポインタを逆にたどって、黄色い最終ルートを描く。
    last_event = result.events[-1]
    trace_frames = 14
    for index in range(1, trace_frames + 1):
        fraction = index / trace_frames
        frames.append(
            _draw_frame(
                base,
                graph,
                projection,
                result,
                fonts,
                start_label,
                goal_label,
                map_right,
                examined,
                last_event,
                "route" if index < trace_frames else "done",
                (len(sampled) + index) / (len(sampled) + trace_frames),
                fraction,
            )
        )
        durations.append(90 if index < trace_frames else 2200)

    output.parent.mkdir(parents=True, exist_ok=True)
    # 全フレームで同じパレットを使い、色のちらつきを抑える。
    palette_source = frames[-1].convert("P", palette=Image.Palette.ADAPTIVE, colors=128)
    quantized = [frame.quantize(palette=palette_source, dither=Image.Dither.NONE) for frame in frames]
    quantized[0].save(
        output,
        save_all=True,
        append_images=quantized[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=True,
    )
    screenshot = output.with_name(f"{output.stem}_found.png")
    frames[-1].save(screenshot, format="PNG", optimize=True)
    return screenshot


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="BFS・ダイクストラ法・A*の最短経路探索をGIFにします。"
    )
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="Overpass JSON")
    parser.add_argument("--start", nargs=2, type=float, metavar=("LAT", "LON"), default=DEFAULT_START)
    parser.add_argument("--goal", nargs=2, type=float, metavar=("LAT", "LON"), default=DEFAULT_GOAL)
    parser.add_argument("--start-label", default="隼人駅")
    parser.add_argument("--goal-label", default="鹿児島高専")
    parser.add_argument("--algorithm", choices=("all", "bfs", "dijkstra", "astar"), default="all")
    parser.add_argument("--output-dir", type=Path, default=Path("."))
    parser.add_argument("--prefix", default="hayato_to_kosen")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--max-search-frames", type=int, default=44)
    parser.add_argument("--font", type=Path, default=None, help="日本語対応TTF/TTC")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.width < 1100 or args.height < 680:
        raise SystemExit("UIの可読性のため width>=1100、height>=680 にしてください")
    if not args.data.exists():
        raise SystemExit(f"道路データがありません: {args.data}")

    graph, graph_metadata = load_graph(args.data, tuple(args.start), tuple(args.goal))
    algorithms = list(ALGORITHM_STYLE) if args.algorithm == "all" else [args.algorithm]
    fonts = Fonts(args.font)
    results: dict[str, dict[str, float | int | str]] = {}

    print(
        f"道路グラフ: {graph_metadata['graph_nodes']}地点 / "
        f"{graph_metadata['graph_edges']}区間 "
        f"(snap: {graph_metadata['start_snap_m']}m, {graph_metadata['goal_snap_m']}m)"
    )
    for algorithm in algorithms:
        result = search(graph, algorithm)
        style = ALGORITHM_STYLE[algorithm]
        output = args.output_dir / f"{style['index']}_{algorithm}_{args.prefix}.gif"
        print(f"生成中: {output}")
        screenshot = create_gif(
            graph,
            result,
            output,
            args.start_label,
            args.goal_label,
            args.width,
            args.height,
            args.max_search_frames,
            fonts,
        )
        results[algorithm] = {
            "algorithm_ja": style["ja"],
            "output": str(output),
            "screenshot": str(screenshot),
            "distance_m": round(result.distance_m, 1),
            "road_segments": result.hops,
            "settled_nodes": result.settled_count,
            "search_events": len(result.events),
            "calculation_time_ms": round(result.calculation_ms, 6),
        }
        print(
            f"  完了: {result.distance_m / 1000:.2f} km / "
            f"{result.hops}区間 / 探索済み{result.settled_count}地点 / "
            f"探索計算{_time_label(result.calculation_ms)}"
        )

    summary = {
        "start": {"label": args.start_label, "lat": args.start[0], "lon": args.start[1]},
        "goal": {"label": args.goal_label, "lat": args.goal[0], "lon": args.goal[1]},
        "graph": graph_metadata,
        "results": results,
        "attribution": "Road data © OpenStreetMap contributors, ODbL 1.0",
    }
    summary_path = args.output_dir / "route_metrics.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"結果: {summary_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("中断しました", file=sys.stderr)
        raise SystemExit(130)
