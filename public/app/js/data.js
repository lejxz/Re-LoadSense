  async function refreshData(options = {}) {
    const includeAuxiliary = options.includeAuxiliary !== false;
    const activeRoutesOnly = options.activeRoutesOnly !== false;
    const countryParam = state.countryFilter && state.countryFilter !== "all"
      ? `country=${encodeURIComponent(state.countryFilter)}`
      : "";
    const fleetUrl = state.countryFilter && state.countryFilter !== "all"
      ? `/fleet?country=${encodeURIComponent(state.countryFilter)}`
      : "/fleet";
    const routeParams = new URLSearchParams();
    if (countryParam) routeParams.set("country", state.countryFilter);
    if (activeRoutesOnly) routeParams.set("active_only", "true");
    const routesUrl = `/routes${routeParams.toString() ? `?${routeParams.toString()}` : ""}`;
    const locationsUrl = countryParam ? `/locations?${countryParam}` : "/locations";
    const [fleet, routes, alerts, locations] = await Promise.all([
      getJson(fleetUrl),
      getJson(routesUrl),
      getJson(countryParam ? `/alerts?limit=50&${countryParam}` : "/alerts?limit=50"),
      getJson(locationsUrl),
    ]);
    const newVehicles = fleet.vehicles || [];
    const newRoutes = routes.routes || [];
    const newAlerts = alerts.alerts || [];
    const newLocations = locations.locations || [];

    const changed = hasDataChanged(state.vehicles, newVehicles)
      || hasDataChanged(state.routes, newRoutes)
      || hasDataChanged(state.alerts, newAlerts);

    state.vehicles = newVehicles;
    state.summary = fleet.summary || {};
    state.routes = newRoutes;
    rebuildRouteNameCache();
    if (state.selectedRoute !== "" && state.routes.length && !state.routes.some(route => route.route === state.selectedRoute)) {
      state.selectedRoute = "";
    }
    state.alerts = newAlerts;
    state.locations = newLocations;
    state.places = buildPlaceOptions();
    state._lastDataChanged = changed;
    if (includeAuxiliary) {
      await refreshAuxiliaryData();
    }
    return state;
  }

  async function refreshAuxiliaryData() {
    const countryParam = state.countryFilter && state.countryFilter !== "all"
      ? `country=${encodeURIComponent(state.countryFilter)}`
      : "";
    const [demand, database, incidents] = await Promise.all([
      getJson(countryParam ? `/demand?${countryParam}` : "/demand"),
      getJson("/database/status"),
      getJson(countryParam ? `/incidents?${countryParam}` : "/incidents"),
    ]);
    state.demand = demand || {};
    state.database = database || {};
    state.incidents = incidents.incidents || [];
    return state;
  }

  function buildPlaceOptions() {
    const seen = new Set();
    const places = [];
    for (const route of state.routes || []) {
      for (const point of [...(route.points || []), ...(route.stops || [])]) {
        const coord = getCoordinate(point);
        const name = normalizeStopLabel(point, point.label || point.name || "");
        if (!coord || !name) continue;
        const key = `${name.toLowerCase()}|${coord.latitude.toFixed(5)}|${coord.longitude.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        places.push({
          name,
          region: route.region || "",
          country: route.country || "PH",
          latitude: coord.latitude,
          longitude: coord.longitude,
          subtitle: `${route.route} - ${route.region || ""}`,
        });
      }
    }
    return places;
  }

  const _routeNameCache = new Map();

  function rebuildRouteNameCache() {
    _routeNameCache.clear();
    for (const route of state.routes) {
      _routeNameCache.set(route.route, (route.name || route.route).replace(/\s*->\s*/g, " - "));
    }
  }

  function routeName(routeId) {
    return _routeNameCache.get(routeId) || routeId;
  }

  function hasDataChanged(oldArr, newArr) {
    if (oldArr.length !== newArr.length) return true;
    if (!oldArr.length) return false;
    const oldFirst = JSON.stringify(oldArr[0]);
    const newFirst = JSON.stringify(newArr[0]);
    if (oldFirst !== newFirst) return true;
    const oldLast = JSON.stringify(oldArr[oldArr.length - 1]);
    const newLast = JSON.stringify(newArr[newArr.length - 1]);
    return oldLast !== newLast;
  }

  function updatePlaceDatalists() {
    const regionFilter = qs("regionFilter") || qs("cityFilter");
    if (regionFilter) {
      const allRoutesForCountry = state.routes ? state.routes.filter(r => !state.countryFilter || state.countryFilter === "all" || (r.country && r.country.toLowerCase() === state.countryFilter.toLowerCase())) : [];
      const regions = ["all", ...new Set(allRoutesForCountry.map(route => regionName(route)).filter(Boolean))];
      if (!regions.includes(state.regionFilter)) state.regionFilter = "all";
      if (regionFilter.id === "cityFilter") state.cityFilter = state.regionFilter;
      
      if (regionFilter.tagName === "DIV") {
        if (typeof window.renderSearchableSelect === "function") {
          window.renderSearchableSelect(
            regionFilter.id,
            regions.map(r => ({ value: r, label: r === "all" ? "All regions" : r })),
            regionFilter.id === "cityFilter" ? state.cityFilter : state.regionFilter,
            (val) => {
              state.regionFilter = val || "all";
              if (regionFilter.id === "cityFilter") state.cityFilter = state.regionFilter;
              if (typeof window.renderMobile === "function") window.renderMobile();
            },
            { placeholder: "All regions", label: "All regions", compact: true }
          );
        }
      } else {
        regionFilter.innerHTML = regions.map(region => `<option value="${escapeHtml(region)}">${escapeHtml(region === "all" ? "All regions" : region)}</option>`).join("");
        regionFilter.value = regionFilter.id === "cityFilter" ? state.cityFilter : state.regionFilter;
      }
    }
  }

  function routeBounds(routes) {
    const points = routes.flatMap(route => route.polyline || []).map(getCoordinate).filter(Boolean);
    if (!points.length) {
      return { minLat: 14.598, maxLat: 14.602, minLon: 120.983, maxLon: 120.988 };
    }
    const lats = points.map(point => point.latitude);
    const lons = points.map(point => point.longitude);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
    };
  }

  function project(point, bounds) {
    const coord = getCoordinate(point);
    if (!coord) return { x: 50, y: 50 };
    const latRange = Math.max(0.0001, bounds.maxLat - bounds.minLat);
    const lonRange = Math.max(0.0001, bounds.maxLon - bounds.minLon);
    return {
      x: 8 + ((coord.longitude - bounds.minLon) / lonRange) * 84,
      y: 88 - ((coord.latitude - bounds.minLat) / latRange) * 76,
    };
  }

// Expose refreshData for socket.js to call on fleet:update
if (typeof window !== 'undefined') { window.refreshData = refreshData; }
