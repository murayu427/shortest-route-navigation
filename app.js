(function startRouteLab() {
  "use strict";

  const Core = window.RouteLabCore;
  if (!Core) throw new Error("route-core.js を読み込めませんでした。");
  const CONFIG = window.ROUTE_LAB_CONFIG || {};

  const ALGORITHMS = Object.freeze({
    bfs: {
      name: "BFS",
      ja: "幅優先探索",
      accent: "#27ddbe",
      accentRgb: "39, 221, 190",
      explored: "#11766a",
      tagline: "近い「段数」から、波紋のように調べる",
      equation: "優先度 ＝ 通った区間数",
      readyText: "すべての道路区間を同じ1区間として数え、少ない候補から順番に調べます。",
      searchText: "先に見つけた地点から順番に取り出し、となりの道をすべてチェックしています。",
      doneText: "通る区間数が最小のルートです。区間の長さは考えないため、実距離が最短とは限りません。",
    },
    dijkstra: {
      name: "DIJKSTRA",
      ja: "ダイクストラ法",
      accent: "#4ab1ff",
      accentRgb: "74, 177, 255",
      explored: "#18659a",
      tagline: "出発点からの実距離が短い順に調べる",
      equation: "優先度 ＝ ここまでの距離 g",
      readyText: "道路の長さを足しながら、スタートからの合計距離が短い地点を優先します。",
      searchText: "候補の中から、スタートからの合計距離 g がいちばん短い地点を選んでいます。",
      doneText: "道路の長さを重みとして使った、合計距離が最短のルートです。",
    },
    astar: {
      name: "A*",
      ja: "A* 探索",
      accent: "#b589ff",
      accentRgb: "181, 137, 255",
      explored: "#5c3e97",
      tagline: "ゴールの方向を予想して、むだを減らす",
      equation: "優先度 ＝ g ＋ 残り予想 h",
      readyText: "ここまでの距離 g と、ゴールまでの直線距離 h を足して候補を選びます。",
      searchText: "実際に進んだ距離 g とゴールまでの予想 h の合計が小さい地点を選んでいます。",
      doneText: "距離最短を保ったまま、ゴールと反対方向の探索を減らしたルートです。",
    },
  });

  const NEARBY_CATEGORIES = Object.freeze({
    convenience: { label: "コンビニ", aliases: ["コンビニ", "コンビニエンスストア", "conveniencestore"] },
    elementary_school: { label: "小学校", aliases: ["小学校", "小学", "elementaryschool"] },
    junior_high_school: { label: "中学校", aliases: ["中学校", "中学", "juniorhighschool"] },
    high_school: { label: "高校", aliases: ["高校", "高等学校", "highschool", "seniorhighschool"] },
    university: { label: "大学", aliases: ["大学", "大学院", "短期大学", "短大", "university", "college"] },
    supermarket: { label: "スーパー", aliases: ["スーパー", "スーパーマーケット", "supermarket"] },
    restaurant: { label: "レストラン", aliases: ["レストラン", "飲食店", "restaurant"] },
    bento: { label: "弁当店", aliases: ["弁当", "弁当屋", "弁当店", "お弁当", "bento"] },
    cafe: { label: "カフェ", aliases: ["カフェ", "喫茶店", "cafe", "coffee"] },
    pharmacy: { label: "薬局", aliases: ["薬局", "調剤薬局", "pharmacy"] },
    medical: { label: "病院", aliases: ["病院", "医院", "クリニック", "診療所", "hospital", "clinic"] },
    park: { label: "公園", aliases: ["公園", "park"] },
    library: { label: "図書館", aliases: ["図書館", "library"] },
    station: { label: "駅", aliases: ["駅", "鉄道駅", "電停", "station"] },
  });

  const COLORS = Object.freeze({
    map: "#07141f",
    grid: "#0c2331",
    roadMajor: "#2b4454",
    roadMinor: "#1d3443",
    roadFoot: "#172c39",
    roadShadow: "#081823",
    railway: "#708c9e",
    railwayHighlight: "#d0dde5",
    station: "#9ddbf1",
    stationFill: "#102b3a",
    text: "#ecf5f9",
    muted: "#91a8b5",
    panel: "#091824",
    start: "#30d996",
    goal: "#ff6978",
    route: "#ffcf5a",
    routeGlow: "rgba(129, 91, 18, 0.7)",
    white: "#ffffff",
  });

  const elements = {
    canvas: document.querySelector("#map-canvas"),
    loadingPanel: document.querySelector("#loading-panel"),
    algorithmPicker: document.querySelector(".algorithm-picker"),
    algorithmButtons: Array.from(document.querySelectorAll(".algorithm-button")),
    algorithmName: document.querySelector("#algorithm-name"),
    algorithmNameJa: document.querySelector("#algorithm-name-ja"),
    algorithmTagline: document.querySelector("#algorithm-tagline"),
    algorithmEquation: document.querySelector("#algorithm-equation"),
    startLabel: document.querySelector("#start-label"),
    startCoordinate: document.querySelector("#start-coordinate"),
    goalLabel: document.querySelector("#goal-label"),
    goalCoordinate: document.querySelector("#goal-coordinate"),
    routeChipStart: document.querySelector("#route-chip-start"),
    routeChipGoal: document.querySelector("#route-chip-goal"),
    pickStart: document.querySelector("#pick-start"),
    pickGoal: document.querySelector("#pick-goal"),
    swapLocations: document.querySelector("#swap-locations"),
    restoreDefaults: document.querySelector("#restore-defaults"),
    startRow: document.querySelector("#pick-start").closest(".location-row"),
    goalRow: document.querySelector("#pick-goal").closest(".location-row"),
    selectionHint: document.querySelector("#selection-hint"),
    selectionHintText: document.querySelector("#selection-hint-text"),
    cancelSelection: document.querySelector("#cancel-selection"),
    placeSearchPanel: document.querySelector("#place-search-panel"),
    placeSearchTitle: document.querySelector("#place-search-title"),
    placeSearchForm: document.querySelector("#place-search-form"),
    placeSearchInput: document.querySelector("#place-search-input"),
    placeSearchSubmit: document.querySelector("#place-search-submit"),
    placeSearchStatus: document.querySelector("#place-search-status"),
    placeSearchLoading: document.querySelector("#place-search-loading"),
    placeSearchLoadingDetail: document.querySelector("#place-search-loading-detail"),
    placeSearchResults: document.querySelector("#place-search-results"),
    nearbyCategoryButtons: Array.from(document.querySelectorAll("[data-nearby-category]")),
    closePlaceSearch: document.querySelector("#close-place-search"),
    pickFromCurrentMap: document.querySelector("#pick-from-current-map"),
    speedSelect: document.querySelector("#speed-select"),
    primaryAction: document.querySelector("#primary-action"),
    stopAction: document.querySelector("#stop-action"),
    primaryActionIcon: document.querySelector(".primary-action__icon"),
    primaryActionLabel: document.querySelector("#primary-action-label"),
    phaseLabel: document.querySelector("#phase-label"),
    phaseDetail: document.querySelector("#phase-detail"),
    progressTrack: document.querySelector("#progress-track"),
    progressFill: document.querySelector("#progress-fill"),
    metricSettled: document.querySelector("#metric-settled"),
    metricTime: document.querySelector("#metric-time"),
    metricCurrent: document.querySelector("#metric-current"),
    metricRoute: document.querySelector("#metric-route"),
    downloadGif: document.querySelector("#download-gif"),
    downloadGifLabel: document.querySelector("#download-gif-label"),
    explanationText: document.querySelector("#explanation-text"),
    toast: document.querySelector("#toast"),
  };

  const ctx = elements.canvas.getContext("2d");
  const baseCanvas = document.createElement("canvas");
  const baseContext = baseCanvas.getContext("2d");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const state = {
    loaded: false,
    dataset: null,
    rawRoadData: null,
    mapFeatures: { railways: [], stations: [], pois: {} },
    defaultRawData: null,
    graph: null,
    startId: null,
    goalId: null,
    startLabel: Core.DEFAULT_START.label,
    goalLabel: Core.DEFAULT_GOAL.label,
    startPlace: { ...Core.DEFAULT_START },
    goalPlace: { ...Core.DEFAULT_GOAL },
    draftStartPlace: { ...Core.DEFAULT_START },
    draftGoalPlace: { ...Core.DEFAULT_GOAL },
    searchPreview: null,
    algorithm: "bfs",
    phase: "loading",
    paused: false,
    selectionMode: null,
    placeSearchMode: null,
    networkLoading: false,
    loadingDetail: "道路データを読み込んでいます",
    geocodeController: null,
    placeSearchBusy: false,
    poiRetryPromise: null,
    lastGeocodeAt: 0,
    roadMemoryCache: new Map(),
    result: null,
    currentEvent: null,
    exploredEdges: new Set(),
    eventCursor: 0,
    eventBudget: 0,
    routeProgress: 0,
    lastFrameTime: null,
    animationId: null,
    canvasWidth: 0,
    canvasHeight: 0,
    dpr: 1,
    projection: null,
    gifGenerating: false,
    toastTimer: null,
  };

  function metricPoint(node, cosLatitude) {
    return {
      x: Core.EARTH_RADIUS_M * ((node.lon * Math.PI) / 180) * cosLatitude,
      y: Core.EARTH_RADIUS_M * ((node.lat * Math.PI) / 180),
    };
  }

  function createProjection(nodes, width, height) {
    const meanLatitude = nodes.reduce((sum, node) => sum + node.lat, 0) / Math.max(1, nodes.length);
    const cosLatitude = Math.cos((meanLatitude * Math.PI) / 180);
    const metricNodes = nodes.map((node) => metricPoint(node, cosLatitude));
    const minX = Math.min(...metricNodes.map((point) => point.x));
    const maxX = Math.max(...metricNodes.map((point) => point.x));
    const minY = Math.min(...metricNodes.map((point) => point.y));
    const maxY = Math.max(...metricNodes.map((point) => point.y));
    const sidePadding = width < 520 ? 22 : 34;
    const topPadding = width < 520 ? 64 : 76;
    const bottomPadding = width < 520 ? 34 : 45;
    const availableWidth = Math.max(1, width - sidePadding * 2);
    const availableHeight = Math.max(1, height - topPadding - bottomPadding);
    const scale = Math.min(
      availableWidth / Math.max(1, maxX - minX),
      availableHeight / Math.max(1, maxY - minY),
    );
    const usedWidth = (maxX - minX) * scale;
    const usedHeight = (maxY - minY) * scale;
    const originX = sidePadding + (availableWidth - usedWidth) / 2 - minX * scale;
    const originY = topPadding + (availableHeight - usedHeight) / 2 + maxY * scale;

    return {
      scale,
      project(node) {
        const metric = metricPoint(node, cosLatitude);
        return { x: originX + metric.x * scale, y: originY - metric.y * scale };
      },
    };
  }

  function formatCoordinate(node) {
    return `${node.lat.toFixed(5)}, ${node.lon.toFixed(5)}`;
  }

  function samePlace(a, b) {
    return Boolean(
      a &&
      b &&
      Math.abs(a.lat - b.lat) < 0.0000001 &&
      Math.abs(a.lon - b.lon) < 0.0000001,
    );
  }

  function formatDistance(value) {
    if (!Number.isFinite(value)) return "—";
    if (value < 1000) return `${Math.round(value)} m`;
    return `${(value / 1000).toFixed(2)} km`;
  }

  function formatTime(value) {
    if (!Number.isFinite(value)) return "—";
    if (value < 1) return `${value.toFixed(3)} ms`;
    if (value < 10) return `${value.toFixed(2)} ms`;
    return `${value.toFixed(1)} ms`;
  }

  function formatEvaluation(event) {
    if (!event) return "—";
    if (state.algorithm === "bfs") return `${Math.round(event.priority)} 区間`;
    return formatDistance(event.priority);
  }

  function roadColor(highway) {
    const priority = Core.ROAD_PRIORITY[highway] ?? 2;
    if (priority >= 6) return COLORS.roadMajor;
    if (priority <= 1) return COLORS.roadFoot;
    return COLORS.roadMinor;
  }

  function featurePoint(element, nodeLookup) {
    if (element.type === "node" && Number.isFinite(Number(element.lat)) && Number.isFinite(Number(element.lon))) {
      return { lat: Number(element.lat), lon: Number(element.lon) };
    }
    if (element.center && Number.isFinite(Number(element.center.lat)) && Number.isFinite(Number(element.center.lon))) {
      return { lat: Number(element.center.lat), lon: Number(element.center.lon) };
    }
    const points = (element.nodes || []).map((nodeId) => nodeLookup.get(Number(nodeId))).filter(Boolean);
    if (points.length === 0) return null;
    return {
      lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
      lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length,
    };
  }

  function extractMapFeatures(raw) {
    const elementsList = Array.isArray(raw && raw.elements) ? raw.elements : [];
    const nodeLookup = new Map();
    for (const element of elementsList) {
      if (element.type !== "node") continue;
      nodeLookup.set(Number(element.id), { lat: Number(element.lat), lon: Number(element.lon) });
    }

    const railLineTypes = new Set(["rail", "subway", "tram", "light_rail", "monorail", "narrow_gauge"]);
    const stationTypes = new Set(["station", "halt", "tram_stop"]);
    const railways = [];
    const stations = [];
    const pois = Object.fromEntries(
      Object.keys(NEARBY_CATEGORIES)
        .filter((category) => category !== "station")
        .map((category) => [category, []]),
    );
    const seenStations = new Set();
    const seenPois = new Set();

    for (const element of elementsList) {
      const tags = element.tags || {};
      if (element.type === "way" && railLineTypes.has(tags.railway)) {
        const geometry = (element.nodes || []).map((nodeId) => nodeLookup.get(Number(nodeId))).filter(Boolean);
        if (geometry.length >= 2) railways.push({ geometry, type: tags.railway });
      }

      const isStation = stationTypes.has(tags.railway) || tags.public_transport === "station";
      if (isStation) {
        const key = `${element.type}:${element.id}`;
        const point = featurePoint(element, nodeLookup);
        if (point && !seenStations.has(key)) {
          seenStations.add(key);
          stations.push({
            ...point,
            name: String(tags["name:ja"] || tags.name || (tags.railway === "tram_stop" ? "電停" : "駅")),
            type: tags.railway || tags.public_transport,
            priority: tags.railway === "station" ? 3 : tags.railway === "halt" ? 2 : 1,
          });
        }
      }

      const name = String(tags["name:ja"] || tags.name || tags.brand || "");
      const categories = [];
      if (tags.shop === "convenience") categories.push("convenience");
      if (tags.amenity === "school") {
        const schoolLevel = String(tags["isced:level"] || tags["school:level"] || "");
        if (/小学校|小学/.test(name) || /(^|;)1($|;)/.test(schoolLevel)) categories.push("elementary_school");
        if (/中学校|中学/.test(name) || /(^|;)2($|;)/.test(schoolLevel)) categories.push("junior_high_school");
        if (/高等学校|高校/.test(name) || /(^|;)3($|;)/.test(schoolLevel)) categories.push("high_school");
      }
      if (
        tags.amenity === "university" ||
        (tags.amenity === "college" && /大学|短期大学|短大/.test(name))
      ) {
        categories.push("university");
      }
      if (tags.shop === "supermarket") categories.push("supermarket");
      if (tags.amenity === "restaurant") categories.push("restaurant");
      const cuisine = String(tags.cuisine || "");
      if (
        tags.shop === "deli" ||
        /bento/i.test(cuisine) ||
        /弁当|おべんとう|ほっともっと|かまどや|オリジン|ほっかほっか亭/i.test(name)
      ) {
        categories.push("bento");
      }
      if (tags.amenity === "cafe") categories.push("cafe");
      if (tags.amenity === "pharmacy") categories.push("pharmacy");
      if (["hospital", "clinic", "doctors"].includes(tags.amenity)) categories.push("medical");
      if (tags.leisure === "park") categories.push("park");
      if (tags.amenity === "library") categories.push("library");

      if (categories.length > 0) {
        const point = featurePoint(element, nodeLookup);
        for (const category of categories) {
          const key = `${category}:${element.type}:${element.id}`;
          if (!point || seenPois.has(key)) continue;
          seenPois.add(key);
          pois[category].push({
            ...point,
            name: name || NEARBY_CATEGORIES[category].label,
            detail: NEARBY_CATEGORIES[category].label,
          });
        }
      }
    }

    const dedupeNearby = (features, radiusM) => {
      const kept = [];
      for (const feature of features) {
        const duplicate = kept.some(
          (existing) =>
            existing.name === feature.name && Core.haversine(existing, feature) <= radiusM,
        );
        if (!duplicate) kept.push(feature);
      }
      return kept;
    };
    const orderedStations = stations.sort((a, b) => b.priority - a.priority);
    const dedupedPois = Object.fromEntries(
      Object.entries(pois).map(([category, features]) => [category, dedupeNearby(features, 30)]),
    );
    return { railways, stations: dedupeNearby(orderedStations, 80), pois: dedupedPois };
  }

  function traceGeometry(context, geometry) {
    if (!geometry || geometry.length === 0) return;
    const first = state.projection.project(geometry[0]);
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < geometry.length; index += 1) {
      const point = state.projection.project(geometry[index]);
      context.lineTo(point.x, point.y);
    }
  }

  function strokeEdge(context, edge, color, width) {
    traceGeometry(context, edge.geometry);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  }

  function drawRailways(context) {
    context.save();
    for (const railway of state.mapFeatures.railways) {
      traceGeometry(context, railway.geometry);
      context.setLineDash([]);
      context.strokeStyle = COLORS.railway;
      context.lineWidth = railway.type === "tram" ? 2.4 : 3.2;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();

      traceGeometry(context, railway.geometry);
      context.setLineDash(railway.type === "tram" ? [2, 5] : [3, 5]);
      context.strokeStyle = COLORS.railwayHighlight;
      context.lineWidth = 0.9;
      context.stroke();
    }
    context.restore();
  }

  function rectanglesOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function drawStations(context) {
    const occupied = [];
    const maxLabels = state.canvasWidth < 520 ? 10 : state.canvasWidth < 820 ? 16 : 26;
    let labelCount = 0;
    const stations = [...state.mapFeatures.stations].sort(
      (a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "ja"),
    );
    context.save();
    context.font = "700 10px 'BIZ UDPGothic', 'Yu Gothic UI', sans-serif";
    context.textBaseline = "middle";
    for (const station of stations) {
      const point = state.projection.project(station);
      if (point.x < 4 || point.y < 72 || point.x > state.canvasWidth - 4 || point.y > state.canvasHeight - 28) continue;
      context.fillStyle = COLORS.stationFill;
      context.strokeStyle = COLORS.station;
      context.lineWidth = 1.5;
      roundedRect(context, point.x - 4.5, point.y - 4.5, 9, 9, 2.5);
      context.fill();
      context.stroke();

      if (labelCount >= maxLabels) continue;
      const label = station.name.length > 12 ? `${station.name.slice(0, 11)}…` : station.name;
      const labelWidth = context.measureText(label).width + 8;
      const rect = {
        x: Math.min(state.canvasWidth - labelWidth - 5, point.x + 7),
        y: point.y - 8,
        width: labelWidth,
        height: 16,
      };
      if (rect.x < 5 || occupied.some((existing) => rectanglesOverlap(rect, existing))) continue;
      occupied.push(rect);
      labelCount += 1;
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 4);
      context.fillStyle = "rgba(7, 20, 31, 0.88)";
      context.fill();
      context.fillStyle = COLORS.station;
      context.textAlign = "left";
      context.fillText(label, rect.x + 4, rect.y + rect.height / 2 + 0.5);
    }
    context.restore();
  }

  function drawBaseMap() {
    if (!state.graph || !state.projection) return;
    baseCanvas.width = elements.canvas.width;
    baseCanvas.height = elements.canvas.height;
    baseContext.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    const gradient = baseContext.createRadialGradient(
      state.canvasWidth * 0.45,
      state.canvasHeight * 0.42,
      0,
      state.canvasWidth * 0.45,
      state.canvasHeight * 0.42,
      Math.max(state.canvasWidth, state.canvasHeight) * 0.75,
    );
    gradient.addColorStop(0, "#0a1c28");
    gradient.addColorStop(1, COLORS.map);
    baseContext.fillStyle = gradient;
    baseContext.fillRect(0, 0, state.canvasWidth, state.canvasHeight);

    baseContext.strokeStyle = COLORS.grid;
    baseContext.lineWidth = 1;
    for (let x = 0; x <= state.canvasWidth; x += 48) {
      baseContext.beginPath();
      baseContext.moveTo(x + 0.5, 0);
      baseContext.lineTo(x + 0.5, state.canvasHeight);
      baseContext.stroke();
    }
    for (let y = 0; y <= state.canvasHeight; y += 48) {
      baseContext.beginPath();
      baseContext.moveTo(0, y + 0.5);
      baseContext.lineTo(state.canvasWidth, y + 0.5);
      baseContext.stroke();
    }

    drawRailways(baseContext);

    const orderedEdges = [...state.graph.edges].sort(
      (a, b) => (Core.ROAD_PRIORITY[a.highway] ?? 2) - (Core.ROAD_PRIORITY[b.highway] ?? 2),
    );
    for (const edge of orderedEdges) {
      const width = Core.ROAD_WIDTH[edge.highway] ?? 1.8;
      if (width >= 2.7) strokeEdge(baseContext, edge, COLORS.roadShadow, width + 3);
      strokeEdge(baseContext, edge, roadColor(edge.highway), width);
    }

    drawStations(baseContext);

    drawScaleBar(baseContext);
  }

  function drawScaleBar(context) {
    const barMeters = state.canvasWidth < 520 ? 250 : 500;
    const barWidth = Math.max(24, barMeters * state.projection.scale);
    const x2 = state.canvasWidth - 24;
    const x1 = x2 - barWidth;
    const y = state.canvasHeight - 27;
    context.strokeStyle = COLORS.text;
    context.fillStyle = COLORS.muted;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x1, y);
    context.lineTo(x2, y);
    context.moveTo(x1, y - 5);
    context.lineTo(x1, y + 5);
    context.moveTo(x2, y - 5);
    context.lineTo(x2, y + 5);
    context.stroke();
    context.font = "600 10px system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText(`${barMeters} m`, x1, y - 9);
  }

  function routePoints() {
    if (!state.result) return [];
    const points = [];
    state.result.pathEdges.forEach((edgeId, index) => {
      const edge = state.graph.edges[edgeId];
      const currentNodeId = state.result.pathNodes[index];
      const geometry = edge.u === currentNodeId ? edge.geometry : [...edge.geometry].reverse();
      const projected = geometry.map((node) => state.projection.project(node));
      if (points.length > 0 && projected.length > 0) projected.shift();
      points.push(...projected);
    });
    return points;
  }

  function partialRoute(points, fraction) {
    if (points.length < 2) return points;
    const lengths = [];
    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const length = Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
      lengths.push(length);
      total += length;
    }
    const target = total * Math.max(0, Math.min(1, fraction));
    const result = [points[0]];
    let travelled = 0;
    for (let index = 0; index < lengths.length; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      const length = lengths[index];
      if (travelled + length <= target) {
        result.push(end);
        travelled += length;
        continue;
      }
      if (length > 0) {
        const ratio = (target - travelled) / length;
        result.push({
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio,
        });
      }
      break;
    }
    return result;
  }

  function strokePoints(context, points, color, width) {
    if (points.length < 2) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  }

  function drawMarker(context, node, label, color, alignRight) {
    const point = state.projection.project(node);
    context.save();
    context.fillStyle = COLORS.map;
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(point.x, point.y, 9, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = color;
    context.beginPath();
    context.arc(point.x, point.y, 3, 0, Math.PI * 2);
    context.fill();

    const displayLabel = label.length > 13 ? `${label.slice(0, 12)}…` : label;
    context.font = "700 12px 'BIZ UDPGothic', 'Yu Gothic UI', sans-serif";
    const textWidth = context.measureText(displayLabel).width;
    const boxWidth = textWidth + 22;
    const boxHeight = 31;
    let boxX = alignRight ? point.x + 15 : point.x - 15 - boxWidth;
    boxX = Math.max(8, Math.min(state.canvasWidth - boxWidth - 8, boxX));
    const boxY = Math.max(72, Math.min(state.canvasHeight - boxHeight - 32, point.y - boxHeight / 2));
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(point.x + (alignRight ? 8 : -8), point.y);
    context.lineTo(alignRight ? boxX : boxX + boxWidth, point.y);
    context.stroke();
    roundedRect(context, boxX, boxY, boxWidth, boxHeight, 9);
    context.fillStyle = "rgba(9, 24, 36, 0.95)";
    context.fill();
    context.strokeStyle = color;
    context.stroke();
    context.fillStyle = COLORS.text;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(displayLabel, boxX + 11, boxY + boxHeight / 2 + 0.5);
    context.restore();
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function render() {
    if (!state.loaded || !state.graph || !state.projection) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    ctx.drawImage(baseCanvas, 0, 0);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    const config = ALGORITHMS[state.algorithm];
    for (const edgeId of state.exploredEdges) {
      const edge = state.graph.edges[edgeId];
      if (!edge) continue;
      strokeEdge(ctx, edge, COLORS.roadShadow, 7);
      strokeEdge(ctx, edge, config.explored, 4);
    }

    if (state.currentEvent && state.phase !== "done") {
      const currentNode = state.graph.nodes.get(state.currentEvent.current);
      if (currentNode) {
        const point = state.projection.project(currentNode);
        ctx.strokeStyle = config.accent;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = COLORS.white;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (state.result && state.routeProgress > 0) {
      const points = partialRoute(routePoints(), state.routeProgress);
      strokePoints(ctx, points, COLORS.routeGlow, 11);
      strokePoints(ctx, points, COLORS.route, 5.5);
      if (points.length > 0 && state.routeProgress < 1) {
        const head = points[points.length - 1];
        ctx.fillStyle = COLORS.white;
        ctx.strokeStyle = COLORS.route;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    if (state.searchPreview) {
      const anchorNode = state.graph.nodes.get(state.startId);
      if (anchorNode) {
        drawMarker(
          ctx,
          anchorNode,
          state.searchPreview.anchor.label,
          state.searchPreview.targetMode === "goal" ? COLORS.start : COLORS.goal,
          state.searchPreview.targetMode !== "goal",
        );
      }
      return;
    }

    drawMarker(ctx, state.graph.nodes.get(state.startId), state.startLabel, COLORS.start, false);
    drawMarker(ctx, state.graph.nodes.get(state.goalId), state.goalLabel, COLORS.goal, true);
  }

  function resizeCanvas() {
    const rect = elements.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (
      state.canvasWidth === width &&
      state.canvasHeight === height &&
      state.dpr === dpr
    ) {
      return;
    }
    state.canvasWidth = width;
    state.canvasHeight = height;
    state.dpr = dpr;
    elements.canvas.width = Math.round(width * dpr);
    elements.canvas.height = Math.round(height * dpr);
    if (state.dataset) {
      state.projection = createProjection(state.dataset.nodeList, width, height);
      drawBaseMap();
      render();
    }
  }

  function updateAlgorithmUI() {
    const config = ALGORITHMS[state.algorithm];
    document.documentElement.style.setProperty("--accent", config.accent);
    document.documentElement.style.setProperty("--accent-soft", `rgba(${config.accentRgb}, 0.14)`);
    elements.algorithmName.textContent = config.name;
    elements.algorithmNameJa.textContent = config.ja;
    elements.algorithmTagline.textContent = config.tagline;
    elements.algorithmEquation.textContent = config.equation;
    for (const button of elements.algorithmButtons) {
      const active = button.dataset.algorithm === state.algorithm;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function updateLocationUI() {
    const displayStart = state.draftStartPlace || state.startPlace;
    const displayGoal = state.draftGoalPlace || state.goalPlace;
    elements.startLabel.textContent = displayStart.label;
    elements.goalLabel.textContent = displayGoal.label;
    elements.startCoordinate.textContent = formatCoordinate(displayStart);
    elements.goalCoordinate.textContent = formatCoordinate(displayGoal);
    elements.routeChipStart.textContent = state.searchPreview
      ? state.searchPreview.targetMode === "goal" ? displayStart.label : "スタートを検索中"
      : state.startPlace.label;
    elements.routeChipGoal.textContent = state.searchPreview
      ? state.searchPreview.targetMode === "goal" ? "ゴールを検索中" : displayGoal.label
      : state.goalPlace.label;
    elements.startRow.classList.toggle("is-pending", !samePlace(displayStart, state.startPlace));
    elements.goalRow.classList.toggle("is-pending", !samePlace(displayGoal, state.goalPlace));
  }

  function overallProgress() {
    if (!state.result) return 0;
    if (state.phase === "done") return 1;
    if (state.phase === "route") return 0.84 + state.routeProgress * 0.16;
    if (state.phase === "search") {
      return (state.eventCursor / Math.max(1, state.result.events.length)) * 0.84;
    }
    return 0;
  }

  function updatePanel() {
    const config = ALGORITHMS[state.algorithm];
    updateAlgorithmUI();

    let phaseLabel = "準備完了";
    let phaseDetail = state.graph ? `${state.graph.nodes.size}地点・${state.graph.edges.length}区間` : "";
    let explanation = config.readyText;

    if (state.phase === "loading") {
      phaseLabel = "準備中";
      phaseDetail = state.loadingDetail;
      explanation = state.networkLoading
        ? "選んだ2地点の周辺道路を取得し、探索用のグラフへ変換しています。"
        : "道路データを準備しています。";
    } else if (state.paused) {
      phaseLabel = "一時停止中";
      phaseDetail = state.phase === "route" ? "ルートを復元中" : `${state.eventCursor}地点まで探索`;
      explanation = "再開すると、ここから探索アニメーションを続けます。";
    } else if (state.phase === "search") {
      phaseLabel = "探索中";
      phaseDetail = state.currentEvent ? `候補 ${state.currentEvent.frontierCount}地点` : "候補を準備中";
      explanation = config.searchText;
    } else if (state.phase === "route") {
      phaseLabel = "最短ルートを復元";
      phaseDetail = "ゴールから親を逆向きにたどっています";
      explanation = "ゴールから「どこから来たか」を逆向きにたどり、黄色で決定ルートを描いています。";
    } else if (state.phase === "done") {
      phaseLabel = "ルート確定";
      phaseDetail = `${state.result.hops}区間・${formatDistance(state.result.distanceM)}`;
      explanation = config.doneText;
    }

    elements.phaseLabel.textContent = phaseLabel;
    elements.phaseDetail.textContent = phaseDetail;
    elements.explanationText.textContent = explanation;

    const progress = Math.round(overallProgress() * 100);
    elements.progressFill.style.width = `${progress}%`;
    elements.progressFill.style.background = state.phase === "done" ? COLORS.route : config.accent;
    elements.progressTrack.setAttribute("aria-valuenow", String(progress));

    elements.metricSettled.textContent = state.currentEvent
      ? state.currentEvent.settledCount.toLocaleString("ja-JP")
      : state.phase === "done"
        ? state.result.settledCount.toLocaleString("ja-JP")
        : "—";
    elements.metricTime.textContent = state.result ? formatTime(state.result.calculationMs) : "—";
    elements.metricCurrent.textContent = formatEvaluation(state.currentEvent);
    elements.metricRoute.textContent = state.phase === "done" ? formatDistance(state.result.distanceM) : "—";

    if (state.phase === "search" || state.phase === "route") {
      elements.primaryActionIcon.textContent = state.paused ? "▶" : "❚❚";
      elements.primaryActionLabel.textContent = state.paused ? "探索を再開" : "一時停止";
    } else if (state.phase === "done") {
      elements.primaryActionIcon.textContent = "↻";
      elements.primaryActionLabel.textContent = "もう一度見る";
    } else {
      elements.primaryActionIcon.textContent = "▶";
      elements.primaryActionLabel.textContent = "探索を開始";
    }
  }

  function updateControls() {
    const exploring = state.phase === "search" || state.phase === "route";
    const busy = exploring || state.networkLoading || state.gifGenerating;
    elements.algorithmPicker.disabled = !state.loaded || busy;
    elements.pickStart.disabled = !state.loaded || busy;
    elements.pickGoal.disabled = !state.loaded || busy;
    elements.swapLocations.disabled = !state.loaded || busy;
    elements.restoreDefaults.disabled = !state.loaded || busy;
    elements.speedSelect.disabled = !state.loaded || state.gifGenerating;
    elements.primaryAction.disabled =
      !state.loaded || state.networkLoading || state.gifGenerating || state.startId === state.goalId;
    elements.stopAction.hidden = !exploring;
    elements.stopAction.disabled = !exploring;
    elements.downloadGif.disabled = state.phase !== "done" || !state.result || state.gifGenerating;
  }

  function showLoadingOverlay(titleText, detailText) {
    elements.loadingPanel.innerHTML = "";
    const spinner = document.createElement("span");
    spinner.className = "loading-panel__spinner";
    spinner.setAttribute("aria-hidden", "true");
    const title = document.createElement("strong");
    title.textContent = titleText;
    const detail = document.createElement("span");
    detail.textContent = detailText;
    elements.loadingPanel.append(spinner, title, detail);
    elements.loadingPanel.classList.remove("is-hidden");
  }

  function hideLoadingOverlay() {
    elements.loadingPanel.classList.add("is-hidden");
  }

  function resetDraftPlaces() {
    state.draftStartPlace = { ...state.startPlace };
    state.draftGoalPlace = { ...state.goalPlace };
    updateLocationUI();
  }

  function captureRouteView() {
    return {
      dataset: state.dataset,
      rawRoadData: state.rawRoadData,
      mapFeatures: state.mapFeatures,
      graph: state.graph,
      startId: state.startId,
      goalId: state.goalId,
      result: state.result,
      currentEvent: state.currentEvent,
      exploredEdges: new Set(state.exploredEdges),
      eventCursor: state.eventCursor,
      eventBudget: state.eventBudget,
      routeProgress: state.routeProgress,
      lastFrameTime: state.lastFrameTime,
      paused: state.paused,
      phase: state.phase,
    };
  }

  function restoreSearchPreview() {
    if (!state.searchPreview) return;
    const previous = state.searchPreview.previous;
    state.searchPreview = null;
    state.dataset = previous.dataset;
    state.rawRoadData = previous.rawRoadData;
    state.mapFeatures = previous.mapFeatures;
    state.graph = previous.graph;
    state.startId = previous.startId;
    state.goalId = previous.goalId;
    state.result = previous.result;
    state.currentEvent = previous.currentEvent;
    state.exploredEdges = new Set(previous.exploredEdges);
    state.eventCursor = previous.eventCursor;
    state.eventBudget = previous.eventBudget;
    state.routeProgress = previous.routeProgress;
    state.lastFrameTime = previous.lastFrameTime;
    state.paused = previous.paused;
    state.phase = previous.phase;
    state.projection = createProjection(state.dataset.nodeList, state.canvasWidth, state.canvasHeight);
    drawBaseMap();
    updateLocationUI();
    updateControls();
    updatePanel();
    render();
  }

  function routeArea(startPlace, goalPlace) {
    const paddingM = Number(CONFIG.roadAreaPaddingM) || 900;
    const meanLat = (startPlace.lat + goalPlace.lat) / 2;
    const latPadding = paddingM / 111_320;
    const lonPadding = paddingM / (111_320 * Math.max(0.2, Math.cos((meanLat * Math.PI) / 180)));
    return {
      south: Math.min(startPlace.lat, goalPlace.lat) - latPadding,
      west: Math.min(startPlace.lon, goalPlace.lon) - lonPadding,
      north: Math.max(startPlace.lat, goalPlace.lat) + latPadding,
      east: Math.max(startPlace.lon, goalPlace.lon) + lonPadding,
    };
  }

  function roadCacheKey(bounds) {
    return [bounds.south, bounds.west, bounds.north, bounds.east]
      .map((value) => value.toFixed(4))
      .join("_");
  }

  function roadCacheUrl(key) {
    return new URL(`./.route-lab-cache/${key}.json`, window.location.href).href;
  }

  async function readRoadCache(key) {
    if (state.roadMemoryCache.has(key)) return state.roadMemoryCache.get(key);
    if (!("caches" in window) || !window.isSecureContext) return null;
    try {
      const cache = await caches.open("route-lab-road-data-v5");
      const response = await cache.match(roadCacheUrl(key));
      if (!response) return null;
      const payload = await response.json();
      if (!payload.savedAt || Date.now() - payload.savedAt > 7 * 24 * 60 * 60 * 1000) {
        await cache.delete(roadCacheUrl(key));
        return null;
      }
      state.roadMemoryCache.set(key, payload.data);
      return payload.data;
    } catch {
      return null;
    }
  }

  async function writeRoadCache(key, data) {
    state.roadMemoryCache.set(key, data);
    if (!("caches" in window) || !window.isSecureContext) return;
    try {
      const cache = await caches.open("route-lab-road-data-v5");
      const response = new Response(JSON.stringify({ savedAt: Date.now(), data }), {
        headers: { "Content-Type": "application/json; charset=UTF-8" },
      });
      await cache.put(roadCacheUrl(key), response);
      const keys = await cache.keys();
      while (keys.length > 5) await cache.delete(keys.shift());
    } catch {
      // キャッシュ容量が足りなくても、今回の探索はそのまま続ける。
    }
  }

  function currentAreaContains(startPlace, goalPlace) {
    const bbox = state.rawRoadData && state.rawRoadData._route_gif_metadata
      ? state.rawRoadData._route_gif_metadata.bbox
      : null;
    if (!Array.isArray(bbox) || bbox.length !== 4) return false;
    const [south, west, north, east] = bbox.map(Number);
    return [startPlace, goalPlace].every(
      (place) =>
        place.lat >= south + 0.001 &&
        place.lat <= north - 0.001 &&
        place.lon >= west + 0.001 &&
        place.lon <= east - 0.001,
    );
  }

  function overpassBbox(bounds) {
    return [bounds.south, bounds.west, bounds.north, bounds.east]
      .map((value) => value.toFixed(7))
      .join(",");
  }

  function roadNetworkQuery(bounds) {
    const bbox = overpassBbox(bounds);
    return `[out:json][timeout:25];(
      way["highway"]["highway"!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed|raceway)$"](${bbox});
      way["railway"~"^(rail|subway|tram|light_rail|monorail|narrow_gauge)$"](${bbox});
    );out body qt;>;out skel qt;`;
  }

  function nearbyFeaturesQuery(bounds) {
    const bbox = overpassBbox(bounds);
    const selectors = [
      'nwr["railway"~"^(station|halt|tram_stop)$"]',
      'nwr["public_transport"="station"]',
      'nwr["shop"~"^(convenience|supermarket|deli)$"]',
      'nwr["amenity"~"^(school|university|college|restaurant|cafe|pharmacy|hospital|clinic|doctors|library)$"]',
      'nwr["cuisine"~"bento",i]',
      'nwr["leisure"="park"]',
    ];
    const body = selectors.map((selector) => `${selector}(${bbox});`).join("");
    return `[out:json][timeout:20];(${body});out body center qt;`;
  }

  function boundsDimensionsM(bounds) {
    const meanLat = (bounds.south + bounds.north) / 2;
    return {
      northSouth: (bounds.north - bounds.south) * 111_320,
      eastWest:
        (bounds.east - bounds.west) * 111_320 * Math.max(0.2, Math.cos((meanLat * Math.PI) / 180)),
    };
  }

  function splitBoundsAlongLongestSide(bounds) {
    const dimensions = boundsDimensionsM(bounds);
    if (dimensions.northSouth >= dimensions.eastWest) {
      const middle = (bounds.south + bounds.north) / 2;
      return [
        { ...bounds, north: middle },
        { ...bounds, south: middle },
      ];
    }
    const middle = (bounds.west + bounds.east) / 2;
    return [
      { ...bounds, east: middle },
      { ...bounds, west: middle },
    ];
  }

  function shouldSplitBeforeRequest(bounds) {
    const dimensions = boundsDimensionsM(bounds);
    return (
      Math.max(dimensions.northSouth, dimensions.eastWest) > 5_200 ||
      dimensions.northSouth * dimensions.eastWest > 14_000_000
    );
  }

  function mergeOverpassElements(dataParts) {
    const merged = new Map();
    for (const data of dataParts) {
      for (const element of data.elements || []) {
        const key = `${element.type}:${element.id}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, element);
          continue;
        }
        merged.set(key, {
          ...existing,
          ...element,
          tags: { ...(existing.tags || {}), ...(element.tags || {}) },
          nodes: element.nodes || existing.nodes,
          center: element.center || existing.center,
        });
      }
    }
    return Array.from(merged.values());
  }

  async function requestOverpass(query, options = {}) {
    const endpoints = Array.isArray(CONFIG.overpassEndpoints)
      ? CONFIG.overpassEndpoints.filter(Boolean)
      : [];
    if (endpoints.length === 0) throw new Error("道路APIが設定されていません。");
    const endpointLimit = Math.max(
      1,
      Math.min(endpoints.length, Number(options.endpointLimit) || endpoints.length),
    );
    const timeoutMs = Math.max(8_000, Number(options.timeoutMs) || 32_000);

    let lastError = null;
    for (let attempt = 0; attempt < endpointLimit; attempt += 1) {
      const endpoint = endpoints[attempt];
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          },
          body: new URLSearchParams({ data: query }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`道路APIが応答しませんでした（${response.status}）`);
        const data = await response.json();
        if (!Array.isArray(data.elements)) throw new Error("道路APIのデータ形式が正しくありません。");
        return data;
      } catch (error) {
        lastError = error;
        if (attempt + 1 < endpointLimit) {
          await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }
    throw lastError || new Error("道路APIからデータを取得できませんでした。");
  }

  async function fetchOverpassRegion(bounds, queryBuilder, label, depth = 0, options = {}) {
    try {
      state.loadingDetail = `${label}を取得しています`;
      updatePanel();
      const requestOptions = { ...(options.requestOptions || {}) };
      if (requestOptions.endpointLimit == null && depth < (Number(options.maxDepth) || 0)) {
        requestOptions.endpointLimit = 1;
      }
      return [await requestOverpass(queryBuilder(bounds), requestOptions)];
    } catch (error) {
      if (depth >= (Number(options.maxDepth) || 0)) throw error;
      const parts = [];
      const dividedBounds = splitBoundsAlongLongestSide(bounds);
      for (let index = 0; index < dividedBounds.length; index += 1) {
        state.loadingDetail = `${label}を分割取得しています（${index + 1}/${dividedBounds.length}）`;
        updatePanel();
        parts.push(
          ...(await fetchOverpassRegion(
            dividedBounds[index],
            queryBuilder,
            label,
            depth + 1,
            options,
          )),
        );
      }
      return parts;
    }
  }

  async function fetchOverpassParts(bounds, queryBuilder, label, suppliedOptions = {}) {
    const options = {
      maxDepth: 2,
      preSplit: true,
      forceSplit: false,
      requestOptions: {},
      ...suppliedOptions,
    };
    if (!options.forceSplit && (!options.preSplit || !shouldSplitBeforeRequest(bounds))) {
      return fetchOverpassRegion(bounds, queryBuilder, label, 0, options);
    }
    const parts = [];
    const dividedBounds = splitBoundsAlongLongestSide(bounds);
    for (let index = 0; index < dividedBounds.length; index += 1) {
      state.loadingDetail = `${label}を分割取得しています（${index + 1}/${dividedBounds.length}）`;
      updatePanel();
      parts.push(...(await fetchOverpassRegion(dividedBounds[index], queryBuilder, label, 1, options)));
    }
    return parts;
  }

  async function fetchRoadData(startPlace, goalPlace) {
    const bounds = routeArea(startPlace, goalPlace);
    const key = roadCacheKey(bounds);
    const cached = await readRoadCache(key);
    const cachedPoiIncomplete = Boolean(cached?._route_gif_metadata?.poiIncomplete);
    if (cached && !cachedPoiIncomplete) return cached;

    let networkParts;
    if (cached) {
      networkParts = [cached];
    } else {
      try {
        networkParts = await fetchOverpassParts(bounds, roadNetworkQuery, "道路データ");
      } catch (error) {
        throw new Error(
          error && error.name === "AbortError"
            ? "道路データを小さな範囲に分けても取得できませんでした。通信状況を確認して再度お試しください。"
            : "道路データを複数の提供元・小さな範囲で再試行しましたが取得できませんでした。",
        );
      }
    }

    let featureParts = [];
    let poiIncomplete = false;
    try {
      featureParts = await fetchOverpassParts(bounds, nearbyFeaturesQuery, "周辺施設データ", {
        maxDepth: 0,
        preSplit: false,
        requestOptions: { timeoutMs: 12_000, endpointLimit: 1 },
      });
    } catch {
      poiIncomplete = true;
    }

    if (cached && poiIncomplete) return cached;

    const data = {
      elements: mergeOverpassElements([...networkParts, ...featureParts]),
      _route_gif_metadata: {
        bbox: [bounds.south, bounds.west, bounds.north, bounds.east],
        attribution: "Data © OpenStreetMap contributors, ODbL 1.0",
        source: "Public Overpass API instances",
        poiIncomplete,
      },
    };
    await writeRoadCache(key, data);
    return data;
  }

  function applyRoadData(raw, startPlace, goalPlace) {
    const dataset = Core.parseRoadData(raw, startPlace, goalPlace);
    if (dataset.metadata.startSnapM > 450 || dataset.metadata.goalSnapM > 450) {
      throw new Error("選んだ場所の近くに、探索できる道路が見つかりませんでした。");
    }
    const graph = Core.buildGraph(dataset, dataset.defaultStartId, dataset.defaultGoalId);
    state.searchPreview = null;
    state.dataset = dataset;
    state.rawRoadData = raw;
    state.mapFeatures = extractMapFeatures(raw);
    state.graph = graph;
    state.startId = dataset.defaultStartId;
    state.goalId = dataset.defaultGoalId;
    state.startPlace = { ...startPlace };
    state.goalPlace = { ...goalPlace };
    state.draftStartPlace = { ...startPlace };
    state.draftGoalPlace = { ...goalPlace };
    state.startLabel = startPlace.label;
    state.goalLabel = goalPlace.label;
    state.loaded = true;
    state.networkLoading = false;
    state.phase = "ready";
    state.projection = createProjection(dataset.nodeList, state.canvasWidth, state.canvasHeight);
    clearAnimation();
    drawBaseMap();
    updateLocationUI();
    updateControls();
    updatePanel();
    render();
  }

  function applySearchPreview(raw, anchor, targetMode) {
    const previous = state.searchPreview ? state.searchPreview.previous : captureRouteView();
    const dataset = Core.parseRoadData(raw, anchor, anchor);
    if (dataset.metadata.startSnapM > 450) {
      throw new Error("選んだ場所の近くに、探索できる道路が見つかりませんでした。");
    }
    const graph = Core.buildGraph(dataset, dataset.defaultStartId, dataset.defaultGoalId);
    state.dataset = dataset;
    state.rawRoadData = raw;
    state.mapFeatures = extractMapFeatures(raw);
    state.graph = graph;
    state.startId = dataset.defaultStartId;
    state.goalId = dataset.defaultGoalId;
    state.searchPreview = {
      previous,
      anchor: { ...anchor },
      targetMode,
    };
    state.projection = createProjection(dataset.nodeList, state.canvasWidth, state.canvasHeight);
    clearAnimation();
    drawBaseMap();
    updateLocationUI();
    updateControls();
    updatePanel();
    render();
  }

  async function loadRoadArea(startPlace, goalPlace, suppliedRaw = null) {
    const distance = Core.haversine(startPlace, goalPlace);
    const minimum = Number(CONFIG.minimumRouteDistanceM) || 80;
    const maximum = Number(CONFIG.maximumRouteDistanceM) || 6000;
    if (distance < minimum) throw new Error("2地点が近すぎます。少し離れた場所を選んでください。");
    if (distance > maximum) throw new Error("2地点は直線距離6 km以内で選んでください。");

    if (state.animationId !== null) cancelAnimationFrame(state.animationId);
    state.animationId = null;
    state.networkLoading = true;
    state.phase = "loading";
    state.loadingDetail = `${startPlace.label}〜${goalPlace.label}周辺`;
    setPlaceSearchMapLoading(true);
    updateControls();
    updatePanel();
    showLoadingOverlay("周辺の道路を準備しています", state.loadingDetail);

    try {
      let raw = suppliedRaw;
      if (!raw && currentAreaContains(startPlace, goalPlace)) raw = state.rawRoadData;
      if (!raw) raw = await fetchRoadData(startPlace, goalPlace);
      applyRoadData(raw, startPlace, goalPlace);
      closePlaceSearch(false);
      hideLoadingOverlay();
    } catch (error) {
      state.networkLoading = false;
      state.phase = state.loaded ? "ready" : "loading";
      setPlaceSearchMapLoading(false);
      updateControls();
      updatePanel();
      if (state.loaded) {
        hideLoadingOverlay();
        setPlaceSearchStatus(error.message || "道路を準備できませんでした。", true);
        showToast(error.message || "道路を準備できませんでした。");
      }
      throw error;
    }
  }

  async function loadSearchPreview(anchor, targetMode) {
    if (state.animationId !== null) cancelAnimationFrame(state.animationId);
    state.animationId = null;
    state.networkLoading = true;
    state.loadingDetail = `${anchor.label}周辺`;
    setPlaceSearchMapLoading(true);
    updateControls();
    showLoadingOverlay("選んだ地点周辺の地図を準備しています", state.loadingDetail);

    try {
      let raw = currentAreaContains(anchor, anchor) ? state.rawRoadData : null;
      if (!raw) raw = await fetchRoadData(anchor, anchor);
      applySearchPreview(raw, anchor, targetMode);
      state.networkLoading = false;
      setPlaceSearchMapLoading(false);
      updateControls();
      updatePanel();
      hideLoadingOverlay();
    } catch (error) {
      state.networkLoading = false;
      setPlaceSearchMapLoading(false);
      updateControls();
      hideLoadingOverlay();
      setPlaceSearchStatus(error.message || "選んだ地点周辺の地図を準備できませんでした。", true);
      showToast(error.message || "選んだ地点周辺の地図を準備できませんでした。");
      throw error;
    }
  }

  function clearAnimation() {
    if (state.animationId !== null) cancelAnimationFrame(state.animationId);
    state.animationId = null;
    state.paused = false;
    state.result = null;
    state.currentEvent = null;
    state.exploredEdges.clear();
    state.eventCursor = 0;
    state.eventBudget = 0;
    state.routeProgress = 0;
    state.lastFrameTime = null;
    if (state.loaded) state.phase = "ready";
    updateControls();
    updatePanel();
    render();
  }

  function rebuildGraph() {
    state.graph = Core.buildGraph(state.dataset, state.startId, state.goalId);
    clearAnimation();
    drawBaseMap();
    updateLocationUI();
    updatePanel();
    render();
  }

  function startSearch() {
    stopSelection();
    if (state.animationId !== null) cancelAnimationFrame(state.animationId);
    try {
      state.result = Core.search(state.graph, state.algorithm);
    } catch (error) {
      showToast(error.message || "探索に失敗しました。");
      return;
    }
    state.exploredEdges.clear();
    state.currentEvent = null;
    state.eventCursor = 0;
    state.eventBudget = 0;
    state.routeProgress = 0;
    state.lastFrameTime = null;
    state.paused = false;
    state.phase = "search";
    updateControls();
    updatePanel();
    render();
    state.animationId = requestAnimationFrame(animationFrame);
  }

  function animationFrame(timestamp) {
    state.animationId = null;
    if (state.paused || !state.result) return;
    if (state.lastFrameTime === null) state.lastFrameTime = timestamp;
    const delta = Math.min(64, Math.max(0, timestamp - state.lastFrameTime));
    const speed = Number(elements.speedSelect.value) || 1;

    if (state.phase === "search") {
      const searchDuration = prefersReducedMotion.matches ? 420 : 3200;
      state.eventBudget += (delta * state.result.events.length * speed) / searchDuration;
      let eventCount = Math.floor(state.eventBudget);
      state.eventBudget -= eventCount;
      while (eventCount > 0 && state.eventCursor < state.result.events.length) {
        const event = state.result.events[state.eventCursor];
        for (const edgeId of event.examinedEdges) state.exploredEdges.add(edgeId);
        state.currentEvent = event;
        state.eventCursor += 1;
        eventCount -= 1;
      }
      if (state.eventCursor >= state.result.events.length) {
        state.phase = "route";
        state.routeProgress = 0;
        state.lastFrameTime = timestamp;
      } else {
        state.lastFrameTime = timestamp;
      }
    } else if (state.phase === "route") {
      const routeDuration = prefersReducedMotion.matches ? 260 : 1000;
      state.routeProgress = Math.min(1, state.routeProgress + (delta * speed) / routeDuration);
      state.lastFrameTime = timestamp;
      if (state.routeProgress >= 1) {
        state.phase = "done";
        state.currentEvent = state.result.events[state.result.events.length - 1] || null;
      }
    }

    updateControls();
    updatePanel();
    render();
    if (state.phase !== "done") state.animationId = requestAnimationFrame(animationFrame);
  }

  function togglePause() {
    if (!(state.phase === "search" || state.phase === "route")) return;
    state.paused = !state.paused;
    state.lastFrameTime = null;
    updatePanel();
    if (!state.paused && state.animationId === null) {
      state.animationId = requestAnimationFrame(animationFrame);
    }
  }

  function stopSearch() {
    if (!(state.phase === "search" || state.phase === "route")) return;
    clearAnimation();
    showToast("探索を中止しました。スタートとゴールはそのままです。");
  }

  function fitCanvasText(context, value, maxWidth) {
    const text = String(value);
    if (context.measureText(text).width <= maxWidth) return text;
    let shortened = text;
    while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
      shortened = shortened.slice(0, -1);
    }
    return `${shortened}…`;
  }

  function createGifExportSurface() {
    const width = 640;
    const headerHeight = 64;
    const footerHeight = 40;
    const sourceWidth = Math.max(1, state.canvasWidth);
    const sourceHeight = Math.max(1, state.canvasHeight);
    const scale = Math.min(width / sourceWidth, 480 / sourceHeight);
    const mapWidth = Math.max(1, Math.round(sourceWidth * scale));
    const mapHeight = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = headerHeight + mapHeight + footerHeight;
    return {
      canvas,
      context: canvas.getContext("2d", { willReadFrequently: true }),
      headerHeight,
      footerHeight,
      mapWidth,
      mapHeight,
      mapX: Math.round((width - mapWidth) / 2),
    };
  }

  function composeGifFrame(surface, statusText) {
    const { canvas, context, headerHeight, footerHeight, mapWidth, mapHeight, mapX } = surface;
    const config = ALGORITHMS[state.algorithm];
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = COLORS.map;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      elements.canvas,
      0,
      0,
      elements.canvas.width,
      elements.canvas.height,
      mapX,
      headerHeight,
      mapWidth,
      mapHeight,
    );

    context.fillStyle = COLORS.panel;
    context.fillRect(0, 0, canvas.width, headerHeight);
    context.fillRect(0, headerHeight + mapHeight, canvas.width, footerHeight);
    context.fillStyle = config.accent;
    context.fillRect(0, 0, 6, headerHeight);

    context.textBaseline = "middle";
    context.textAlign = "left";
    context.fillStyle = COLORS.text;
    context.font = "800 19px 'BIZ UDPGothic', 'Yu Gothic UI', sans-serif";
    context.fillText(`最短経路探索｜${config.name}`, 20, 23);
    context.fillStyle = COLORS.muted;
    context.font = "600 13px 'BIZ UDPGothic', 'Yu Gothic UI', sans-serif";
    context.fillText(
      fitCanvasText(context, `${state.startLabel} → ${state.goalLabel}`, canvas.width - 40),
      20,
      47,
    );

    const footerY = headerHeight + mapHeight + footerHeight / 2;
    context.fillStyle = state.phase === "done" ? COLORS.route : config.accent;
    context.font = "800 12px 'BIZ UDPGothic', 'Yu Gothic UI', sans-serif";
    context.fillText(fitCanvasText(context, statusText, canvas.width - 180), 20, footerY);
    context.textAlign = "right";
    context.fillStyle = COLORS.muted;
    context.font = "700 11px 'BIZ UDPGothic', 'Yu Gothic UI', sans-serif";
    context.fillText("ナビ最短経路ラボ", canvas.width - 18, footerY);
  }

  function safeGifFilePart(value) {
    return String(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[\s　]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 32) || "point";
  }

  function triggerGifDownload(blob) {
    const filename = [
      state.algorithm,
      safeGifFilePart(state.startLabel),
      "to",
      safeGifFilePart(state.goalLabel),
    ].join("_");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.gif`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function downloadResultGif() {
    if (state.phase !== "done" || !state.result || state.gifGenerating) return;
    const GifEncoder = window.RouteGifEncoder?.GifEncoder;
    if (!GifEncoder) {
      showToast("GIF作成機能を読み込めませんでした。ページを再読み込みしてください。");
      return;
    }

    const previous = {
      phase: state.phase,
      paused: state.paused,
      currentEvent: state.currentEvent,
      exploredEdges: new Set(state.exploredEdges),
      eventCursor: state.eventCursor,
      eventBudget: state.eventBudget,
      routeProgress: state.routeProgress,
      lastFrameTime: state.lastFrameTime,
    };
    state.gifGenerating = true;
    elements.downloadGif.setAttribute("aria-busy", "true");
    elements.downloadGifLabel.textContent = "GIFを準備中…";
    updateControls();
    showToast("探索アニメーションのGIFを作成しています。");

    try {
      const surface = createGifExportSurface();
      const encoder = new GifEncoder(surface.canvas.width, surface.canvas.height, { loop: 0 });
      const events = state.result.events;
      const searchFrameCount = Math.min(24, Math.max(12, Math.ceil(Math.sqrt(Math.max(1, events.length)))));
      const routeFrameCount = 10;
      const totalFrames = searchFrameCount + routeFrameCount + 2;
      let encodedFrames = 0;

      const addFrame = (statusText, delay) => {
        render();
        composeGifFrame(surface, statusText);
        const rgba = surface.context.getImageData(0, 0, surface.canvas.width, surface.canvas.height).data;
        encoder.addFrame(rgba, delay);
        encodedFrames += 1;
        const progress = Math.min(99, Math.round((encodedFrames / totalFrames) * 100));
        elements.downloadGifLabel.textContent = `GIF作成中 ${progress}%`;
      };

      state.phase = "search";
      state.paused = false;
      state.currentEvent = null;
      state.exploredEdges = new Set();
      state.eventCursor = 0;
      state.eventBudget = 0;
      state.routeProgress = 0;
      addFrame("探索を開始", 35);

      let appliedEventCount = 0;
      for (let frame = 1; frame <= searchFrameCount; frame += 1) {
        const targetEventCount = Math.ceil((events.length * frame) / searchFrameCount);
        while (appliedEventCount < targetEventCount) {
          const event = events[appliedEventCount];
          for (const edgeId of event.examinedEdges) state.exploredEdges.add(edgeId);
          state.currentEvent = event;
          appliedEventCount += 1;
        }
        state.eventCursor = appliedEventCount;
        const percent = Math.round((appliedEventCount / Math.max(1, events.length)) * 100);
        const settled = state.currentEvent?.settledCount || 0;
        addFrame(`探索中 ${percent}%｜${settled.toLocaleString("ja-JP")}地点を確認`, 10);
        if (frame % 4 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      state.phase = "route";
      state.currentEvent = events[events.length - 1] || null;
      for (let frame = 1; frame <= routeFrameCount; frame += 1) {
        state.routeProgress = frame / routeFrameCount;
        addFrame(`最短ルートを復元 ${Math.round(state.routeProgress * 100)}%`, 10);
        if (frame % 4 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      state.phase = "done";
      state.routeProgress = 1;
      addFrame(`ルート確定｜${formatDistance(state.result.distanceM)}・${state.result.hops}区間`, 120);
      elements.downloadGifLabel.textContent = "ダウンロードを開始…";
      triggerGifDownload(encoder.finish());
      showToast("探索結果のGIFを保存しました。");
    } catch (error) {
      console.error(error);
      showToast("GIFを作成できませんでした。もう一度お試しください。");
    } finally {
      state.phase = previous.phase;
      state.paused = previous.paused;
      state.currentEvent = previous.currentEvent;
      state.exploredEdges = previous.exploredEdges;
      state.eventCursor = previous.eventCursor;
      state.eventBudget = previous.eventBudget;
      state.routeProgress = previous.routeProgress;
      state.lastFrameTime = previous.lastFrameTime;
      state.gifGenerating = false;
      elements.downloadGif.removeAttribute("aria-busy");
      elements.downloadGifLabel.textContent = "探索結果をGIFで保存";
      updateControls();
      updatePanel();
      render();
    }
  }

  function setPlaceSearchStatus(message, isError = false) {
    elements.placeSearchStatus.textContent = message;
    elements.placeSearchStatus.classList.toggle("is-error", isError);
  }

  function setPlaceSearchMapLoading(isLoading) {
    if (!state.placeSearchMode) return;
    const targetLabel = state.placeSearchMode === "goal" ? "ゴール" : "スタート";
    elements.placeSearchTitle.textContent = isLoading
      ? `${targetLabel}の地図を取得中…`
      : `${targetLabel}を検索`;
    elements.placeSearchTitle.classList.toggle("is-map-loading", isLoading);
  }

  function setPlaceSearchBusy(isBusy, detail = "日本国内から候補を探しています") {
    state.placeSearchBusy = isBusy;
    elements.placeSearchPanel.setAttribute("aria-busy", String(isBusy));
    elements.placeSearchLoading.hidden = !isBusy;
    elements.placeSearchLoadingDetail.textContent = detail;
    elements.placeSearchInput.disabled = isBusy;
    elements.placeSearchSubmit.disabled = isBusy;
    elements.placeSearchSubmit.textContent = isBusy ? "検索中" : "検索";
    elements.nearbyCategoryButtons.forEach((button) => {
      button.disabled = isBusy;
    });
  }

  function openPlaceSearch(mode, preserveDraft = false, message = "") {
    if (!state.loaded || state.phase === "search" || state.phase === "route" || state.networkLoading) return;
    stopSelection();
    if (!preserveDraft) {
      restoreSearchPreview();
      resetDraftPlaces();
    }
    state.placeSearchMode = mode;
    elements.placeSearchPanel.hidden = false;
    elements.placeSearchTitle.textContent = mode === "start" ? "スタートを検索" : "ゴールを検索";
    elements.placeSearchTitle.classList.remove("is-map-loading");
    elements.placeSearchInput.value = "";
    elements.placeSearchResults.replaceChildren();
    setPlaceSearchBusy(false);
    setPlaceSearchStatus(message);
    elements.pickStart.classList.toggle("is-active", mode === "start");
    elements.pickGoal.classList.toggle("is-active", mode === "goal");
    window.setTimeout(() => elements.placeSearchInput.focus(), 0);
  }

  function closePlaceSearch(revertDraft = true) {
    if (state.geocodeController) state.geocodeController.abort();
    state.geocodeController = null;
    setPlaceSearchBusy(false);
    setPlaceSearchMapLoading(false);
    state.placeSearchMode = null;
    elements.placeSearchPanel.hidden = true;
    elements.placeSearchResults.replaceChildren();
    setPlaceSearchStatus("");
    elements.pickStart.classList.remove("is-active");
    elements.pickGoal.classList.remove("is-active");
    if (revertDraft) {
      restoreSearchPreview();
      resetDraftPlaces();
    }
  }

  function geocodeCacheKey(query) {
    const bbox = state.rawRoadData && state.rawRoadData._route_gif_metadata
      ? state.rawRoadData._route_gif_metadata.bbox
      : null;
    const areaKey = Array.isArray(bbox) ? bbox.map((value) => Number(value).toFixed(2)).join(":") : "jp";
    return `route-lab-geocode-v2:${areaKey}:${query.trim().toLocaleLowerCase("ja-JP")}`;
  }

  function readGeocodeCache(query) {
    try {
      const raw = localStorage.getItem(geocodeCacheKey(query));
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload.savedAt || Date.now() - payload.savedAt > 30 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(geocodeCacheKey(query));
        return null;
      }
      return payload.results;
    } catch {
      return null;
    }
  }

  function writeGeocodeCache(query, results) {
    try {
      localStorage.setItem(
        geocodeCacheKey(query),
        JSON.stringify({ savedAt: Date.now(), results }),
      );
    } catch {
      // 保存できなくても検索結果は利用できる。
    }
  }

  async function geocodePlaces(query) {
    const cached = readGeocodeCache(query);
    if (cached) return cached;

    const waitMs = Math.max(0, 1050 - (Date.now() - state.lastGeocodeAt));
    if (waitMs > 0) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
    state.lastGeocodeAt = Date.now();
    if (state.geocodeController) state.geocodeController.abort();
    state.geocodeController = new AbortController();

    const url = new URL(CONFIG.geocoderEndpoint || "https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("countrycodes", CONFIG.searchCountryCode || "jp");
    url.searchParams.set("accept-language", "ja");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "5");
    const bbox = state.rawRoadData && state.rawRoadData._route_gif_metadata
      ? state.rawRoadData._route_gif_metadata.bbox
      : null;
    if (Array.isArray(bbox) && bbox.length === 4) {
      const [south, west, north, east] = bbox.map(Number);
      url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
    }
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: state.geocodeController.signal,
    });
    if (!response.ok) throw new Error(`場所検索が応答しませんでした（${response.status}）`);
    const results = await response.json();
    if (!Array.isArray(results)) throw new Error("場所検索のデータ形式が正しくありません。");
    writeGeocodeCache(query, results);
    return results;
  }

  function placeFromSearchResult(result) {
    const displayName = String(result.display_name || "検索した場所");
    const firstPart = displayName.split(",")[0].trim();
    return {
      label: String(result.name || firstPart || "検索した場所"),
      detail: displayName,
      lat: Number(result.lat),
      lon: Number(result.lon),
    };
  }

  function resultSecondaryText(result) {
    if (Number.isFinite(result._localDistanceM)) {
      return `${result._localOriginLabel || "地図の中心"}から約${formatDistance(result._localDistanceM)}`;
    }
    const parts = String(result.display_name || "").split(",").map((part) => part.trim());
    return parts.slice(1, 4).filter(Boolean).join(" / ") || "日本";
  }

  function nearbyCategoryFromQuery(query) {
    const normalized = query
      .trim()
      .toLocaleLowerCase("ja-JP")
      .replace(/[\s　]/g, "")
      .replace(/^(近くの|周辺の|地図周辺の)/, "");
    for (const [category, definition] of Object.entries(NEARBY_CATEGORIES)) {
      if (definition.aliases.includes(normalized)) return category;
    }
    return null;
  }

  function nearbySearchOrigin() {
    if (state.placeSearchMode === "goal" && state.draftStartPlace) {
      return {
        ...state.draftStartPlace,
        originLabel: `スタート「${state.draftStartPlace.label}」`,
      };
    }
    if (state.searchPreview) {
      return {
        ...state.searchPreview.anchor,
        originLabel: `選んだ地点「${state.searchPreview.anchor.label}」`,
      };
    }
    return {
      lat: (state.startPlace.lat + state.goalPlace.lat) / 2,
      lon: (state.startPlace.lon + state.goalPlace.lon) / 2,
      originLabel: "地図の中心",
    };
  }

  async function refreshIncompleteNearbyFeatures() {
    if (!state.rawRoadData?._route_gif_metadata?.poiIncomplete) return true;
    if (state.poiRetryPromise) return state.poiRetryPromise;
    const bbox = state.rawRoadData._route_gif_metadata.bbox;
    if (!Array.isArray(bbox) || bbox.length !== 4) return false;
    const bounds = {
      south: Number(bbox[0]),
      west: Number(bbox[1]),
      north: Number(bbox[2]),
      east: Number(bbox[3]),
    };

    state.poiRetryPromise = (async () => {
      const featureParts = await fetchOverpassParts(bounds, nearbyFeaturesQuery, "周辺施設データ", {
        maxDepth: 1,
        forceSplit: true,
        requestOptions: { timeoutMs: 14_000 },
      });
      const updated = {
        ...state.rawRoadData,
        elements: mergeOverpassElements([state.rawRoadData, ...featureParts]),
        _route_gif_metadata: {
          ...state.rawRoadData._route_gif_metadata,
          poiIncomplete: false,
        },
      };
      state.rawRoadData = updated;
      state.mapFeatures = extractMapFeatures(updated);
      await writeRoadCache(roadCacheKey(bounds), updated);
      drawBaseMap();
      render();
      return true;
    })();

    try {
      return await state.poiRetryPromise;
    } finally {
      state.poiRetryPromise = null;
    }
  }

  function localCategoryResults(category) {
    const features = category === "station"
      ? state.mapFeatures.stations
      : state.mapFeatures.pois[category] || [];
    const categoryLabel = NEARBY_CATEGORIES[category]?.label || "施設";
    const origin = nearbySearchOrigin();
    return features
      .map((feature) => ({ feature, distanceM: Core.haversine(origin, feature) }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 8)
      .map(({ feature, distanceM }) => ({
        name: feature.name,
        display_name: `${feature.name}, ${feature.detail || categoryLabel}`,
        lat: String(feature.lat),
        lon: String(feature.lon),
        _localDistanceM: distanceM,
        _localOriginLabel: origin.originLabel,
      }));
  }

  async function showNearbyCategory(category) {
    if (state.geocodeController) state.geocodeController.abort();
    state.geocodeController = null;
    const label = NEARBY_CATEGORIES[category]?.label || "施設";
    const origin = nearbySearchOrigin();
    elements.placeSearchInput.value = label;
    setPlaceSearchBusy(true, `${origin.originLabel}周辺の${label}を探しています`);
    setPlaceSearchStatus(`${label}を検索しています…`);
    elements.placeSearchResults.replaceChildren();

    try {
      let refreshFailed = false;
      if (state.rawRoadData?._route_gif_metadata?.poiIncomplete) {
        setPlaceSearchStatus("施設データだけを小さな範囲に分けて再取得しています…");
        try {
          await refreshIncompleteNearbyFeatures();
        } catch {
          refreshFailed = true;
        }
      }
      const results = localCategoryResults(category);
      if (results.length === 0) {
        elements.placeSearchResults.replaceChildren();
        setPlaceSearchStatus(
          refreshFailed
            ? `道路は利用できますが、${label}データの取得だけ混雑のため完了しませんでした。もう一度お試しください。`
            : `${origin.originLabel}周辺に${label}が見つかりませんでした。`,
          true,
        );
        return;
      }
      renderPlaceResults(results);
    } finally {
      setPlaceSearchBusy(false);
    }
  }

  function renderPlaceResults(results) {
    elements.placeSearchResults.replaceChildren();
    if (results.length === 0) {
      setPlaceSearchStatus("見つかりませんでした。都道府県名も加えて検索してみてください。", true);
      return;
    }
    const nearby = results.every((result) => Number.isFinite(result._localDistanceM));
    const nearbyOriginLabel = results[0]?._localOriginLabel || "地図の中心";
    setPlaceSearchStatus(
      nearby
        ? `${nearbyOriginLabel}から近い順に${results.length}件表示しています。`
        : `${results.length}件見つかりました。現在の地域に近い候補を優先しています。`,
    );
    for (const result of results) {
      const place = placeFromSearchResult(result);
      if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) continue;
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "place-result-button";
      const copy = document.createElement("span");
      copy.className = "place-result-button__copy";
      const title = document.createElement("strong");
      title.textContent = place.label;
      const detail = document.createElement("small");
      detail.textContent = resultSecondaryText(result);
      const arrow = document.createElement("span");
      arrow.className = "place-result-button__arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      copy.append(title, detail);
      button.append(copy, arrow);
      button.addEventListener("click", () => selectSearchedPlace(place));
      item.append(button);
      elements.placeSearchResults.append(item);
    }
  }

  async function submitPlaceSearch(event) {
    event.preventDefault();
    const query = elements.placeSearchInput.value.trim();
    if (query.length < 2) {
      setPlaceSearchStatus("2文字以上で入力してください。", true);
      return;
    }
    setPlaceSearchBusy(true, `「${query}」を日本国内から探しています`);
    setPlaceSearchStatus("日本国内から検索しています…");
    elements.placeSearchResults.replaceChildren();
    try {
      const nearbyCategory = nearbyCategoryFromQuery(query);
      if (nearbyCategory) {
        await showNearbyCategory(nearbyCategory);
        return;
      }
      const results = await geocodePlaces(query);
      renderPlaceResults(results);
    } catch (error) {
      if (error.name !== "AbortError") {
        setPlaceSearchStatus("場所を検索できませんでした。少し待ってから再度お試しください。", true);
      }
    } finally {
      setPlaceSearchBusy(false);
      state.geocodeController = null;
    }
  }

  async function selectSearchedPlace(place) {
    const mode = state.placeSearchMode;
    if (!mode) return;
    const nextStart = mode === "start" ? place : state.draftStartPlace;
    const nextGoal = mode === "goal" ? place : state.draftGoalPlace;
    const otherDraft = mode === "start" ? state.draftGoalPlace : state.draftStartPlace;
    const otherActive = mode === "start" ? state.goalPlace : state.startPlace;
    const distance = Core.haversine(nextStart, nextGoal);
    const maximum = Number(CONFIG.maximumRouteDistanceM) || 6000;
    const minimum = Number(CONFIG.minimumRouteDistanceM) || 80;

    if (distance < minimum) {
      setPlaceSearchStatus("2地点が近すぎます。少し離れた場所を選んでください。", true);
      return;
    }
    if (distance > maximum && !samePlace(otherDraft, otherActive)) {
      setPlaceSearchStatus(`先に選んだ「${otherDraft.label}」から6 km以内の場所を選んでください。`, true);
      return;
    }

    if (mode === "start") state.draftStartPlace = place;
    else state.draftGoalPlace = place;
    updateLocationUI();

    if (distance > maximum) {
      const nextMode = mode === "start" ? "goal" : "start";
      try {
        await loadSearchPreview(place, nextMode);
        openPlaceSearch(
          nextMode,
          true,
          `「${place.label}」周辺へ移動しました。近くの${nextMode === "goal" ? "ゴール" : "スタート"}を検索してください。`,
        );
      } catch {
        // エラー内容は検索パネルとトーストに表示済み。
      }
      return;
    }

    try {
      await loadRoadArea(state.draftStartPlace, state.draftGoalPlace);
    } catch {
      // エラー内容は検索パネルとトーストに表示済み。
    }
  }

  function startSelection(mode) {
    if (!state.loaded || state.phase === "search" || state.phase === "route") return;
    state.selectionMode = state.selectionMode === mode ? null : mode;
    elements.pickStart.classList.toggle("is-active", state.selectionMode === "start");
    elements.pickGoal.classList.toggle("is-active", state.selectionMode === "goal");
    elements.canvas.classList.toggle("is-picking", Boolean(state.selectionMode));
    elements.selectionHint.hidden = !state.selectionMode;
    if (state.selectionMode) {
      const label = state.selectionMode === "start" ? "スタート" : "ゴール";
      elements.selectionHintText.textContent = `${label}にする道路をクリック`;
      elements.canvas.focus({ preventScroll: true });
    }
  }

  function stopSelection() {
    state.selectionMode = null;
    elements.pickStart.classList.remove("is-active");
    elements.pickGoal.classList.remove("is-active");
    elements.canvas.classList.remove("is-picking");
    elements.selectionHint.hidden = true;
  }

  function nearestNodeAt(x, y) {
    let bestNode = null;
    let bestDistanceSquared = Infinity;
    for (const node of state.dataset.nodeList) {
      const point = state.projection.project(node);
      const distanceSquared = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (distanceSquared < bestDistanceSquared) {
        bestNode = node;
        bestDistanceSquared = distanceSquared;
      }
    }
    return { node: bestNode, pixelDistance: Math.sqrt(bestDistanceSquared) };
  }

  async function chooseNodeFromMap(event) {
    if (!state.selectionMode) return;
    event.preventDefault();
    const rect = elements.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const nearest = nearestNodeAt(x, y);
    if (!nearest.node) return;

    const otherId = state.selectionMode === "start" ? state.goalId : state.startId;
    if (nearest.node.id === otherId) {
      showToast("スタートとゴールは別の地点を選んでください。");
      return;
    }

    const isStart = state.selectionMode === "start";
    const fallback = isStart ? "選んだスタート" : "選んだゴール";
    const label = Core.nameForNode(state.dataset, nearest.node.id, fallback);
    const place = { label, lat: nearest.node.lat, lon: nearest.node.lon };

    if (state.searchPreview) {
      const mode = state.selectionMode;
      if (isStart) state.draftStartPlace = place;
      else state.draftGoalPlace = place;
      stopSelection();
      updateLocationUI();
      try {
        await loadRoadArea(state.draftStartPlace, state.draftGoalPlace);
        showToast(`${isStart ? "スタート" : "ゴール"}を最寄りの道路地点に設定しました。`);
      } catch (error) {
        openPlaceSearch(
          mode,
          true,
          error.message || "選んだ地点ではルートを準備できませんでした。別の地点を選んでください。",
        );
      }
      return;
    }

    if (isStart) {
      state.startId = nearest.node.id;
      state.startLabel = label;
      state.startPlace = place;
      state.draftStartPlace = { ...place };
    } else {
      state.goalId = nearest.node.id;
      state.goalLabel = label;
      state.goalPlace = place;
      state.draftGoalPlace = { ...place };
    }
    const selectedType = isStart ? "スタート" : "ゴール";
    stopSelection();
    rebuildGraph();
    showToast(`${selectedType}を最寄りの道路地点に設定しました。`);
  }

  async function restoreDefaults() {
    stopSelection();
    closePlaceSearch(true);
    try {
      let raw = state.defaultRawData;
      if (!raw) {
        const response = await fetch(CONFIG.defaultRoadDataUrl || "./data/kagoshima_central_walking_roads.json");
        if (!response.ok) throw new Error(`初期道路データを取得できませんでした（${response.status}）`);
        raw = await response.json();
        state.defaultRawData = raw;
      }
      await loadRoadArea({ ...Core.DEFAULT_START }, { ...Core.DEFAULT_GOAL }, raw);
    } catch (error) {
      if (!state.networkLoading) showToast(error.message || "初期ルートに戻せませんでした。");
    }
  }

  function swapLocations() {
    stopSelection();
    closePlaceSearch(true);
    [state.startId, state.goalId] = [state.goalId, state.startId];
    [state.startLabel, state.goalLabel] = [state.goalLabel, state.startLabel];
    [state.startPlace, state.goalPlace] = [state.goalPlace, state.startPlace];
    state.draftStartPlace = { ...state.startPlace };
    state.draftGoalPlace = { ...state.goalPlace };
    rebuildGraph();
  }

  function cancelSelectionAndRestore() {
    stopSelection();
    if (state.searchPreview) {
      restoreSearchPreview();
      resetDraftPlaces();
    }
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    state.toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2800);
  }

  function bindEvents() {
    elements.algorithmButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.algorithm = button.dataset.algorithm;
        clearAnimation();
      });
    });
    elements.pickStart.addEventListener("click", () => {
      if (state.placeSearchMode === "start") closePlaceSearch(true);
      else openPlaceSearch("start");
    });
    elements.pickGoal.addEventListener("click", () => {
      if (state.placeSearchMode === "goal") closePlaceSearch(true);
      else openPlaceSearch("goal");
    });
    elements.placeSearchForm.addEventListener("submit", submitPlaceSearch);
    elements.nearbyCategoryButtons.forEach((button) => {
      button.addEventListener("click", () => {
        void showNearbyCategory(button.dataset.nearbyCategory);
      });
    });
    elements.closePlaceSearch.addEventListener("click", () => closePlaceSearch(true));
    elements.pickFromCurrentMap.addEventListener("click", () => {
      const mode = state.placeSearchMode;
      closePlaceSearch(!state.searchPreview);
      if (mode) startSelection(mode);
    });
    elements.cancelSelection.addEventListener("click", cancelSelectionAndRestore);
    elements.canvas.addEventListener("pointerdown", chooseNodeFromMap);
    elements.swapLocations.addEventListener("click", swapLocations);
    elements.restoreDefaults.addEventListener("click", restoreDefaults);
    elements.primaryAction.addEventListener("click", () => {
      if (state.phase === "search" || state.phase === "route") togglePause();
      else startSearch();
    });
    elements.stopAction.addEventListener("click", stopSearch);
    elements.downloadGif.addEventListener("click", () => {
      void downloadResultGif();
    });
    elements.canvas.addEventListener("keydown", (event) => {
      if (event.key === "Escape") cancelSelectionAndRestore();
    });

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(elements.canvas);
  }

  async function loadRoadData() {
    bindEvents();
    resizeCanvas();
    try {
      const response = await fetch(CONFIG.defaultRoadDataUrl || "./data/kagoshima_central_walking_roads.json");
      if (!response.ok) throw new Error(`道路データの取得に失敗しました（${response.status}）`);
      const raw = await response.json();
      state.defaultRawData = raw;
      await loadRoadArea({ ...Core.DEFAULT_START }, { ...Core.DEFAULT_GOAL }, raw);
    } catch (error) {
      console.error(error);
      state.networkLoading = false;
      elements.loadingPanel.innerHTML = "";
      const title = document.createElement("strong");
      title.textContent = "道路データを読み込めませんでした";
      const detail = document.createElement("span");
      detail.textContent = location.protocol === "file:"
        ? "READMEの手順どおり、ローカルサーバーから開いてください。"
        : "ページを再読み込みして、もう一度お試しください。";
      elements.loadingPanel.append(title, detail);
      elements.phaseLabel.textContent = "読込エラー";
      elements.phaseDetail.textContent = "道路データを確認してください";
    }
  }

  loadRoadData();
})();
