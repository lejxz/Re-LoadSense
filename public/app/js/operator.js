  function renderForecast() {
    const routeIds = new Set((state.routes || []).map(route => route.route));
    const allRows = (state.demand.forecast || []).filter(row => !routeIds.size || routeIds.has(row.route));
    const rows = allRows.slice(0, 24);
    const max = Math.max(1, ...rows.map(row => row.expected_load || 0));
    const routeStats = forecastRouteStats(allRows);
    const pressure = routeStats.slice(0, 6);
    const summary = qs("forecastSummary");
    if (summary) {
      summary.innerHTML = pressure.length
        ? pressure.map(item => `
            <article class="forecast-card ${item.level}">
              <span>${escapeHtml(item.route)}</span>
              <strong>${item.peakLoad.toFixed(1)}</strong>
              <p>${escapeHtml(item.routeName)} - peak ${escapeHtml(item.peakTime)} - ${escapeHtml(item.levelLabel)}</p>
            </article>
          `).join("")
        : `<p class="empty-copy">No demand summary available.</p>`;
    }
    const advice = qs("dispatchAdvice");
    if (advice) {
      const actions = buildDispatchAdvice(pressure);
      advice.innerHTML = actions.length
        ? actions.map(item => `
            <article class="dispatch-card ${item.level}">
              <div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.detail)}</p>
              </div>
              <button class="mini-action" data-demand-route="${escapeHtml(item.route)}" type="button">Show fleet</button>
            </article>
          `).join("")
        : `<p class="empty-copy">Forecast is calm. Keep normal headways and monitor live load.</p>`;
      advice.querySelectorAll("[data-demand-route]").forEach(button => {
        button.addEventListener("click", () => {
          state.operatorRouteFilter = button.dataset.demandRoute;
          activateOperatorTab("opsFleet");
          renderOperator();
        });
      });
    }
    const forecastBars = qs("forecastBars");
    forecastBars.innerHTML = rows.length
      ? rows.map(row => `
          <span class="forecast-bar ${forecastLevel(row.expected_load).level}" title="${escapeHtml(row.route)} ${row.expected_load}" data-bar-height="${Math.max(8, (row.expected_load / max) * 100)}">
            <b>${escapeHtml(row.route)}</b>
          </span>
        `).join("")
      : `<p class="empty-copy">No forecast artifact found.</p>`;
    forecastBars.querySelectorAll("[data-bar-height]").forEach(bar => {
      bar.style.height = `${bar.dataset.barHeight}%`;
    });
    qs("forecastMeta").textContent = rows.length
      ? `${state.demand.model || "forecast"} - generated ${state.demand.generated_at || "from checked-in artifact"}`
      : "";
  }

  function forecastRouteStats(rows) {
    const grouped = rows.reduce((accumulator, row) => {
      const route = row.route || "unknown";
      if (!accumulator[route]) accumulator[route] = [];
      accumulator[route].push(row);
      return accumulator;
    }, {});
    return Object.entries(grouped).map(([route, items]) => {
      const peak = items.reduce((best, row) => Number(row.expected_load || 0) > Number(best.expected_load || 0) ? row : best, items[0]);
      const average = items.reduce((sum, row) => sum + Number(row.expected_load || 0), 0) / Math.max(1, items.length);
      const liveVehicles = state.vehicles.filter(vehicle => vehicle.route === route);
      const liveSeats = liveVehicles.reduce((sum, vehicle) => sum + Math.max(0, Number(vehicle.capacity || 0) - Number(vehicle.occupancy || 0)), 0);
      const level = forecastLevel(Number(peak.expected_load || 0));
      return {
        route,
        routeName: routeName(route),
        peakLoad: Number(peak.expected_load || 0),
        averageLoad: average,
        peakTime: formatHour(peak.timestamp),
        liveVehicles: liveVehicles.length,
        liveSeats,
        level: level.level,
        levelLabel: level.label,
      };
    }).sort((left, right) => right.peakLoad - left.peakLoad);
  }

  function forecastLevel(load) {
    if (load >= 11) return { level: "critical", label: "add capacity" };
    if (load >= 9.5) return { level: "watch", label: "watch headway" };
    return { level: "normal", label: "normal service" };
  }

  function buildDispatchAdvice(stats) {
    return stats
      .filter(item => item.level !== "normal" || item.liveSeats < 8)
      .slice(0, 4)
      .map(item => {
        const scarceSeats = item.liveVehicles ? item.liveSeats < 8 : true;
        const title = item.level === "critical"
          ? `Stage spare PUVs for Route ${item.route}`
          : `Monitor Route ${item.route}`;
        const detail = scarceSeats
          ? `${item.routeName}: forecast peaks at ${item.peakLoad.toFixed(1)} around ${item.peakTime}, with only ${item.liveSeats} visible spare seats now.`
          : `${item.routeName}: forecast peaks at ${item.peakLoad.toFixed(1)} around ${item.peakTime}; keep dispatch spacing tight.`;
        return { route: item.route, level: item.level, title, detail };
      });
  }

  function formatHour(timestamp) {
    if (!timestamp) return "--";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function renderOperator() {
    qs("opVehicleCount").textContent = state.summary.vehicle_count ?? 0;
    qs("opAlertCount").textContent = state.summary.active_alerts ?? 0;
    qs("opAvgLoad").textContent = state.summary.average_occupancy ?? 0;
    qs("opOverloaded").textContent = state.summary.overloaded ?? 0;
    renderOperatorFilters();

    const activeTab = state.activeOperatorTab || "opsOverview";

    if (activeTab === "opsOverview") {
      drawMap("operatorMap");
    }

    if (activeTab === "opsFleet") {
      const filteredVehicles = filteredOperatorVehicles();
      qs("operatorFleet").innerHTML = filteredVehicles.length
        ? filteredVehicles.map(vehicle => `
            <article>
              <div>
                <h3>${escapeHtml(vehicle.vehicle_id)}</h3>
                <p>Route ${escapeHtml(vehicle.route)} - ${escapeHtml(routeName(vehicle.route))}</p>
                <p style="font-size: 11px; color: var(--muted); margin: 2px 0 0;">${escapeHtml((vehicle.vehicle_type || "PUV").replace(/_/g, " "))} • ${escapeHtml(vehicle.direction || "forward")}</p>
              </div>
              <span>${vehicle.eta_minutes} min</span>
              <span>${vehicle.occupancy}/${vehicle.capacity}</span>
              <span class="occupancy-pill ${tierClass(vehicle.tier)}">${tierLabel(vehicle.tier)}</span>
              <span>${vehicle.route_deviation?.anomaly ? "Verify route" : "On route"}</span>
              <div class="fleet-actions">
                <button class="mini-action" data-zoom-vehicle="${escapeHtml(vehicle.vehicle_id)}">Zoom</button>
                <button class="mini-action" data-alert-vehicle="${escapeHtml(vehicle.vehicle_id)}" data-alert-route="${escapeHtml(vehicle.route)}">Flag</button>
                <button class="mini-action outline" data-edit-vehicle="${escapeHtml(vehicle.vehicle_id)}">Edit</button>
                <button class="mini-action danger" data-delete-vehicle="${escapeHtml(vehicle.vehicle_id)}">Delete</button>
              </div>
            </article>
          `).join("")
        : `<p class="empty-copy">No vehicles match the current filters.</p>`;
      qs("operatorFleet").querySelectorAll("[data-zoom-vehicle]").forEach(button => {
        button.addEventListener("click", () => zoomVehicle(button.dataset.zoomVehicle));
      });
      qs("operatorFleet").querySelectorAll("[data-alert-vehicle]").forEach(button => {
        button.addEventListener("click", () => createAlert(button.dataset.alertVehicle, button.dataset.alertRoute));
      });
      qs("operatorFleet").querySelectorAll("[data-edit-vehicle]").forEach(button => {
        button.addEventListener("click", () => editVehicle(button.dataset.editVehicle));
      });
      qs("operatorFleet").querySelectorAll("[data-delete-vehicle]").forEach(button => {
        button.addEventListener("click", () => deleteVehicle(button.dataset.deleteVehicle));
      });
    }

    if (activeTab === "opsRoutes") {
      renderRoutesAdmin();
    }

    if (activeTab === "opsDemand") {
      renderForecast();
    }

    if (activeTab === "opsAlerts") {
      qs("operatorAlerts").innerHTML = state.alerts.length
        ? state.alerts.map(renderAlertCard).join("")
        : `<p class="empty-copy">No active operator alerts.</p>`;
      bindAlertActions(qs("operatorAlerts"));
    }

    if (activeTab === "opsData") {
      renderDatabaseStatus();
      renderIncidentLog();
    }
  }

  function renderAlertCard(alert) {
    const status = alert.verification_status || (alert.acknowledged ? "verified" : "open");
    const statusLabel = status.replace("_", " ");
    return `
      <article class="alert-card ${escapeHtml(alert.severity)} ${escapeHtml(status)}">
        <div>
          <div class="alert-title-row">
            <h3>${escapeHtml(alert.severity).toUpperCase()} - ${escapeHtml(alert.vehicle_id)}</h3>
            <span class="verification-pill ${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>
          </div>
          <p>${escapeHtml(alert.message)}</p>
          <small>Route ${escapeHtml(alert.route)} - ${new Date(alert.timestamp).toLocaleTimeString()}</small>
          <textarea class="verification-note" data-note-for="${escapeHtml(alert.id)}" rows="2" placeholder="Verification note"></textarea>
        </div>
        <div class="verification-actions">
          <button class="mini-action" data-alert-action="verified" data-alert="${escapeHtml(alert.id)}">Confirm</button>
          <button class="mini-action" data-alert-action="false_alarm" data-alert="${escapeHtml(alert.id)}">False alarm</button>
          <button class="mini-action danger" data-alert-action="escalated" data-alert="${escapeHtml(alert.id)}">Escalate</button>
          <button class="mini-action" data-zoom-vehicle="${escapeHtml(alert.vehicle_id)}">Map</button>
        </div>
      </article>
    `;
  }

  function bindAlertActions(scope) {
    if (!scope) return;
    scope.querySelectorAll("[data-alert-action]").forEach(button => {
      button.addEventListener("click", async () => {
        const alertId = button.dataset.alert;
        const note = scope.querySelector(`[data-note-for="${alertId}"]`)?.value.trim() || "";
        await verifyAlert(alertId, button.dataset.alertAction, note);
      });
    });
    scope.querySelectorAll("[data-zoom-vehicle]").forEach(button => {
      button.addEventListener("click", () => zoomVehicle(button.dataset.zoomVehicle));
    });
  }

  async function verifyAlert(alertId, action, note) {
    await getJson(`/alerts/${alertId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    await refreshData({ includeAuxiliary: false });
    renderOperator();
  }

  function renderOperatorFilters() {
    const countryOptions = [{ value: "all", label: "All countries" }, ...state.countries.map(country => ({ value: country.code, label: country.name }))];
    renderSearchableSelect("operatorCountrySelect", countryOptions, state.countryFilter || "all", async value => {
      state.countryFilter = value || "all";
      await refreshData({ includeAuxiliary: false });
      renderOperator();
      refreshAuxiliaryData().then(() => renderOperator()).catch(() => {});
    }, { placeholder: "Country", label: "Country" });
    const routeFilter = qs("fleetRouteFilter");
    if (routeFilter) {
      const filteredRoutes = state.routes.filter(r => !state.countryFilter || state.countryFilter === "all" || (r.country && r.country.toLowerCase() === state.countryFilter.toLowerCase()));
      const routes = ["all", ...new Set(filteredRoutes.map(route => route.route))];
      routeFilter.innerHTML = routes.map(route => `<option value="${escapeHtml(route)}">${escapeHtml(route === "all" ? "All routes" : route)}</option>`).join("");
      if (!routes.includes(state.operatorRouteFilter)) state.operatorRouteFilter = "all";
      routeFilter.value = state.operatorRouteFilter;
    }
    const tierFilter = qs("fleetTierFilter");
    if (tierFilter) tierFilter.value = state.operatorTierFilter;
    const search = qs("fleetSearch");
    if (search && document.activeElement !== search) search.value = state.operatorFleetQuery;
  }

  function filteredOperatorVehicles() {
    const query = state.operatorFleetQuery.toLowerCase();
    return state.vehicles.filter(vehicle => {
      const route = state.routes.find(r => r.route === vehicle.route);
      const haystack = `${vehicle.vehicle_id} ${vehicle.route} ${route?.name || ""} ${route?.region || ""} ${vehicle.status || ""}`.toLowerCase();
      return (!query || haystack.includes(query))
        && (!state.countryFilter || state.countryFilter === "all" || vehicle.country === state.countryFilter)
        && (state.operatorRouteFilter === "all" || vehicle.route === state.operatorRouteFilter)
        && (state.operatorTierFilter === "all" || vehicle.tier === state.operatorTierFilter);
    });
  }

  function renderRouteDirectory() {
    const query = state.routeQuery.toLowerCase();
    const cityFilter = state.cityFilter || "all";
    const matched = state.routes
      .filter(route => cityFilter === "all" || regionName(route) === cityFilter)
      .filter(route => {
        const haystack = `${route.route} ${route.name} ${route.region || ""} ${route.zone || ""} ${(route.landmarks || []).join(" ")}`.toLowerCase();
        return !query || haystack.includes(query);
      })
      .map(route => ({
        ...route,
        summary: routeSummary(route),
      }))
      .sort((left, right) => {
        const leftDistance = routeDistanceMeters(left, state.lastPosition);
        const rightDistance = routeDistanceMeters(right, state.lastPosition);
        if (groupBy === "route") {
          return `${left.route}`.localeCompare(`${right.route}`);
        }
        if (groupBy === "city") {
          return `${left.region || ""} ${left.route}`.localeCompare(`${right.region || ""} ${right.route}`);
        }
      });
    const container = qs("routeList");
    if (!container) return;
    if (!matched.length) {
      container.innerHTML = `<p class="empty-copy">No route matched that search.</p>`;
      return;
    }
    const grouped = matched.reduce((accumulator, route) => {
      const city = regionName(route);
      if (!accumulator[city]) accumulator[city] = [];
      accumulator[city].push(route);
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
            const cleanStr = str => {
              let s = String(str);
              if (route.name) s = s.replace(new RegExp(route.name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&'), "gi"), "");
              if (route.route) s = s.replace(new RegExp(route.route.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&'), "gi"), "");
              s = s.trim();
              if (s.startsWith(':') || s.startsWith('-')) s = s.substring(1).trim();
              if (s.endsWith(':') || s.endsWith('-')) s = s.substring(0, s.length - 1).trim();
              return s || str;
            };
            const namedStops = routeStopPoints(route).filter(s => s.name).map(s => cleanStr(s.name));
            let stopsHtml = '';
            if (namedStops.length > 0) {
              stopsHtml = `<ul class="route-stops-list" style="margin: 4px 0 8px 0; padding-left: 20px; font-size: 13px; color: var(--text-muted); display: grid; gap: 4px;">
                ${namedStops.map(n => `<li>${escapeHtml(n)}</li>`).join("")}
              </ul>`;
            } else {
              const cleanEndpoints = (summary.endpoints || []).map(cleanStr);
              const cleanLandmarks = (summary.landmarks || []).map(cleanStr);
              stopsHtml = `<p class="route-landmarks" style="font-size: 13px; margin-bottom: 4px;">${escapeHtml(cleanEndpoints.join(" • "))}</p>
                           <p class="route-landmarks muted" style="font-size: 13px; color: var(--text-muted);">${escapeHtml(cleanLandmarks.join(" • "))}</p>`;
            }
            return `
              <div class="route-card clean-route-card${selected}">
                <div class="route-card-head">
                  <div>
                    <h3>${escapeHtml(route.route)} ${escapeHtml((route.name || "").replace(/\s*-\s*/g, ' → '))}</h3>
                    <p>${escapeHtml(route.zone || route.region || "")} - ${summary.stopCount} stops - ${summary.vehicleCount} live PUVs</p>
                  </div>
                  <span class="route-distance">${summary.distanceKm ? `~${summary.distanceKm} km away` : "Near me"}</span>
                </div>
                <div class="route-card-body" style="margin-top: 12px; display: none; gap: 8px;">
                  ${stopsHtml}
                  <div class="route-actions" style="margin-top: 8px;">
                    <button class="mini-action" data-use-and-preview-route="${escapeHtml(route.route)}" type="button">Use route &amp; show in map</button>
                  </div>
                </div>
                <div style="margin-top: 8px;">
                  <button class="mini-action outline" data-toggle-route="${escapeHtml(route.route)}" type="button" style="width: 100%;">Show route details</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `).join("");
    container.querySelectorAll("[data-use-and-preview-route]").forEach(button => {
      button.addEventListener("click", () => {
        const routeId = button.dataset.useAndPreviewRoute;
        state.selectedRoute = routeId;
        state.tripSuggestions = [];
        renderMobile();
        activateMobileTab("mapTab");
        previewRoute(routeId, "mobileMap");
      });
    });
    container.querySelectorAll("[data-toggle-route]").forEach(button => {
      button.addEventListener("click", () => {
        const body = button.closest('.route-card').querySelector('.route-card-body');
        if (body.style.display === 'none') {
          body.style.display = 'grid';
          button.textContent = 'Hide route details';
        } else {
          body.style.display = 'none';
          button.textContent = 'Show route details';
        }
      });
    });
  }

  function setupVehicleModal() {
    const addBtn = qs("addVehicleBtn");
    const modal = qs("vehicleModal");
    const closeBtn = qs("closeVehicleModal");
    const form = qs("vehicleForm");

    if (addBtn) {
      addBtn.addEventListener("click", () => {
        form.reset();
        qs("vehicleModalTitle").textContent = "Add Vehicle";
        qs("vehId").readOnly = false;
        populateVehicleRegions();
        populateVehicleRoutes();
        syncVehicleTypeWithRoute();
        modal.classList.remove("hidden");
      });
    }

    const vehRegion = qs("vehRegion");
    if (vehRegion) {
      vehRegion.addEventListener("change", () => {
        populateVehicleRoutes(vehRegion.value);
        syncVehicleTypeWithRoute();
      });
    }
    qs("vehRoute")?.addEventListener("change", () => syncVehicleTypeWithRoute());

    if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.add("hidden"));

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const vid = qs("vehId").value.trim();
        const payload = {
          vehicle_id: vid,
          country: selectedCountryCode(),
          route: qs("vehRoute").value.trim(),
          driver: qs("vehDriver").value.trim(),
          max_occupancy: parseInt(qs("vehMaxOccupancy").value, 10),
          brand: qs("vehBrand").value.trim(),
          model: qs("vehModel").value.trim(),
          plate_number: vid,
          vehicle_type: selectedVehicleRoute()?.route_type || selectedVehicleRoute()?.type || qs("vehType").value,
          year: qs("vehYear").value ? parseInt(qs("vehYear").value, 10) : null,
          registration_number: qs("vehRegistration").value.trim(),
          status: "active"
        };
        const method = qs("vehId").readOnly ? "PUT" : "POST";
        const url = api + (method === "PUT" ? `/vehicles/${encodeURIComponent(vid)}` : "/vehicles");
        
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
          showToast(await res.text());
          return;
        }
        await refreshData({ includeAuxiliary: false });
        renderOperator();
        modal.classList.add("hidden");
        if (typeof showToast === "function") showToast("Vehicle saved.");
      });
    }
  }

  function editVehicle(vehicleId) {
    const v = state.vehicles.find(x => x.vehicle_id === vehicleId);
    if (!v) return;
    qs("vehId").value = v.vehicle_id;
    qs("vehId").readOnly = true;
    
    const routeSelect = qs("vehRoute");
    populateVehicleRegions();
    if (v.route) {
      const routeObj = state.routes.find(r => r.route === v.route);
      if (routeObj && routeObj.region) {
        qs("vehRegion").value = routeObj.region;
        populateVehicleRoutes(routeObj.region);
      } else {
        populateVehicleRoutes();
      }
    } else {
      populateVehicleRoutes();
    }
    routeSelect.value = v.route;
    syncVehicleTypeWithRoute();
    
    qs("vehDriver").value = v.driver || "";
    qs("vehMaxOccupancy").value = v.max_occupancy || v.capacity || 20;
    qs("vehBrand").value = v.brand || "";
    qs("vehModel").value = v.model || "";
    qs("vehType").value = v.vehicle_type || "Jeepney";
    qs("vehYear").value = v.year || "";
    qs("vehRegistration").value = v.registration_number || "";
    
    qs("vehicleModalTitle").textContent = "Edit Vehicle";
    qs("vehicleModal").classList.remove("hidden");
  }

  async function deleteVehicle(vehicleId) {
    const confirmed = await confirmAction({
      title: "Delete vehicle",
      message: `Delete vehicle ${vehicleId}?`,
      confirmText: "Delete",
      danger: true,
    });
    if (!confirmed) return;
    const res = await fetch(api + `/vehicles/${encodeURIComponent(vehicleId)}`, { method: "DELETE" });
    if (!res.ok) {
      showToast(await res.text());
      return;
    }
    await refreshData({ includeAuxiliary: false });
    renderOperator();
    if (typeof showToast === "function") showToast("Vehicle deleted.");
  }

  function populateVehicleRegions() {
    const regionSelect = qs("vehRegion");
    if (!regionSelect) return;
    const country = selectedCountryCode();
    const countryNames = new Set((state.countries || []).flatMap(country => [country.code, country.name]).map(value => String(value).toLowerCase()));
    const routes = state.routes.filter(route => route.country === country);
    const regions = ["", ...new Set(routes
      .map(route => route.region || route.zone || route.city || "")
      .map(region => String(region).trim())
      .filter(region => region && !countryNames.has(region.toLowerCase()))
    )].sort();
    regionSelect.innerHTML = regions.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r || "Any Region")}</option>`).join("");
  }

  function populateVehicleRoutes(region = "") {
    const routeSelect = qs("vehRoute");
    if (!routeSelect) return;
    const country = selectedCountryCode();
    const routes = state.routes
      .filter(route => route.country === country)
      .filter(route => {
        const routeRegion = route.region || route.zone || route.city || "";
        return !region || routeRegion === region;
      })
      .sort((a, b) => routeDisplayTitle(a).localeCompare(routeDisplayTitle(b)));
    routeSelect.innerHTML = routes.map(r => `<option value="${escapeHtml(r.route)}">${escapeHtml(routeDisplayTitle(r))}</option>`).join("");
    syncVehicleTypeWithRoute();
  }

  function selectedVehicleRoute() {
    const routeId = qs("vehRoute")?.value || "";
    const country = selectedCountryCode();
    return state.routes.find(route => route.route === routeId && route.country === country)
      || state.routes.find(route => route.route === routeId);
  }

  function populateVehicleTypes() {
    const typeSelect = qs("vehType");
    if (!typeSelect) return;
    const types = [...new Set(state.routes.map(r => r.route_type || r.type).filter(Boolean))];
    if (!types.length) types.push("Jeepney", "Bus", "Minibus", "Van", "Other");
    const currentValue = typeSelect.value;
    typeSelect.innerHTML = types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    if (types.includes(currentValue)) typeSelect.value = currentValue;
  }

  function syncVehicleTypeWithRoute() {
    if (qs("vehType") && qs("vehType").options.length === 0) populateVehicleTypes();
    const route = selectedVehicleRoute();
    const type = route?.route_type || route?.type || "";
    const typeSelect = qs("vehType");
    if (!typeSelect || !type) return;
    if (![...typeSelect.options].some(option => option.value === type)) {
      typeSelect.add(new Option(type, type));
    }
    typeSelect.value = type;
  }

  function selectedCountryCode() {
    return state.countryFilter && state.countryFilter !== "all" ? state.countryFilter : "PH";
  }

  window.editVehicle = editVehicle;
  window.deleteVehicle = deleteVehicle;
  window.setupVehicleModal = setupVehicleModal;
