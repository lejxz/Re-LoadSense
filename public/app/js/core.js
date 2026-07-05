const api = `${location.origin}/api`;
  const state = {
    vehicles: [],
    routes: [],
    alerts: [],
    demand: {},
    database: {},
    incidents: [],
    selectedRoute: "",
    maps: {},
    mapLayers: {},
    mapClusters: {},
    mapTileLayers: {},
    mapActiveTile: {},
    geoWatchId: null,
    lastPosition: null,
    selectedOrigin: null,
    selectedDestination: null,
    selectedVehicleId: null,
    routeQuery: "",
    countryFilter: "PH",
    cityFilter: "all",
    regionFilter: "all",
    places: [],
    tripSuggestions: [],
    chatHistory: [],
    tripMatches: [],
    tripMessage: "",
    tripNoRouteFound: false,
    originInput: "Current Location",
    destinationInput: "",
    usingCurrentLocation: false,
    operatorFleetQuery: "",
    operatorRouteFilter: "all",
    operatorTierFilter: "all",
    adminRouteQuery: "",
    placeSearchTimers: {},
    chatContext: { route: "", vehicleId: "" },
    countries: [],
    locations: [],
    userInteracted: false,
  };

  const pinnedCountryCodes = ["BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "TL", "VN"];
  const fallbackCountries = [
    ["PH", "Philippines"], ["ID", "Indonesia"], ["MY", "Malaysia"], ["TH", "Thailand"], ["VN", "Vietnam"],
    ["SG", "Singapore"], ["BN", "Brunei"], ["KH", "Cambodia"], ["LA", "Laos"], ["MM", "Myanmar"], ["TL", "Timor-Leste"],
  ].map(([code, name]) => ({ code, name }));

  const tierCopy = {
    green: "Seats available",
    yellow: "Standing only",
    red: "At capacity",
    blinking_red: "Overloaded",
  };

  function qs(id) {
    return document.getElementById(id);
  }

  async function getJson(path, options) {
    const response = await fetch(api + path, options);
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function tierClass(tier) {
    return ["green", "yellow", "red", "blinking_red"].includes(tier) ? tier : "neutral";
  }

  function tierLabel(tier) {
    return tierCopy[tier] || "No signal";
  }

  function showToast(message) {
    let toast = qs("loadsenseToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "loadsenseToast";
      toast.className = "loadsense-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = String(message || "");
    toast.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function sortCountries(countries) {
    const unique = new Map(countries.filter(c => c.code && c.name).map(c => [c.code, c]));
    return [...unique.values()].sort((a, b) => {
      const ap = pinnedCountryCodes.includes(a.code);
      const bp = pinnedCountryCodes.includes(b.code);
      if (ap !== bp) return ap ? -1 : 1;
      if (ap && bp) return pinnedCountryCodes.indexOf(a.code) - pinnedCountryCodes.indexOf(b.code);
      return a.name.localeCompare(b.name);
    });
  }

  async function loadCountries() {
    if (state.countries.length) return state.countries;
    try {
      const result = await getJson("/countries");
      if (result.countries) {
        state.countries = sortCountries(result.countries);
        return state.countries;
      }
    } catch (e) {
      console.warn("Failed to fetch countries", e);
    }
    state.countries = sortCountries(fallbackCountries);
    return state.countries;
  }
  function normalizeStopLabel(stop, fallback = "") {
    const raw = String(stop?.name || stop?.label || fallback || "").trim();
    if (!raw) return "Unknown stop";
    return raw
      .replace(/\s*\(\s*[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?\s*\)\s*$/, "")
      .replace(/\s*:\s*(Origin|Turn|End of Route|Board\/Alight|Alight or Board Stop).*$/i, "")
      .trim();
  }

  function formatStopCoords(stop) {
    if (!isMapCoordinate(stop)) return "";
    return `${Number(stop.latitude).toFixed(5)}, ${Number(stop.longitude).toFixed(5)}`;
  }

  function routeDistanceMeters(route, origin) {
    const originCoord = getCoordinate(origin);
    if (!originCoord || !isMapCoordinate(originCoord)) return Number.POSITIVE_INFINITY;
    const points = routeStopPoints(route);
    if (!points.length) return Number.POSITIVE_INFINITY;
    return points.reduce((best, point) => {
      const coord = getCoordinate(point);
      if (!coord) return best;
      const distance = haversineMeters(originCoord.latitude, originCoord.longitude, coord.latitude, coord.longitude);
      return Math.min(best, distance);
    }, Number.POSITIVE_INFINITY);
  }

  function sortedRoutesForDisplay(routes) {
    const origin = state.lastPosition;
    return [...routes].sort((left, right) => {
      const leftDistance = routeDistanceMeters(left, origin);
      const rightDistance = routeDistanceMeters(right, origin);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return `${cityName(left)} ${left.route}`.localeCompare(`${cityName(right)} ${right.route}`);
    });
  }

  function routeSummary(route) {
    const points = routeStopPoints(route);
    const vehicles = state.vehicles.filter(vehicle => vehicle.route === route.route);
    const distance = routeDistanceMeters(route, state.lastPosition);
    return {
      stopCount: points.length,
      vehicleCount: vehicles.length,
      distanceKm: Number.isFinite(distance) ? (distance / 1000).toFixed(1) : null,
      endpoints: route.endpoints || (points.length >= 2 ? [points[0].name, points[points.length - 1].name] : []),
      landmarks: (route.landmarks || []).slice(0, 4),
      vehicles,
    };
  }

  function routeDisplayTitle(route) {
    if (!route) return "";
    const tag = route.tag || route.route || "";
    const type = route.route_type || "";
    const origin = route.origin_name || "";
    const destination = route.destination_name || "";
    const routeName = route.name || "";
    if (tag && type && origin && destination) {
      // Vehicle/route display names must remain: TAG - TYPE | ORIGIN → END.
      return `${tag} - ${type} | ${origin} → ${destination}`;
    }
    if (routeName) return `${tag}${tag ? " | " : ""}${routeName}`;
    return `${route.route || ""}`.trim();
  }

  function cityName(route) {
    return String(route?.city || route?.zone || route?.region || "Unknown region").trim() || "Unknown region";
  }

  function regionName(route) {
    return String(route?.region || route?.zone || route?.city || cityName(route)).trim() || "Unknown region";
  }

  function routeStopPoints(route) {
    const points = (route?.points && route.points.length ? route.points : route?.stops && route.stops.length ? route.stops : route?.polyline || [])
      .map((point, index, all) => {
        const coord = getCoordinate(point);
        if (!coord) return null;
        const isObject = point && !Array.isArray(point);
        const pointType = isObject
          ? (point.point_type || (index === 0 ? "origin" : index === all.length - 1 ? "end_of_route" : "waypoint"))
          : (index === 0 ? "origin" : index === all.length - 1 ? "end_of_route" : "waypoint");
        const label = isObject
          ? (point.label || point.name || stopTypeLabel({ point_type: pointType }, index, all.length))
          : stopTypeLabel({ point_type: pointType }, index, all.length);
        return {
          ...coord,
          sequence_order: Number(point?.sequence_order || index + 1),
          point_type: pointType,
          label,
          name: normalizeStopLabel(point, label),
        };
      })
      .filter(Boolean);
    return points.sort((left, right) => Number(left.sequence_order || 0) - Number(right.sequence_order || 0));
  }

  function routePointCoordinateLabel(point, index, total) {
    const coord = getCoordinate(point);
    if (!coord) return "";
    const type = point?.point_type || (index === 0 ? "origin" : index === total - 1 ? "end_of_route" : "waypoint");
    let label = "Point";
    if (type === "origin" || index === 0) label = "Origin";
    else if (type === "end" || type === "end_of_route" || index === total - 1) label = "End";
    else if (type === "alight_or_board_stop" || type === "boarding_stop") label = `Stop ${index}`;
    else label = `Checkpoint ${index}`;
    return `${label}: ${coord.latitude.toFixed(6)}, ${coord.longitude.toFixed(6)}`;
  }

  function stopTypeLabel(point, index, total) {
    const type = point?.point_type || (index === 0 ? "origin" : index === total - 1 ? "end" : "turn");
    if (type === "origin") return "Origin";
    if (type === "alight_or_board_stop") return "Board/Alight";
    if (type === "end" || type === "end_of_route") return "End of route";
    return "Turn";
  }

  function vehicleSort(a, b) {
    const rank = { green: 0, yellow: 1, red: 2, blinking_red: 3 };
    return (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9) || a.eta_minutes - b.eta_minutes;
  }

  function getCoordinate(value) {
    if (!value) return null;
    if (Array.isArray(value)) return { latitude: Number(value[0]), longitude: Number(value[1]) };
    const lat = Number(value.latitude);
    const lon = Number(value.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
    return null;
  }

  function isMapCoordinate(value) {
    const coord = getCoordinate(value);
    if (!coord) return false;
    const { latitude: lat, longitude: lon } = coord;
    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
  }

  function toRad(value) {
    return value * Math.PI / 180;
  }

  function haversineMeters(aLat, aLon, bLat, bLon) {
    const radius = 6371000;
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function routePoint(route, ratio) {
    const points = (route?.polyline || []).filter(isMapCoordinate);
    if (!points.length) return null;
    return points[Math.min(points.length - 1, Math.max(0, Math.floor(points.length * ratio)))];
  }

  function openModal({ title = "", bodyHtml = "", actions = [] } = {}) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>${escapeHtml(title)}</h2>
          <button class="button clear" type="button" data-modal-close>&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${actions.length ? `<div class="modal-actions">${actions.map(action => `<button class="button ${escapeHtml(action.className || "secondary")}" type="button" data-modal-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`).join("")}</div>` : ""}
      </div>
    `;
    const close = () => overlay.remove();
    overlay.querySelector("[data-modal-close]")?.addEventListener("click", close);
    overlay.addEventListener("click", event => {
      if (event.target === overlay) close();
    });
    actions.forEach(action => {
      overlay.querySelector(`[data-modal-action="${CSS.escape(action.id)}"]`)?.addEventListener("click", () => {
        if (typeof action.onClick === "function") action.onClick({ overlay, close });
      });
    });
    document.body.appendChild(overlay);
    return { overlay, close };
  }

  function confirmAction({ title = "Confirm", message = "", inputLabel = "", inputValue = "", confirmText = "Confirm", danger = false } = {}) {
    return new Promise(resolve => {
      const hasInput = Boolean(inputLabel);
      const modal = openModal({
        title,
        bodyHtml: `
          <p>${escapeHtml(message)}</p>
          ${hasInput ? `<label style="display:grid;gap:6px;margin-top:12px;"><span>${escapeHtml(inputLabel)}</span><textarea data-confirm-input rows="3">${escapeHtml(inputValue)}</textarea></label>` : ""}
        `,
        actions: [
          {
            id: "cancel",
            label: "Cancel",
            className: "secondary",
            onClick: ({ close }) => {
              close();
              resolve(false);
            },
          },
          {
            id: "confirm",
            label: confirmText,
            className: danger ? "danger" : "primary",
            onClick: ({ overlay, close }) => {
              const value = hasInput ? overlay.querySelector("[data-confirm-input]")?.value.trim() : true;
              close();
              resolve(value);
            },
          },
        ],
      });
      modal.overlay.querySelector("[data-confirm-input]")?.focus();
    });
  }

  function renderRouteDirectory() {
    const container = qs("routeList");
    if (!container) return;
    const query = (state.routeQuery || "").toLowerCase();
    const cityFilter = state.cityFilter || state.regionFilter || "all";
    const matched = sortedRoutesForDisplay(state.routes || [])
      .filter(route => cityFilter === "all" || regionName(route) === cityFilter)
      .filter(route => {
        const haystack = `${route.route} ${route.name} ${route.region || ""} ${route.zone || ""} ${(route.landmarks || []).join(" ")}`.toLowerCase();
        return !query || haystack.includes(query);
      })
      .map(route => ({ ...route, summary: routeSummary(route) }));
    if (!matched.length) {
      container.innerHTML = `
        <div class="empty-routes-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><path d="M11 8v6"></path><path d="M8 11h6"></path></svg>
          <h4>No routes found</h4>
          <p>Try searching for a different area or route code.</p>
        </div>
      `;
      return;
    }
    const grouped = matched.reduce((accumulator, route) => {
      const region = regionName(route);
      if (!accumulator[region]) accumulator[region] = [];
      accumulator[region].push(route);
      return accumulator;
    }, {});
    container.innerHTML = Object.entries(grouped).map(([groupName, groupRoutes]) => `
      <section class="route-group">
        <div class="route-group-head">
          <h3>${escapeHtml(groupName)}</h3>
          <span>${groupRoutes.length} route${groupRoutes.length === 1 ? "" : "s"}</span>
        </div>
        <div class="route-group-list">
          ${groupRoutes.map(route => {
            const summary = route.summary;
            const selected = route.route === state.selectedRoute ? " selected" : "";
            const stops = routeStopPoints(route).slice(0, 12);
            const tagText = route.tag || route.route.replace(/^PH-/, '');
            let rawTitle = (route.name || routeDisplayTitle(route) || "").replace(/\s*-\s*/g, ' → ');
            if (rawTitle.toLowerCase().startsWith(tagText.toLowerCase())) {
              rawTitle = rawTitle.substring(tagText.length).replace(/^[\s\-→:]+/, '').trim();
            }
            return `
              <div class="route-card-premium${selected}">
                <div class="route-card-main">
                  <div class="route-code-pill" style="text-align: center;">${escapeHtml(tagText)}</div>
                  <div class="route-info-stack">
                    <h3>${escapeHtml(rawTitle)}</h3>
                    <p class="route-meta">
                      <span>${summary.vehicleCount} live PUVs</span>
                      ${summary.distanceKm ? `&bull; ~${summary.distanceKm} km away` : "&bull; Near me"}
                    </p>
                  </div>
                  <button class="route-chevron outline mini-action" data-toggle-route="${escapeHtml(route.route)}" type="button" aria-label="Show details">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </button>
                </div>
                
                <div class="route-card-expanded" style="display: none;">
                  ${stops.length > 1 ? `<ul class="route-stops-timeline" style="margin-bottom: 12px;">
                    <li><span class="stop-dot" style="background: var(--teal); border-color: var(--teal);"></span>${escapeHtml(routePointCoordinateLabel(stops[0], 0, stops.length).replace(/^Origin:\s*/, 'Origin: '))}</li>
                    <li><span class="stop-dot" style="background: var(--destructive, #ef4444); border-color: var(--destructive, #ef4444);"></span>${escapeHtml(routePointCoordinateLabel(stops[stops.length - 1], stops.length - 1, stops.length).replace(/^End:\s*/, 'End: '))}</li>
                  </ul>` : stops.length === 1 ? `<ul class="route-stops-timeline" style="margin-bottom: 12px;">
                    <li><span class="stop-dot" style="background: var(--teal); border-color: var(--teal);"></span>${escapeHtml(routePointCoordinateLabel(stops[0], 0, stops.length))}</li>
                  </ul>` : `<p class="route-landmarks" style="margin-bottom: 12px;">${escapeHtml((summary.endpoints || []).join(" &rarr; "))}</p>`}
                  
                  <div class="route-details-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 12px; border: 1px solid rgba(0,0,0,0.04);">
                    <div><span style="color: var(--muted); display: block; font-size: 11px; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Distance</span><strong style="font-size: 14px; color: #1e293b; display: block; margin-top: 2px;">${route.distance_km ? route.distance_km + ' km' : '--'}</strong></div>
                    <div><span style="color: var(--muted); display: block; font-size: 11px; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Type</span><strong style="font-size: 14px; color: #1e293b; display: block; margin-top: 2px; text-transform: capitalize;">${escapeHtml(route.route_type || '--').replace(/_/g, ' ')}</strong></div>
                    <div><span style="color: var(--muted); display: block; font-size: 11px; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Min. Fare</span><strong style="font-size: 14px; color: #1e293b; display: block; margin-top: 2px;">${route.minimum_fare ? 'PHP ' + Number(route.minimum_fare).toFixed(2) : '--'}</strong></div>
                    <div><span style="color: var(--muted); display: block; font-size: 11px; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Fare/km</span><strong style="font-size: 14px; color: #1e293b; display: block; margin-top: 2px;">${route.fare_per_km ? 'PHP ' + Number(route.fare_per_km).toFixed(2) : '--'}</strong></div>
                  </div>
                  <div class="route-actions-row">
                    <button class="button primary outline full-width-action" data-use-and-preview-route="${escapeHtml(route.route)}" type="button">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
                      Preview on Map
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `).join("");
    container.querySelectorAll("[data-use-and-preview-route]").forEach(button => {
      button.addEventListener("click", () => {
        state.selectedRoute = button.dataset.useAndPreviewRoute;
        state.tripSuggestions = [];
        if (typeof renderMobile === "function") renderMobile();
        if (typeof activateMobileTab === "function") activateMobileTab("mapTab");
        if (typeof previewRoute === "function") previewRoute(state.selectedRoute, "mobileMap");
      });
    });
    container.querySelectorAll("[data-toggle-route]").forEach(button => {
      button.addEventListener("click", () => {
        const card = button.closest(".route-card-premium");
        if (!card) return;
        const body = card.querySelector(".route-card-expanded");
        if (!body) return;
        const visible = body.style.display !== "none";
        body.style.display = visible ? "none" : "block";
        button.style.transform = visible ? "" : "rotate(90deg)";
      });
    });
  }

  function renderSearchableSelect(containerId, options, currentValue, onChangeCallback, config = {}) {
    const container = qs(containerId);
    if (!container) return;

    const { placeholder = "Select...", label = "Select...", compact = false } = config;

    const selectedOption = options.find(o => String(o.value) === String(currentValue));
    let displayLabel = label;
    if (selectedOption) {
      displayLabel = selectedOption.label;
    } else if (currentValue === 'all') {
      displayLabel = 'All countries';
    }

    const html = `
      <div class="dropdown-container ${compact ? 'compact' : ''}">
        <button type="button" class="dropdown-button">
          <span>${escapeHtml(displayLabel)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="dropdown-popup hidden">
          <input type="search" placeholder="Search..." class="dropdown-search" />
          <ul class="dropdown-list"></ul>
        </div>
      </div>
    `;

    container.innerHTML = html;
    container.dataset.value = currentValue;

    const button = container.querySelector(".dropdown-button");
    const popup = container.querySelector(".dropdown-popup");
    const search = container.querySelector(".dropdown-search");
    const list = container.querySelector(".dropdown-list");
    const buttonSpan = button.querySelector("span");

    function renderOptions(query = "") {
      const q = query.toLowerCase();
      const filtered = options.filter(o => o.label.toLowerCase().includes(q));
      
      list.innerHTML = filtered.length 
        ? filtered.map(o => `<li data-value="${escapeHtml(String(o.value))}" class="${String(o.value) === String(currentValue) ? 'selected' : ''}">${escapeHtml(o.label)}</li>`).join("")
        : `<li><span style="color:var(--muted)">No results found</span></li>`;
    }

    renderOptions();

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = popup.classList.contains("hidden");
      document.querySelectorAll(".dropdown-popup").forEach(p => p.classList.add("hidden"));
      if (isHidden) {
        popup.classList.remove("hidden");
        search.value = "";
        renderOptions();
        search.focus();
      }
    });

    search.addEventListener("click", e => e.stopPropagation());
    search.addEventListener("input", (e) => {
      renderOptions(e.target.value);
    });

    list.addEventListener("click", (e) => {
      e.stopPropagation();
      const li = e.target.closest("li");
      if (!li || !li.hasAttribute("data-value")) return;
      
      const value = li.getAttribute("data-value");
      const option = options.find(o => String(o.value) === String(value));
      
      if (option) {
        buttonSpan.textContent = option.label;
        currentValue = value;
        container.dataset.value = value;
        renderOptions(search.value);
      }
      
      popup.classList.add("hidden");
      onChangeCallback(value);
    });
  }

  const selectObservers = new Map();

  function makeSelectSearchable(selectId, config = {}) {
    const select = qs(selectId);
    if (!select || select.tagName !== "SELECT") return;

    function render() {
      const options = Array.from(select.options).map(opt => ({
        value: opt.value,
        label: opt.text
      }));
      renderSearchableSelect(select.dataset.wrapperId, options, select.value, (val) => {
        select.value = val;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, config);
    }

    if (!select.dataset.wrapperId) {
      select.dataset.wrapperId = selectId + "-searchable-wrapper";
      const wrapper = document.createElement("div");
      wrapper.id = select.dataset.wrapperId;
      wrapper.className = "searchable-select-wrapper";
      if (select.className) wrapper.className += " " + select.className;
      select.parentNode.insertBefore(wrapper, select);
      select.style.display = "none";

      const observer = new MutationObserver(() => {
        render();
      });
      observer.observe(select, { childList: true, attributes: true, attributeFilter: ['value'] });
      selectObservers.set(selectId, observer);
      
      const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      if (originalDescriptor && !select._valueHooked) {
         select._valueHooked = true;
         Object.defineProperty(select, 'value', {
            get() { return originalDescriptor.get.call(this); },
            set(val) {
               originalDescriptor.set.call(this, val);
               render();
            }
         });
      }
    }
    render();
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown-container")) {
      document.querySelectorAll(".dropdown-popup").forEach(p => p.classList.add("hidden"));
    }
  });
