window.ROUTE_LAB_CONFIG = Object.freeze({
  geocoderEndpoint: "https://nominatim.openstreetmap.org/search",
  overpassEndpoints: [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ],
  searchCountryCode: "jp",
  maximumRouteDistanceM: 6000,
  minimumRouteDistanceM: 80,
  roadAreaPaddingM: 900,
  defaultRoadDataUrl: "./data/kagoshima_central_walking_roads.json",
});
