
function findNearestRoute(lat, lon) {
    if (!state.routes || !state.routes.length) return null;
    let best = null;
    let bestD = Infinity;
    for (const r of state.routes) {
      const points = (r.polyline || []).map(p => [Number(p.latitude), Number(p.longitude)]);
      for (const [plat, plon] of points) {
        const d = haversineMeters(lat, lon, plat, plon);
        if (d < bestD) { bestD = d; best = r.route; }
      }
    }
    // threshold 600m to auto-select
    return bestD < 600 ? best : null;
  }

  function setupRecenterButtons() {
    const recenter = qs('recenterBtn');
    const opRecenter = qs('opRecenterBtn');
    if (recenter) recenter.addEventListener('click', () => {
      const map = state.maps['mobileMap'];
      if (!map) return;
      if (state.lastPosition) {
        map.setView([state.lastPosition.latitude, state.lastPosition.longitude], 15);
      } else {
        fitRoute('mobileMap', state.selectedRoute);
      }
    });
    if (opRecenter) opRecenter.addEventListener('click', () => {
      const map = state.maps['operatorMap'];
      if (!map) return;
      fitFleet('operatorMap');
    });
  }

  function fitRoute(containerId, routeId) {
    const map = state.maps[containerId];
    const route = state.routes.find(item => item.route === routeId);
    const points = (route?.polyline || []).filter(isMapCoordinate).map(point => [Number(point.latitude), Number(point.longitude)]);
    if (map && points.length) {
      try { map.fitBounds(L.latLngBounds(points), { maxZoom: 15, padding: [28, 28] }); } catch (e) {}
    }
  }

  function fitFleet(containerId) {
    const map = state.maps[containerId];
    const points = state.vehicles.filter(isMapCoordinate).map(vehicle => [Number(vehicle.latitude), Number(vehicle.longitude)]);
    if (map && points.length) {
      try { map.fitBounds(L.latLngBounds(points), { maxZoom: 15, padding: [28, 28] }); } catch (e) {}
    }
  }

  function previewRoute(routeId, containerId = "operatorMap") {
    const route = state.routes.find(item => item.route === routeId);
    if (!route) return;
    state.selectedRoute = routeId;
    const modal = qs("routePreviewModal");
    if (modal && containerId === "routePreviewMap") {
      modal.classList.remove("hidden");
      qs("routePreviewTitle").textContent = routeDisplayTitle(route);
      const summary = routeSummary(route);
      qs("routePreviewMeta").textContent = `${cityName(route)} - ${summary.stopCount} stops - ${summary.vehicleCount} live PUVs`;
    }
    drawMap(containerId, routeId);
    setTimeout(() => {
      fitRoute(containerId, routeId);
      if (containerId === "routePreviewMap" && state.maps[containerId]) {
        state.maps[containerId].invalidateSize();
      }
    }, 120);
  }

  function zoomVehicle(vehicleId) {
    const vehicle = state.vehicles.find(item => item.vehicle_id === vehicleId);
    if (!vehicle || !isMapCoordinate(vehicle)) return;
    state.selectedVehicleId = vehicleId;
    state.selectedRoute = vehicle.route;
    if (state.maps.operatorMap) activateOperatorTab("opsOverview");
    if (state.maps.mobileMap) activateMobileTab("mapTab");
    drawMap(state.maps.operatorMap ? "operatorMap" : "mobileMap", vehicle.route);
    const map = state.maps.operatorMap || state.maps.mobileMap;
    if (map) {
      setTimeout(() => {
        map.setView([Number(vehicle.latitude), Number(vehicle.longitude)], 17);
      }, 100);
    }
  }

  function renderRoutesAdmin() {
    const container = qs('routesTable');
    if (!container) return;
    
    let displayRoutes = state.routes || [];
    if (state.adminRouteQuery) {
      const q = state.adminRouteQuery.toLowerCase();
      displayRoutes = displayRoutes.filter(r => 
        (r.route && r.route.toLowerCase().includes(q)) || 
        (r.name && r.name.toLowerCase().includes(q))
      );
    }
    if (state.countryFilter && state.countryFilter !== "all") {
      const c = state.countryFilter.toLowerCase();
      displayRoutes = displayRoutes.filter(r => r.country && r.country.toLowerCase() === c);
    }
    if (state.adminRegionFilter) {
      const p = state.adminRegionFilter.toLowerCase();
      displayRoutes = displayRoutes.filter(r => r.region && r.region.toLowerCase().includes(p));
    }
    const regionFilter = qs('regionFilter');
    if (regionFilter) {
      const allRoutesForCountry = state.routes ? state.routes.filter(r => !state.countryFilter || state.countryFilter === "all" || (r.country && r.country.toLowerCase() === state.countryFilter.toLowerCase())) : [];
      const uniqueRegions = [...new Set(allRoutesForCountry.map(r => r.region).filter(Boolean))].sort();
      regionFilter.innerHTML = `<option value="">All regions</option>` + uniqueRegions.map(p => `<option value="${escapeHtml(p)}"${state.adminRegionFilter === p ? " selected" : ""}>${escapeHtml(p)}</option>`).join('');
    }

    if (!displayRoutes.length) {
      container.innerHTML = '<p class="empty-copy">No routes found.</p>';
      return;
    }
    container.innerHTML = displayRoutes.map(r => `
      <article class="route-card">
        <div class="route-card-admin-row">
          <div>
            <h3>${escapeHtml(r.route)} ${escapeHtml(r.name.replace(" - ", " → "))}</h3>
            <p>${(r.stops||[]).length} stops</p>
          </div>
          <div>
            <button class="button secondary edit-route" data-route="${escapeHtml(r.route)}">Edit</button>
            <button class="button route-preview-button" data-route-preview="${escapeHtml(r.route)}">Preview</button>
            <button class="button delete-route" data-route="${escapeHtml(r.route)}">Delete</button>
          </div>
        </div>
      </article>
    `).join('');
    document.querySelectorAll('.edit-route').forEach(btn => btn.addEventListener('click', () => editRoute(btn.dataset.route)));
    document.querySelectorAll('[data-route-preview]').forEach(btn => btn.addEventListener('click', e => {
      previewRoute(btn.dataset.routePreview, 'routePreviewMap');
    }));
    document.querySelectorAll('.delete-route').forEach(btn => {
      btn.addEventListener('click', async () => {
        const route = btn.dataset.route;
        const confirmed = await confirmAction({
          title: "Delete route",
          message: `Delete route ${route}?`,
          confirmText: "Delete",
          danger: true,
        });
        if (!confirmed) return;
        const response = await fetch(api + `/routes/${route}`, { method: 'DELETE' });
        if (!response.ok) {
          showToast(await response.text());
          return;
        }
        await refreshData({ includeAuxiliary: false });
        renderOperator();
        qs("routeModal")?.classList.add("hidden");
        if (typeof showToast === "function") showToast("Route deleted.");
      });
    });
  }

  const routeTypeOptions = ["BRT", "Bus", "City Bus", "Ferry", "FX", "Jeepney", "Minibus", "Shuttle", "Train", "UV Express", "Other"];
  const routePointTypes = [
    { value: "alight_or_board_stop", label: "Alight or Board Stop" },
    { value: "end_of_route", label: "End of Route" },
    { value: "origin", label: "Origin" },
    { value: "road_segment", label: "Road Segment" },
    { value: "waypoint", label: "Waypoint" },
  ];

  function setupRouteTypeSelect() {
    const select = qs("routeType");
    if (select && !select.options.length) {
      select.innerHTML = routeTypeOptions.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("");
      select.value = "Jeepney";
    }
    qs("addRoutePoint")?.addEventListener("click", () => addRoutePointRow());
    qs("hintButton")?.addEventListener("click", () => qs("routeHint")?.classList.toggle("is-visible"));
    qs("previewRoute")?.addEventListener("click", () => previewRoutePointRows());
  }

  function parseGeneratedRouteName(route) {
    const name = String(route?.name || "");
    const match = name.match(/^\s*(.*?)\s*-\s*(.*?)\s*\|\s*(.*?)\s*(?:→|â†’|->)\s*(.*?)\s*$/);
    if (!match) return {};
    return {
      tag: match[1]?.trim(),
      route_type: match[2]?.trim(),
      origin_name: match[3]?.trim(),
      destination_name: match[4]?.trim(),
    };
  }

  function normalizeRouteEditPoints(route) {
    const source = route.points && route.points.length ? route.points : route.polyline || [];
    return source.map((point, index, arr) => ({
      sequence_order: Number(point.sequence_order || index + 1),
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      point_type: point.point_type || (index === 0 ? "origin" : index === arr.length - 1 ? "end_of_route" : "waypoint"),
      label: point.label || point.name || "",
    })).filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  }

  function setInputValue(id, value) {
    const element = qs(id);
    if (element) element.value = value ?? "";
  }

  function editRoute(routeId) {
    const route = state.routes.find(item => item.route === routeId);
    if (!route) return;
    const parsed = parseGeneratedRouteName(route);
    const tag = route.tag || parsed.tag || route.route || "";
    const type = route.route_type || route.type || parsed.route_type || "Jeepney";
    setupRouteTypeSelect();
    if (qs("routeType") && ![...qs("routeType").options].some(option => option.value === type)) {
      qs("routeType").add(new Option(type, type));
    }
    setInputValue("routeId", tag);
    setInputValue("routeType", type);
    setInputValue("routeOrigin", route.origin_name || parsed.origin_name || "");
    setInputValue("routeDestination", route.destination_name || parsed.destination_name || "");
    setInputValue("routeRegion", route.region || route.zone || route.city || "");
    setInputValue("routeDistance", route.distance_km ?? "");
    setInputValue("routeMinimumFare", route.minimum_fare ?? "");
    setInputValue("routeFarePerKm", route.fare_per_km ?? "");
    setInputValue("routeDescription", route.description || "");
    setRoutePointRows(normalizeRouteEditPoints(route));
    qs("routeFormErrors")?.classList.add("hidden");
    const modal = qs("routeModal");
    if (modal) {
      qs("routeModalTitle").textContent = "Edit Route";
      modal.classList.remove("hidden");
    }
  }


  function setRoutePointRows(points) {
    const container = qs("routePointsContainer");
    if (!container) return;
    container.innerHTML = "";
    const seed = points.length ? points : [
      { sequence_order: 1, latitude: "", longitude: "", point_type: "origin", label: "Origin" },
      { sequence_order: 2, latitude: "", longitude: "", point_type: "end_of_route", label: "End of Route" },
    ];
    seed.forEach(point => addRoutePointRow(point));
    updateRoutePointSequence();
  }

  function addRoutePointRow(point = {}) {
    const container = qs("routePointsContainer");
    if (!container) return;
    const row = document.createElement("div");
    row.className = "route-point-row";
    row.innerHTML = `
      <span class="point-order route-point-sequence">${escapeHtml(point.sequence_order || container.children.length + 1)}</span>
      <input class="route-point-lat" type="number" step="0.000001" value="${escapeHtml(point.latitude ?? "")}" placeholder="Latitude" />
      <input class="route-point-lon" type="number" step="0.000001" value="${escapeHtml(point.longitude ?? "")}" placeholder="Longitude" />
      <select class="route-point-type">${routePointTypes.map(type => `<option value="${escapeHtml(type.value)}"${(point.point_type || "waypoint") === type.value ? " selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}</select>
      <input class="route-point-label" value="${escapeHtml(point.label || "")}" placeholder="Label" />
      <button class="mini-action danger" type="button" data-remove-point>Delete</button>
    `;
    row.querySelector("[data-remove-point]").addEventListener("click", () => {
      row.remove();
      updateRoutePointSequence();
    });
    container.appendChild(row);
    updateRoutePointSequence();
  }

  function updateRoutePointSequence() {
    qs("routePointsContainer")?.querySelectorAll(".route-point-row").forEach((row, index) => {
      row.querySelector(".route-point-sequence").textContent = index + 1;
    });
  }

  function collectRoutePointRows() {
    return [...(qs("routePointsContainer")?.querySelectorAll(".route-point-row") || [])]
      .map((row, index) => ({
        sequence_order: index + 1,
        latitude: Number(row.querySelector(".route-point-lat").value),
        longitude: Number(row.querySelector(".route-point-lon").value),
        point_type: row.querySelector(".route-point-type").value || "waypoint",
        label: row.querySelector(".route-point-label").value.trim(),
      }))
      .filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  }

  function previewRoutePointRows() {
    const route = qs("routeId").value.trim() || "__preview__";
    const routeType = qs("routeType").value || "Jeepney";
    const originName = qs("routeOrigin").value.trim();
    const destinationName = qs("routeDestination").value.trim();
    const points = collectRoutePointRows();
    if (points.length < 2) {
      showToast("Add at least two valid coordinates to preview.");
      return;
    }
    const existing = state.routes.find(item => item.route === route);
    const preview = {
      route,
      // Auto-generated route/vehicle display names must remain: TAG - TYPE | ORIGIN → END.
      name: `${route} - ${routeType} | ${originName} → ${destinationName}`,
      country: selectedCountryCode(),
      city: qs("routeCity")?.value || "",
      polyline: points.map(point => ({ latitude: point.latitude, longitude: point.longitude })),
      points,
      stops: points,
      route_type: routeType,
      origin_name: originName,
      destination_name: destinationName,
    };
    if (existing) Object.assign(existing, preview);
    else state.routes.push(preview);
    previewRoute(route, "routePreviewMap");
  }

  async function initRoutesAdmin() {
    const save = qs('saveRoute');
    const clear = qs('clearRoute');
    const exportBtn = qs('exportRoutes');
    const importBtn = qs('importRoutesBtn');
    const importArea = qs('importRoutes');
    const routeFile = qs('routeFile');
    const previewRouteFile = qs('previewRouteFile');
    const commitRouteFile = qs('commitRouteFile');
    const routeImportPreview = qs('routeImportPreview');
    setupRouteTypeSelect();
    setRoutePointRows([]);

    qs("addRouteBtn")?.addEventListener("click", () => {
      qs("routeForm")?.reset();
      setRoutePointRows([]);
      const modal = qs("routeModal");
      if (modal) {
        qs("routeModalTitle").textContent = "Add Route";
        modal.classList.remove("hidden");
      }
    });
    qs("closeRouteModal")?.addEventListener("click", () => qs("routeModal")?.classList.add("hidden"));
    qs("closeRoutePreviewModal")?.addEventListener("click", () => qs("routePreviewModal")?.classList.add("hidden"));
    if (save) {
      save.addEventListener('click', async () => {
        const route = qs('routeId').value.trim();
        const routeType = qs('routeType').value.trim();
        const originName = qs('routeOrigin').value.trim();
        const destinationName = qs('routeDestination').value.trim();
        // Auto-generated route/vehicle display names must remain: TAG - TYPE | ORIGIN → END.
        const name = `${route} - ${routeType} | ${originName} → ${destinationName}`;
        const points = collectRoutePointRows();
        if (!route || !routeType || !originName || !destinationName) { showToast('Route tag, type, origin, and destination are required'); return; }
        if (points.length < 2) { showToast('Add at least two coordinates.'); return; }
        const poly = points.map(point => [point.latitude, point.longitude]);
        const replace = state.routes.some(r => r.country === selectedCountryCode() && (r.route === route || r.tag === route));
        const regionVal = qs("routeRegion")?.value.trim() || "";
        const payload = {
          route,
          name,
          polyline: poly,
          country: selectedCountryCode(),
          region: regionVal,
          tag: route,
          route_type: routeType,
          origin_name: originName,
          destination_name: destinationName,
          distance_km: qs('routeDistance').value ? Number(qs('routeDistance').value) : null,
          minimum_fare: qs('routeMinimumFare') && qs('routeMinimumFare').value ? Number(qs('routeMinimumFare').value) : null,
          fare_per_km: qs('routeFarePerKm') && qs('routeFarePerKm').value ? Number(qs('routeFarePerKm').value) : null,
          description: qs('routeDescription').value.trim(),
          points,
        };
        const response = await fetch(api + `/routes?replace=${replace ? 'true' : 'false'}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        if (!response.ok) { showToast(await response.text()); return; }
        qs('routeId').value = '';
        qs("routeForm")?.reset();
        setRoutePointRows([]);
        await refreshData({ includeAuxiliary: false });
        renderOperator();
        qs("routeModal")?.classList.add("hidden");
      });
    }
    if (clear) {
      clear.addEventListener('click', () => {
        qs("routeForm")?.reset();
        setRoutePointRows([]);
      });
    }
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const data = state.routes || [];
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'routes.json'; document.body.appendChild(a); a.click(); a.remove();
      });
    }
    async function importPastedRoutes() {
      try {
        const json = JSON.parse(importArea.value);
        if (!Array.isArray(json)) throw new Error('Expected array');
        for (const r of json) {
          const poly = (r.polyline || []).map(p => Array.isArray(p) ? p : [p.latitude, p.longitude]);
          const response = await fetch(api + '/routes?replace=true', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ route: r.route, name: r.name, polyline: poly }) });
          if (!response.ok) throw new Error(await response.text());
        }
        await refreshData({ includeAuxiliary: false });
        renderOperator();
        showToast(`Imported ${json.length} route${json.length === 1 ? '' : 's'}.`);
      } catch (e) {
        showToast('Invalid JSON: ' + e.message);
      }
    }
    if (importBtn && importArea) {
      importBtn.addEventListener('click', () => {
        const importIsVisible = importArea.classList.contains('is-visible');
        if (importIsVisible && importArea.value.trim()) {
          importPastedRoutes();
          return;
        }
        importArea.classList.toggle('is-visible');
      });
      importArea.addEventListener('change', async () => {
        if (importArea.value.trim()) await importPastedRoutes();
      });
    }
    async function uploadRouteFile(commit) {
      if (!routeFile || !routeFile.files || !routeFile.files[0]) {
        showToast('Choose a GeoJSON, CSV, or GTFS zip file first.');
        return;
      }
      const form = new FormData();
      form.append('file', routeFile.files[0]);
      form.append('commit', commit ? 'true' : 'false');
      form.append('replace', qs('replaceRoutes')?.checked ? 'true' : 'false');
      form.append('simplify_tolerance', '0.00002');
      const response = await fetch(api + '/routes/import', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) {
        routeImportPreview.innerHTML = `<p class="error">${escapeHtml(result.detail || 'Upload failed')}</p>`;
        return;
      }
      routeImportPreview.innerHTML = renderImportResult(result);
      if (commit && result.status === 'committed') {
        await refreshData({ includeAuxiliary: false });
        renderOperator();
      }
    }
    if (previewRouteFile) previewRouteFile.addEventListener('click', () => uploadRouteFile(false));
    if (commitRouteFile) commitRouteFile.addEventListener('click', () => uploadRouteFile(true));
  }

  function renderImportResult(result) {
    const errors = result.errors || [];
    const routes = result.routes || [];
    if (errors.length) {
      return `<p class="error">${errors.map(escapeHtml).join('<br/>')}</p>`;
    }
    return `
      <p>${escapeHtml(result.status)} ${routes.length} route(s) from ${escapeHtml(result.filename || 'upload')}.</p>
      ${routes.slice(0, 5).map(route => `<article><strong>${escapeHtml(route.route)} ${escapeHtml(route.name.replace(" - ", " → "))}</strong><p>${(route.polyline || []).length} points</p></article>`).join('')}
    `;
  }

  function renderDatabaseStatus() {
    const tables = state.database.tables || {};
    const stats = state.database.stats || {};
    const routeLoads = state.database.route_loads || [];
    const vehicleRoutes = state.database.vehicle_routes || [];
    const alertStatuses = state.database.alert_statuses || [];
    const recentChats = state.database.recent_chats || [];
    const maxSamples = Math.max(1, ...routeLoads.map(row => Number(row.samples || 0)));
    qs("databaseStatus").innerHTML = Object.keys(tables).length
      ? `
        <div class="db-summary-row">
          ${[
            ["Telemetry samples", stats.telemetry_samples ?? tables.telemetry_logs ?? 0],
            ["Active route groups", stats.active_vehicle_routes ?? 0],
            ["Chatbot queries", stats.chat_queries ?? tables.chatbot_queries ?? 0],
            ["Open alerts", stats.open_alerts ?? 0],
          ].map(([label, value]) => `
            <article>
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </article>
          `).join("")}
        </div>
        <div class="db-visual-grid">
          <section>
            <h3>Telemetry by route</h3>
            <div class="db-bars">
              ${routeLoads.length ? routeLoads.map(row => `
                <div class="db-bar-row">
                  <span>${escapeHtml(row.route)}</span>
                  <i data-bar-width="${Math.max(8, (Number(row.samples || 0) / maxSamples) * 100)}"></i>
                  <strong>${escapeHtml(row.samples)}</strong>
                </div>
              `).join("") : `<p class="empty-copy">No telemetry samples saved yet.</p>`}
            </div>
          </section>
          <section>
            <h3>Live route load</h3>
            <div class="db-route-table">
              ${vehicleRoutes.length ? vehicleRoutes.map(row => `
                <article>
                  <span>Route ${escapeHtml(row.route)}</span>
                  <strong>${escapeHtml(row.vehicles)} PUVs</strong>
                  <p>Avg load ${escapeHtml(row.average_occupancy ?? 0)} - crowded ${escapeHtml(row.crowded ?? 0)}</p>
                </article>
              `).join("") : `<p class="empty-copy">No live vehicle states yet.</p>`}
            </div>
          </section>
        </div>
        <div class="db-visual-grid">
          <section>
            <h3>Alert status</h3>
            <div class="db-chip-row">
              ${alertStatuses.length ? alertStatuses.map(row => `<span>${escapeHtml(row.verification_status || "open")} <strong>${escapeHtml(row.count)}</strong></span>`).join("") : `<p class="empty-copy">No alert records.</p>`}
            </div>
          </section>
          <section>
            <h3>Recent chatbot queries</h3>
            <div class="db-chat-list">
              ${recentChats.length ? recentChats.map(row => `
                <article>
                  <strong>${escapeHtml(row.query)}</strong>
                  <p>${escapeHtml(row.answer)}</p>
                </article>
              `).join("") : `<p class="empty-copy">No chatbot history yet.</p>`}
            </div>
          </section>
        </div>
        <details class="db-table-counts">
          <summary>Table counts and database path</summary>
          <div class="db-summary-row compact">
            ${Object.entries(tables).map(([name, count]) => `
              <article>
                <span>${escapeHtml(name)}</span>
                <strong>${count}</strong>
              </article>
            `).join("")}
          </div>
          <p class="db-path">${escapeHtml(state.database.path || "")}</p>
        </details>
      `
      : `<p class="empty-copy">Database has not been initialized.</p>`;
    qs("databaseStatus").querySelectorAll("[data-bar-width]").forEach(bar => {
      bar.style.width = `${bar.dataset.barWidth}%`;
    });
  }

  function renderIncidentLog() {
    qs("incidentLog").innerHTML = state.incidents.length
      ? state.incidents.slice(0, 8).map(incident => `
          <article>
            <div>
              <h3>${escapeHtml(incident.vehicle_id)} - ${escapeHtml(incident.severity).toUpperCase()}</h3>
              <p>${escapeHtml(incident.message)}</p>
              ${incident.resolution_note ? `<small>${escapeHtml(incident.resolution_note)}</small>` : ""}
            </div>
            <span>${escapeHtml((incident.verification_status || (incident.acknowledged ? "verified" : "open")).replace("_", " "))}</span>
          </article>
        `).join("")
      : `<p class="empty-copy">No incident history yet.</p>`;
  }

  async function initOperator() {
    await loadCountries();
    await refreshData({ includeAuxiliary: false });
    renderOperator();
    refreshAuxiliaryData().then(() => renderOperator()).catch(() => {});
    await initRoutesAdmin();
    initOperatorTabs();
    qs("refreshOperator").addEventListener("click", async () => {
      await refreshData({ includeAuxiliary: false });
      renderOperator();
      refreshAuxiliaryData().then(() => renderOperator()).catch(() => {});
    });
    const fleetSearch = qs("fleetSearch");
    if (fleetSearch) {
      fleetSearch.addEventListener("input", event => {
        state.operatorFleetQuery = event.target.value.trim();
        renderOperator();
      });
    }
    const routeFilter = qs("fleetRouteFilter");
    if (routeFilter) {
      routeFilter.addEventListener("change", event => {
        state.operatorRouteFilter = event.target.value || "all";
        renderOperator();
      });
    }

    const regionFilter = qs("regionFilter");
    if (regionFilter) {
      regionFilter.addEventListener("change", event => {
        state.adminRegionFilter = event.target.value.trim();
        renderOperator();
      });
    }

    const provinceFilter = qs("provinceFilter");
    if (provinceFilter) {
      provinceFilter.addEventListener("change", event => {
        state.adminProvinceFilter = event.target.value.trim();
        renderOperator();
      });
    }

    const adminRouteSearch = qs("adminRouteSearch");
    if (adminRouteSearch) {
      adminRouteSearch.addEventListener("input", event => {
        state.adminRouteQuery = event.target.value.trim();
        renderOperator();
      });
    }
    const tierFilter = qs("fleetTierFilter");
    if (tierFilter) {
      tierFilter.addEventListener("change", event => {
        state.operatorTierFilter = event.target.value || "all";
        renderOperator();
      });
    }
    qs("resetDatabaseBtn")?.addEventListener("click", async () => {
      const confirmed = await confirmAction({
        title: "Reset demo data",
        message: "Clear vehicles, routes, alerts, telemetry, and chat history?",
        confirmText: "Reset",
        danger: true,
      });
      if (!confirmed) return;
      await getJson("/database/reset", { method: "POST" });
      await refreshData({ includeAuxiliary: false });
      renderOperator();
      refreshAuxiliaryData().then(() => renderOperator()).catch(() => {});
      showToast("Demo data reset.");
    });
    qs("resetAlertsBtn")?.addEventListener("click", async () => {
      const confirmed = await confirmAction({
        title: "Reset Alerts",
        message: "Clear all alert data and reset alert simulation?",
        confirmText: "Reset",
        danger: true,
      });
      if (!confirmed) return;
      await getJson("/alerts/reset", { method: "POST" });
      await refreshData({ includeAuxiliary: false });
      renderOperator();
      showToast("Alerts reset.");
    });
    qs("resetDemandBtn")?.addEventListener("click", async () => {
      const confirmed = await confirmAction({
        title: "Reset Demand Forecasting",
        message: "Clear demand forecast and generate dynamic simulation data?",
        confirmText: "Reset",
        danger: true,
      });
      if (!confirmed) return;
      await getJson("/demand/reset", { method: "POST" });
      await refreshData({ includeAuxiliary: false });
      renderOperator();
      showToast("Demand Forecasting reset.");
    });
    const fleetCountryFilter = qs("fleetCountryFilter");
    if (fleetCountryFilter) {
      fleetCountryFilter.addEventListener("change", async event => {
        state.countryFilter = event.target.value || "all";
        await refreshData({ includeAuxiliary: false });
        renderOperator();
        refreshAuxiliaryData().then(() => renderOperator()).catch(() => {});
      });
    }
    setInterval(async () => {
      await refreshData({ includeAuxiliary: false });
      renderOperator();
    }, 15000);
    if (typeof setupVehicleModal === 'function') setupVehicleModal();
    
    ['regionFilter', 'fleetRouteFilter', 'fleetTierFilter', 'routeType', 'vehType', 'vehRegion', 'vehRoute'].forEach(id => {
      if (typeof window.makeSelectSearchable === 'function') {
        window.makeSelectSearchable(id);
      }
    });
  }

  function initOperatorTabs() {
    document.querySelectorAll(".ops-tabs button").forEach(button => {
      button.addEventListener("click", () => activateOperatorTab(button.dataset.opsTab));
    });
  }

  function activateOperatorTab(tabId) {
    const target = qs(tabId);
    if (!target) return;
    state.activeOperatorTab = tabId;
    document.querySelectorAll(".ops-tabs button").forEach(item => item.classList.toggle("active", item.dataset.opsTab === tabId));
    document.querySelectorAll(".ops-tab-panel").forEach(item => item.classList.toggle("active", item.id === tabId));
    renderOperator();
    setTimeout(() => {
      Object.values(state.maps).forEach(map => {
        try { map.invalidateSize(); } catch (e) {}
      });
    }, 100);
  }
