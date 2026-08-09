(function exposeRouteLabCore(globalScope) {
  "use strict";

  const EARTH_RADIUS_M = 6_371_008.8;
  const DEFAULT_START = Object.freeze({ lat: 31.583667, lon: 130.541722, label: "鹿児島中央駅" });
  const DEFAULT_GOAL = Object.freeze({ lat: 31.59055, lon: 130.55418, label: "天文館" });

  const EXCLUDED_HIGHWAYS = new Set([
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "construction",
    "proposed",
    "raceway",
  ]);
  const EXCLUDED_ACCESS = new Set(["no", "private"]);

  const ROAD_PRIORITY = Object.freeze({
    primary: 8,
    primary_link: 7,
    secondary: 6,
    secondary_link: 5,
    tertiary: 4,
    tertiary_link: 4,
    residential: 3,
    unclassified: 3,
    living_street: 2,
    service: 1,
    pedestrian: 1,
    footway: 0,
    path: 0,
    steps: 0,
    cycleway: 0,
  });

  const ROAD_WIDTH = Object.freeze({
    primary: 3.8,
    primary_link: 3.2,
    secondary: 3.1,
    secondary_link: 2.7,
    tertiary: 2.7,
    tertiary_link: 2.4,
    residential: 2,
    unclassified: 2,
    living_street: 1.8,
    service: 1.25,
    pedestrian: 1.6,
    footway: 1,
    path: 1,
    steps: 1,
    cycleway: 1.1,
  });

  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  function haversine(a, b) {
    const lat1 = toRadians(a.lat);
    const lon1 = toRadians(a.lon);
    const lat2 = toRadians(b.lat);
    const lon2 = toRadians(b.lon);
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function isWalkable(tags) {
    const highway = tags.highway || "";
    if (!highway || EXCLUDED_HIGHWAYS.has(highway)) return false;
    if (EXCLUDED_ACCESS.has(tags.access) || tags.foot === "no") return false;
    return true;
  }

  function addToMapList(map, key, value) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  function connectedComponents(nodes, segments) {
    const neighbors = new Map();
    for (const segment of segments) {
      addToMapList(neighbors, segment.u, segment.v);
      addToMapList(neighbors, segment.v, segment.u);
    }

    const unseen = new Set(neighbors.keys());
    const components = [];
    while (unseen.size > 0) {
      const seed = unseen.values().next().value;
      unseen.delete(seed);
      const component = new Set([seed]);
      const stack = [seed];
      while (stack.length > 0) {
        const current = stack.pop();
        for (const next of neighbors.get(current) || []) {
          if (!unseen.has(next)) continue;
          unseen.delete(next);
          component.add(next);
          stack.push(next);
        }
      }
      components.push(component);
    }
    return components;
  }

  function nearestGeoNode(nodeIds, nodes, point) {
    let bestId = null;
    let bestDistance = Infinity;
    for (const nodeId of nodeIds) {
      const distance = haversine(nodes.get(nodeId), point);
      if (distance < bestDistance) {
        bestId = nodeId;
        bestDistance = distance;
      }
    }
    return { id: bestId, distance: bestDistance };
  }

  function chooseTeachingComponent(nodes, segments, startPoint, goalPoint) {
    const components = connectedComponents(nodes, segments).filter((component) => component.size >= 20);
    if (components.length === 0) {
      throw new Error("十分な大きさの道路ネットワークが見つかりませんでした。");
    }

    let best = null;
    for (const component of components) {
      const start = nearestGeoNode(component, nodes, startPoint);
      const goal = nearestGeoNode(component, nodes, goalPoint);
      const score = start.distance + goal.distance;
      if (!best || score < best.score) best = { component, start, goal, score };
    }
    return best;
  }

  function parseRoadData(raw, startPoint = DEFAULT_START, goalPoint = DEFAULT_GOAL) {
    const elements = Array.isArray(raw && raw.elements) ? raw.elements : [];
    const allNodes = new Map();
    for (const element of elements) {
      if (element.type !== "node") continue;
      allNodes.set(Number(element.id), {
        id: Number(element.id),
        lat: Number(element.lat),
        lon: Number(element.lon),
      });
    }

    const allSegments = [];
    for (const way of elements) {
      if (way.type !== "way" || !isWalkable(way.tags || {})) continue;
      const refs = (way.nodes || []).map(Number).filter((nodeId) => allNodes.has(nodeId));
      const highway = String((way.tags && way.tags.highway) || "unclassified");
      const name = String((way.tags && way.tags.name) || "");
      for (let index = 0; index < refs.length - 1; index += 1) {
        if (refs[index] === refs[index + 1]) continue;
        allSegments.push({ u: refs[index], v: refs[index + 1], highway, name });
      }
    }

    const selected = chooseTeachingComponent(allNodes, allSegments, startPoint, goalPoint);
    const componentIds = selected.component;
    const nodes = new Map();
    for (const nodeId of componentIds) nodes.set(nodeId, allNodes.get(nodeId));
    const segments = allSegments.filter(
      (segment) => componentIds.has(segment.u) && componentIds.has(segment.v),
    );

    const rawAdjacency = new Map();
    const incidentNames = new Map();
    segments.forEach((segment, segmentId) => {
      addToMapList(rawAdjacency, segment.u, segmentId);
      addToMapList(rawAdjacency, segment.v, segmentId);
      if (segment.name) {
        addToMapList(incidentNames, segment.u, segment.name);
        addToMapList(incidentNames, segment.v, segment.name);
      }
    });

    return {
      nodes,
      nodeList: Array.from(nodes.values()),
      segments,
      rawAdjacency,
      incidentNames,
      defaultStartId: selected.start.id,
      defaultGoalId: selected.goal.id,
      metadata: {
        rawNodes: nodes.size,
        rawSegments: segments.length,
        startSnapM: selected.start.distance,
        goalSnapM: selected.goal.distance,
      },
    };
  }

  function mostCommon(values) {
    const counts = new Map();
    let best = "";
    let bestCount = 0;
    for (const value of values) {
      const count = (counts.get(value) || 0) + 1;
      counts.set(value, count);
      if (count > bestCount) {
        best = value;
        bestCount = count;
      }
    }
    return best;
  }

  function chooseRoadType(counts) {
    let best = "unclassified";
    let bestScore = [-Infinity, -Infinity];
    for (const [type, count] of counts) {
      const score = [ROAD_PRIORITY[type] ?? 2, count];
      if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
        best = type;
        bestScore = score;
      }
    }
    return best;
  }

  function buildGraph(dataset, startId, goalId) {
    if (!dataset.nodes.has(startId) || !dataset.nodes.has(goalId)) {
      throw new Error("選んだ地点が道路ネットワークにありません。");
    }

    const terminals = new Set();
    for (const [nodeId, segmentIds] of dataset.rawAdjacency) {
      if (segmentIds.length !== 2) terminals.add(nodeId);
    }
    terminals.add(startId);
    terminals.add(goalId);

    const visitedSegments = new Set();
    const edges = [];
    const sortedTerminals = Array.from(terminals).sort((a, b) => a - b);

    for (const terminal of sortedTerminals) {
      for (const firstSegmentId of dataset.rawAdjacency.get(terminal) || []) {
        if (visitedSegments.has(firstSegmentId)) continue;

        let current = terminal;
        let segmentId = firstSegmentId;
        const firstNode = dataset.nodes.get(current);
        const geometry = [{ lat: firstNode.lat, lon: firstNode.lon }];
        const highwayCounts = new Map();
        const names = [];
        let lengthM = 0;

        while (true) {
          if (visitedSegments.has(segmentId)) break;
          visitedSegments.add(segmentId);
          const segment = dataset.segments[segmentId];
          const next = segment.u === current ? segment.v : segment.u;
          const currentNode = dataset.nodes.get(current);
          const nextNode = dataset.nodes.get(next);
          lengthM += haversine(currentNode, nextNode);
          geometry.push({ lat: nextNode.lat, lon: nextNode.lon });
          highwayCounts.set(segment.highway, (highwayCounts.get(segment.highway) || 0) + 1);
          if (segment.name) names.push(segment.name);
          current = next;

          if (terminals.has(current)) break;
          const nextSegments = (dataset.rawAdjacency.get(current) || []).filter(
            (candidateId) => !visitedSegments.has(candidateId),
          );
          if (nextSegments.length === 0) break;
          segmentId = nextSegments[0];
        }

        if (current === terminal || geometry.length < 2) continue;
        edges.push({
          id: edges.length,
          u: terminal,
          v: current,
          lengthM,
          geometry,
          highway: chooseRoadType(highwayCounts),
          name: mostCommon(names),
        });
      }
    }

    const nodes = new Map();
    const adjacency = new Map();
    for (const edge of edges) {
      nodes.set(edge.u, dataset.nodes.get(edge.u));
      nodes.set(edge.v, dataset.nodes.get(edge.v));
      addToMapList(adjacency, edge.u, edge.id);
      addToMapList(adjacency, edge.v, edge.id);
    }
    for (const edgeIds of adjacency.values()) edgeIds.sort((a, b) => a - b);

    return {
      nodes,
      edges,
      adjacency,
      startId,
      goalId,
      other(edgeId, nodeId) {
        const edge = edges[edgeId];
        return edge.u === nodeId ? edge.v : edge.u;
      },
    };
  }

  class MinHeap {
    constructor() {
      this.items = [];
      this.counter = 0;
    }

    get size() {
      return this.items.length;
    }

    push(priority, nodeId) {
      const item = { priority, nodeId, order: this.counter };
      this.counter += 1;
      this.items.push(item);
      let index = this.items.length - 1;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (!this.isBefore(this.items[index], this.items[parent])) break;
        [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
        index = parent;
      }
    }

    pop() {
      if (this.items.length === 0) return null;
      const first = this.items[0];
      const last = this.items.pop();
      if (this.items.length > 0) {
        this.items[0] = last;
        let index = 0;
        while (true) {
          const left = index * 2 + 1;
          const right = left + 1;
          let smallest = index;
          if (left < this.items.length && this.isBefore(this.items[left], this.items[smallest])) {
            smallest = left;
          }
          if (right < this.items.length && this.isBefore(this.items[right], this.items[smallest])) {
            smallest = right;
          }
          if (smallest === index) break;
          [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
          index = smallest;
        }
      }
      return first;
    }

    isBefore(a, b) {
      return a.priority < b.priority || (a.priority === b.priority && a.order < b.order);
    }
  }

  function reconstructPath(graph, parents) {
    if (graph.startId !== graph.goalId && !parents.has(graph.goalId)) {
      throw new Error("スタートからゴールへ到達できませんでした。");
    }
    const pathNodes = [graph.goalId];
    const pathEdges = [];
    let current = graph.goalId;
    while (current !== graph.startId) {
      const parent = parents.get(current);
      if (!parent) throw new Error("ルートの復元に失敗しました。");
      pathNodes.push(parent.previous);
      pathEdges.push(parent.edgeId);
      current = parent.previous;
    }
    pathNodes.reverse();
    pathEdges.reverse();
    return { pathNodes, pathEdges };
  }

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function search(graph, algorithm) {
    if (!new Set(["bfs", "dijkstra", "astar"]).has(algorithm)) {
      throw new Error(`未対応の探索方法です: ${algorithm}`);
    }

    const startedAt = now();
    const events = [];
    const parents = new Map();
    const goalNode = graph.nodes.get(graph.goalId);

    if (algorithm === "bfs") {
      const queue = [graph.startId];
      let head = 0;
      const depth = new Map([[graph.startId, 0]]);
      const discovered = new Set([graph.startId]);
      let settled = 0;

      while (head < queue.length) {
        const current = queue[head];
        head += 1;
        settled += 1;
        const examinedEdges = [];
        if (current !== graph.goalId) {
          for (const edgeId of graph.adjacency.get(current) || []) {
            examinedEdges.push(edgeId);
            const next = graph.other(edgeId, current);
            if (discovered.has(next)) continue;
            discovered.add(next);
            depth.set(next, depth.get(current) + 1);
            parents.set(next, { previous: current, edgeId });
            queue.push(next);
          }
        }
        events.push({
          current,
          examinedEdges,
          settledCount: settled,
          frontierCount: queue.length - head,
          g: depth.get(current),
          h: 0,
          priority: depth.get(current),
        });
        if (current === graph.goalId) break;
      }
    } else {
      const distances = new Map([[graph.startId, 0]]);
      const startNode = graph.nodes.get(graph.startId);
      const startH = haversine(startNode, goalNode);
      const heap = new MinHeap();
      heap.push(algorithm === "astar" ? startH : 0, graph.startId);
      const closed = new Set();

      while (heap.size > 0) {
        const item = heap.pop();
        const current = item.nodeId;
        if (closed.has(current)) continue;
        closed.add(current);
        const currentNode = graph.nodes.get(current);
        const currentH = haversine(currentNode, goalNode);
        const examinedEdges = [];

        if (current !== graph.goalId) {
          for (const edgeId of graph.adjacency.get(current) || []) {
            examinedEdges.push(edgeId);
            const next = graph.other(edgeId, current);
            if (closed.has(next)) continue;
            const tentative = distances.get(current) + graph.edges[edgeId].lengthM;
            if (tentative >= (distances.get(next) ?? Infinity)) continue;
            distances.set(next, tentative);
            parents.set(next, { previous: current, edgeId });
            const nextNode = graph.nodes.get(next);
            const h = haversine(nextNode, goalNode);
            heap.push(algorithm === "astar" ? tentative + h : tentative, next);
          }
        }

        events.push({
          current,
          examinedEdges,
          settledCount: closed.size,
          frontierCount: heap.size,
          g: distances.get(current),
          h: algorithm === "astar" ? currentH : 0,
          priority: item.priority,
        });
        if (current === graph.goalId) break;
      }
    }

    const path = reconstructPath(graph, parents);
    const distanceM = path.pathEdges.reduce(
      (total, edgeId) => total + graph.edges[edgeId].lengthM,
      0,
    );
    return {
      algorithm,
      events,
      pathNodes: path.pathNodes,
      pathEdges: path.pathEdges,
      distanceM,
      hops: path.pathEdges.length,
      settledCount: events.length > 0 ? events[events.length - 1].settledCount : 0,
      calculationMs: now() - startedAt,
    };
  }

  function nameForNode(dataset, nodeId, fallback = "選んだ地点") {
    const names = dataset.incidentNames.get(nodeId) || [];
    return mostCommon(names) || fallback;
  }

  const api = {
    EARTH_RADIUS_M,
    DEFAULT_START,
    DEFAULT_GOAL,
    ROAD_PRIORITY,
    ROAD_WIDTH,
    haversine,
    parseRoadData,
    buildGraph,
    search,
    nameForNode,
  };

  globalScope.RouteLabCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
