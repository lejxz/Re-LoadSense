function drawMap(containerId, routeFilter) {
    const el = qs(containerId);
    if (!el) return;
    if (typeof L === 'undefined') return;

    const isMobile = containerId === 'mobileMap';
    const isOperator = containerId === 'operatorMap' || containerId === 'routePreviewMap';
    const isOverviewMap = containerId === "operatorMap" && !routeFilter;
    const isRouteMap = !isOverviewMap && (Boolean(routeFilter) || containerId === "routePreviewMap" || isMobile);

    // initialize map if needed
    if (!state.maps[containerId]) {
      const map = L.map(containerId, { zoomControl: false, attributionControl: false }).setView([10.3157, 123.8854], 13);
      L.control.zoom({ position: containerId === "operatorMap" ? "topright" : "bottomright" }).addTo(map);
      // Tile layer definitions – Transport is the default
      const TILE_LAYERS = {
        'Transport': L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://memomaps.de/">memomaps.de</a> CC-BY-SA, map data &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }),
        'Standard': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }),
        'Cycle': L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
          maxZoom: 20,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }),
        'Light': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 20,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
        }),
      'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' }),
        'Dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 20,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
        })
      };
      const savedTile = (typeof localStorage !== 'undefined' && localStorage.getItem('loadsense_map_tile')) || 'Standard';
      const tileLayer = (TILE_LAYERS[savedTile] || TILE_LAYERS['Standard']).addTo(map);
      tileLayer.on('tileerror', function(e) {
        if (e.tile) e.tile.style.display = 'none';
      });
      state.maps[containerId] = map;
      state.mapTileLayers[containerId] = TILE_LAYERS;
      state.mapActiveTile[containerId] = tileLayer;
      state.mapLayers[containerId] = L.layerGroup().addTo(map);
      addMapControls(containerId, map, TILE_LAYERS, 'Standard');
      // clustering layer
      try {
        state.mapClusters[containerId] = L.markerClusterGroup({
          iconCreateFunction(cluster) {
            const markers = cluster.getAllChildMarkers();
            const overloaded = markers.filter(marker => marker.options.loadsenseTier === "blinking_red").length;
            const label = overloaded ? `${markers.length}/${overloaded}` : String(markers.length);
            return L.divIcon({ html: `<div><span>${label}</span></div>`, className: "marker-cluster marker-cluster-small", iconSize: L.point(40, 40) });
          },
        });
        state.mapClusters[containerId].addTo(map);
      } catch (e) {
        state.mapClusters[containerId] = null;
      }
      // Track user interaction to disable auto-fit
      map.on('movestart', function (e) {
        // Only set userInteracted for moves not triggered programmatically
        if (!map._programmaticMove) {
          state.userInteracted = true;
        }
      });
    }
    const map = state.maps[containerId];
    const layerGroup = state.mapLayers[containerId];
    const clusterGroup = state.mapClusters[containerId];
    // clear route polylines and route-point layers (redrawn each call)
    layerGroup.clearLayers();

    // Initialize incremental vehicle marker tracking
    state.vehicleMarkers = state.vehicleMarkers || {};
    if (!state.vehicleMarkers[containerId]) state.vehicleMarkers[containerId] = {};
    const existingMarkers = state.vehicleMarkers[containerId];

    const routes = isOverviewMap ? [] : routeFilter ? state.routes.filter(route => route.route === routeFilter) : state.routes;
    // draw route polylines
    for (const route of routes) {
      const structuredPoints = [...(route.points || [])].sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0));
      const polyPoints = structuredPoints.length ? structuredPoints : (route.polyline || []);
      const routeStops = structuredPoints.length ? structuredPoints : (route.stops || []);
      // Support both new structured points and legacy [lat, lon] arrays
      const validPoints = polyPoints.filter(p => p && (p.latitude !== undefined || Array.isArray(p)));
      const latlngs = validPoints.map(p => Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p.latitude), Number(p.longitude)]);
      
      if (latlngs.length) {
          const selectedRoute = route.route === state.selectedRoute;
          if (selectedRoute) {
            L.polyline(latlngs, { color: '#ffffff', weight: 12, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(layerGroup);
            L.polyline(latlngs, { color: '#087b68', weight: 8, opacity: 0.98, lineCap: 'round', lineJoin: 'round' }).addTo(layerGroup);
            L.polyline(latlngs, { color: '#0d9488', weight: 3, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(layerGroup);
            
            let stopNumber = 0;
            (routeStops.length ? routeStops : validPoints).forEach((point, idx, allPoints) => {
              const isObj = !Array.isArray(point);
              const ptLat = isObj ? Number(point.latitude) : Number(point[0]);
              const ptLon = isObj ? Number(point.longitude) : Number(point[1]);
              let type = isObj ? (point.point_type || 'checkpoint') : 'checkpoint';
              if (idx === 0) type = 'origin';
              if (idx === allPoints.length - 1) type = 'end';
              // Normalize legacy 'turn' type to 'waypoint'
              if (type === 'turn' || type === 'checkpoint') type = 'waypoint';

              // Show only rider-meaningful pins on mobile to keep the UI clean.
              if (isMobile) {
                if (type !== 'origin' && type !== 'end' && type !== 'end_of_route'
                    && type !== 'alight_or_board_stop' && type !== 'boarding_stop') {
                  return;
                }
              }

              const label = isObj && point.label ? point.label : type.replace(/_/g, ' ');
              let iconClass, svgIcon, iconSize, iconAnchor;

              if (type === 'origin') {
                iconClass = 'route-point-icon route-point-origin';
                svgIcon = `<svg viewBox="0 0 32 32" width="24" height="24"><circle cx="16" cy="16" r="14" fill="#16a34a" stroke="#fff" stroke-width="2"/><text x="16" y="22" text-anchor="middle" fill="#fff" font-size="16" font-weight="bold" font-family="sans-serif">A</text></svg>`;
                iconSize = [24, 24];
                iconAnchor = [12, 12];
              } else if (type === 'end' || type === 'end_of_route') {
                iconClass = 'route-point-icon route-point-end';
                svgIcon = `<svg viewBox="0 0 32 32" width="24" height="24"><circle cx="16" cy="16" r="14" fill="#dc2626" stroke="#fff" stroke-width="2"/><text x="16" y="22" text-anchor="middle" fill="#fff" font-size="16" font-weight="bold" font-family="sans-serif">B</text></svg>`;
                iconSize = [24, 24];
                iconAnchor = [12, 12];
              } else if (type === 'alight_or_board_stop' || type === 'boarding_stop') {
                stopNumber++;
                iconClass = 'route-point-icon route-point-stop';
                svgIcon = `<svg viewBox="0 0 28 28" width="20" height="20"><circle cx="14" cy="14" r="12" fill="#2563eb" stroke="#fff" stroke-width="2"/><text x="14" y="19" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold" font-family="sans-serif">${stopNumber}</text></svg>`;
                iconSize = [20, 20];
                iconAnchor = [10, 10];
              } else if (type === 'waypoint') {
                iconClass = 'route-point-icon route-point-waypoint';
                svgIcon = `<svg viewBox="0 0 20 20" width="14" height="14"><rect x="3" y="3" width="14" height="14" rx="2" transform="rotate(45 10 10)" fill="#f97316" stroke="#fff" stroke-width="1.5"/></svg>`;
                iconSize = [14, 14];
                iconAnchor = [7, 7];
              } else if (type === 'road_segment') {
                iconClass = 'route-point-icon route-point-segment';
                svgIcon = `<svg viewBox="0 0 12 12" width="8" height="8"><circle cx="6" cy="6" r="4" fill="#9ca3af"/></svg>`;
                iconSize = [8, 8];
                iconAnchor = [4, 4];
              } else {
                // Fallback: treat unknown types as waypoints
                iconClass = 'route-point-icon route-point-waypoint';
                svgIcon = `<svg viewBox="0 0 20 20" width="14" height="14"><rect x="3" y="3" width="14" height="14" rx="2" transform="rotate(45 10 10)" fill="#f97316" stroke="#fff" stroke-width="1.5"/></svg>`;
                iconSize = [14, 14];
                iconAnchor = [7, 7];
              }

              const marker = L.marker([ptLat, ptLon], {
                icon: L.divIcon({
                  className: iconClass,
                  html: svgIcon,
                  iconSize: iconSize,
                  iconAnchor: iconAnchor,
                }),
              });
              marker.bindPopup(`<strong>${escapeHtml(label.charAt(0).toUpperCase() + label.slice(1))}</strong><br/><small>${escapeHtml(type.replace(/_/g, ' '))}</small><br/><small>LAT: ${ptLat.toFixed(5)}, LONG: ${ptLon.toFixed(5)}</small>`)
                    .bindTooltip(escapeHtml(label), { direction: 'top', offset: [0, -5] });
              marker.addTo(layerGroup);
            });
          } else if (!isOverviewMap) {
            L.polyline(latlngs, { color: '#9aa0a6', weight: 2, opacity: routeFilter ? 0.25 : 0.16, lineCap: 'round', lineJoin: 'round' }).addTo(layerGroup);
          }
      }
    }
    // Incremental vehicle marker updates
    const vehicles = state.vehicles.filter(vehicle => !routeFilter || vehicle.route === routeFilter).filter(vehicle => Number(vehicle.latitude) && Number(vehicle.longitude));
    const currentVehicleIds = new Set();
    for (const vehicle of vehicles) {
      const lat = Number(vehicle.latitude);
      const lon = Number(vehicle.longitude);
      const tier = tierClass(vehicle.tier);
      const vid = vehicle.vehicle_id;
      currentVehicleIds.add(vid);

      if (existingMarkers[vid]) {
        // Update existing marker position and icon
        const existing = existingMarkers[vid];
        existing.marker.setLatLng([lat, lon]);
        // Update icon if tier changed
        if (existing.tier !== vehicle.tier) {
          const newIcon = L.divIcon({
            className: 'vehicle-icon-wrapper',
            html: `<span class="vehicle-div-icon ${tier}" aria-hidden="true" style="position:relative;"><svg viewBox="0 0 24 24"><path d="M6 3h12a3 3 0 0 1 3 3v9a2 2 0 0 1-2 2v2a1 1 0 0 1-2 0v-2H7v2a1 1 0 0 1-2 0v-2a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3Zm0 3v5h12V6H6Zm2 8a1.5 1.5 0 1 0 0 .01V14Zm8 0a1.5 1.5 0 1 0 0 .01V14Z"/></svg><span style="position:absolute;bottom:-2px;right:-2px;background:#fff;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:bold;border:1px solid currentColor;">${vehicle.direction === "forward" ? "▲" : "▼"}</span></span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14]
          });
          existing.marker.setIcon(newIcon);
          existing.tier = vehicle.tier;
        }
        // Update popup content
        const popup = `<div class="map-popup-actions"><strong>${escapeHtml(vehicle.vehicle_id)}</strong><span>Route ${escapeHtml(vehicle.route)}</span><span>Load ${escapeHtml(String(vehicle.occupancy))}/${escapeHtml(String(vehicle.capacity))} · ETA ${escapeHtml(String(vehicle.eta_minutes))} min</span><div><button onclick="showVehicleDetailsModal('${escapeHtml(vehicle.vehicle_id)}')">Details</button><button onclick="reportVehicleIncidentModal('${escapeHtml(vehicle.vehicle_id)}','${escapeHtml(vehicle.route)}')">Report</button></div></div>`;
        existing.marker.setPopupContent(popup);
      } else {
        // Create new marker
        const icon = L.divIcon({
          className: 'vehicle-icon-wrapper',
          html: `<span class="vehicle-div-icon ${tier}" aria-hidden="true" style="position:relative;"><svg viewBox="0 0 24 24"><path d="M6 3h12a3 3 0 0 1 3 3v9a2 2 0 0 1-2 2v2a1 1 0 0 1-2 0v-2H7v2a1 1 0 0 1-2 0v-2a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3Zm0 3v5h12V6H6Zm2 8a1.5 1.5 0 1 0 0 .01V14Zm8 0a1.5 1.5 0 1 0 0 .01V14Z"/></svg><span style="position:absolute;bottom:-2px;right:-2px;background:#fff;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:bold;border:1px solid currentColor;">${vehicle.direction === "forward" ? "▲" : "▼"}</span></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14]
        });
        const marker = L.marker([lat, lon], { icon, loadsenseTier: vehicle.tier });
        const popup = `<div class="map-popup-actions"><strong>${escapeHtml(vehicle.vehicle_id)}</strong><span>Route ${escapeHtml(vehicle.route)}</span><span>Load ${escapeHtml(String(vehicle.occupancy))}/${escapeHtml(String(vehicle.capacity))} · ETA ${escapeHtml(String(vehicle.eta_minutes))} min</span><div><button onclick="showVehicleDetailsModal('${escapeHtml(vehicle.vehicle_id)}')">Details</button><button onclick="reportVehicleIncidentModal('${escapeHtml(vehicle.vehicle_id)}','${escapeHtml(vehicle.route)}')">Report</button></div></div>`;
        marker.bindPopup(popup);
        marker.bindTooltip(`${escapeHtml(vehicle.vehicle_id)} (${escapeHtml(vehicle.route)})` , { permanent: false });
        if (clusterGroup) {
          clusterGroup.addLayer(marker);
        } else {
          marker.addTo(layerGroup);
        }
        existingMarkers[vid] = { marker, tier: vehicle.tier };
      }
    }
    // Remove markers for vehicles that no longer exist
    for (const vid of Object.keys(existingMarkers)) {
      if (!currentVehicleIds.has(vid)) {
        const entry = existingMarkers[vid];
        if (clusterGroup) {
          clusterGroup.removeLayer(entry.marker);
        } else {
          layerGroup.removeLayer(entry.marker);
        }
        delete existingMarkers[vid];
      }
    }
    drawDestinationLayer(containerId, layerGroup);
    // Only fitBounds when user has not interacted with the map
    if (!state.userInteracted && vehicles.length) {
      const allPoints = vehicles.map(v => [Number(v.latitude), Number(v.longitude)]);
      map._programmaticMove = true;
      try { map.fitBounds(L.latLngBounds(allPoints), { maxZoom: 15, padding: [28, 28] }); } catch (e) {}
      map._programmaticMove = false;
    }
  }

  function setupRecenterButtons() {
    const recenter = qs("recenterBtn");
    const opRecenter = qs("opRecenterBtn");
    if (recenter) recenter.addEventListener("click", () => {
      const map = state.maps.mobileMap;
      if (!map) return;
      if (state.lastPosition) {
        map.setView([state.lastPosition.latitude, state.lastPosition.longitude], 15);
      } else {
        fitRoute("mobileMap", state.selectedRoute);
      }
    });
    if (opRecenter) opRecenter.addEventListener("click", () => {
      if (state.maps.operatorMap) fitFleet("operatorMap");
    });
  }

  function fitRoute(containerId, routeId) {
    const map = state.maps[containerId];
    const route = state.routes.find(item => item.route === routeId);
    const points = (route?.polyline || []).filter(isMapCoordinate).map(point => [Number(point.latitude), Number(point.longitude)]);
    if (map && points.length && typeof L !== "undefined") {
      try { map.fitBounds(L.latLngBounds(points), { maxZoom: 15, padding: [28, 28] }); } catch (e) {}
    }
  }

  function fitFleet(containerId) {
    const map = state.maps[containerId];
    const points = state.vehicles.filter(isMapCoordinate).map(vehicle => [Number(vehicle.latitude), Number(vehicle.longitude)]);
    if (map && points.length && typeof L !== "undefined") {
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
    
    if (state.maps.mobileMap) {
      if (typeof activateMobileTab === "function") activateMobileTab("mapTab");
      drawMap("mobileMap", vehicle.route);
      const map = state.maps.mobileMap;
      if (map) {
        setTimeout(() => map.setView([Number(vehicle.latitude), Number(vehicle.longitude)], 17), 100);
      }
    } else if (state.maps.operatorMap) {
      if (typeof activateOperatorTab === "function") activateOperatorTab("opsOverview");
      const map = state.maps.operatorMap;
      if (map) {
        setTimeout(() => map.setView([Number(vehicle.latitude), Number(vehicle.longitude)], 17), 100);
      }
    }
  }

  function addMapControls(containerId, map, tileLayers, defaultName) {
    if (typeof L === "undefined") return;
    const isOperator = containerId === "operatorMap";
    const controlPos = isOperator ? "topright" : "bottomright";
    const control = L.control({ position: controlPos });
    control.onAdd = function () {
      const wrap = L.DomUtil.create("div", "map-controls-bar");
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      // --- Layer Settings Bottom Sheet ---
      const mapContainer = map.getContainer();
      const sheetWrap = L.DomUtil.create("div", "map-settings-sheet-wrap", mapContainer);
      const backdrop = L.DomUtil.create("div", "map-settings-backdrop", sheetWrap);
      const sheet = L.DomUtil.create("div", "map-settings-sheet", sheetWrap);

      const sheetHeader = L.DomUtil.create("div", "map-settings-header", sheet);
      sheetHeader.innerHTML = `<h3>Map Details</h3><button type="button" class="close-sheet" aria-label="Close Map Details"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
      
      const grid = L.DomUtil.create("div", "map-settings-grid", sheet);
      const layerOrder = ['Standard', 'Light', 'Dark', 'Transport', 'Cycle'];
      
      layerOrder.forEach(name => {
        const item = L.DomUtil.create("button", "map-type-card", grid);
        item.type = "button";
        item.innerHTML = `<div class="map-type-preview map-type-${name.toLowerCase()}"></div><div class="map-type-name">${name}</div>`;
        if (name === defaultName) item.classList.add("active");
        
        L.DomEvent.on(item, "click", (e) => {
          e.stopPropagation();
          Array.from(grid.children).forEach(child => child.classList.remove("active"));
          item.classList.add("active");
          closeSheet();
          
          const current = state.mapActiveTile[containerId];
          if (current) map.removeLayer(current);
          const next = tileLayers[name];
          next.addTo(map);
          const featureLayer = state.mapLayers[containerId];
          const clusterLayer = state.mapClusters[containerId];
          if (featureLayer && featureLayer.bringToFront) featureLayer.bringToFront();
          if (clusterLayer && clusterLayer.bringToFront) clusterLayer.bringToFront();
          state.mapActiveTile[containerId] = next;
          try { localStorage.setItem("loadsense_map_tile", name); } catch(e) {}
        });
      });

      const openSheet = () => {
        backdrop.classList.add("open");
        sheet.classList.add("open");
      };
      const closeSheet = () => {
        backdrop.classList.remove("open");
        sheet.classList.remove("open");
      };
      L.DomEvent.on(backdrop, "click", closeSheet);
      L.DomEvent.on(sheetHeader.querySelector(".close-sheet"), "click", closeSheet);



      // --- Choose on Map (Pin Destination) Button ---
      if (containerId === "mobileMap") {
        const pinBtn = L.DomUtil.create("button", "map-fab pin-dest-btn", wrap);
        pinBtn.type = "button";
        pinBtn.title = "Choose destination on map";
        pinBtn.setAttribute("aria-label", "Choose destination on map");
        pinBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform: scale(0.9)"><path d="M22 2 11 13"></path><path d="m22 2-7 20-4-9-9-4 20-7z"></path></svg>`;
        
        L.DomEvent.on(pinBtn, "click", (e) => {
          e.stopPropagation();
          if (typeof window.togglePinMode === 'function') {
            window.togglePinMode(containerId, map);
          }
        });
      }


      const toggle = L.DomUtil.create("button", "map-fab", wrap);
      toggle.type = "button";
      toggle.title = "Map Settings";
      toggle.setAttribute("aria-label", "Map Settings");
      toggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform: scale(0.9)"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/></svg>`;
      
      L.DomEvent.on(toggle, "click", (e) => {
        e.stopPropagation();
        openSheet();
      });


      // --- Locate Me / Fit Fleet Button ---
      const locBtn = L.DomUtil.create("button", "map-fab", wrap);
      locBtn.type = "button";
      if (isOperator) {
        locBtn.title = "Center map on fleet";
        locBtn.setAttribute("aria-label", "Center map on fleet");
        locBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform: scale(0.9)"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
      } else {
        locBtn.title = "Show my location";
        locBtn.setAttribute("aria-label", "Show my location");
        locBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform: scale(0.9)"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`;
      }
      L.DomEvent.on(locBtn, "click", () => {
        if (isOperator) {
          fitFleet(containerId);
        } else {
          locBtn.classList.add("map-fab--loading");
          if (state.lastPosition) {
            map.setView([state.lastPosition.latitude, state.lastPosition.longitude], 16);
            locBtn.classList.remove("map-fab--loading");
          } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                map.setView([pos.coords.latitude, pos.coords.longitude], 16);
                locBtn.classList.remove("map-fab--loading");
              },
              () => { locBtn.classList.remove("map-fab--loading"); }
            );
          } else {
            locBtn.classList.remove("map-fab--loading");
          }
        }
      });
      return wrap;
    };
    control.addTo(map);

    if (containerId === "mobileMap") {
       map.on('movestart', () => {
         if (document.body.classList.contains("pin-selection-mode")) {
           const overlay = document.getElementById("centerPinOverlay");
           if (overlay) overlay.classList.add("is-dragging");
         }
       });
       map.on('moveend', () => {
         if (document.body.classList.contains("pin-selection-mode")) {
           const overlay = document.getElementById("centerPinOverlay");
           if (overlay) overlay.classList.remove("is-dragging");
         }
       });
    }

    // Start geolocation watch for non-operator maps
    if (!isOperator && navigator.geolocation) {
      startLocationWatch(containerId, map);
    }
  }

  function startLocationWatch(containerId, map) {
    // Avoid duplicate watches for the same map
    if (state.geoWatches && state.geoWatches[containerId]) return;
    if (!state.geoWatches) state.geoWatches = {};
    let locationMarker = null;
    let accuracyCircle = null;
    state.geoWatches[containerId] = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        // Update shared state
        state.lastPosition = { latitude: lat, longitude: lon };
        // Draw / update marker and accuracy circle
        if (!locationMarker) {
          accuracyCircle = L.circle([lat, lon], {
            radius: acc,
            color: '#1a73e8',
            fillColor: '#1a73e8',
            fillOpacity: 0.08,
            weight: 1.5,
            opacity: 0.4,
          }).addTo(map);
          locationMarker = L.marker([lat, lon], {
            icon: L.divIcon({
              className: 'my-location-icon',
              html: '<span></span>',
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            }),
            zIndexOffset: 1000,
          }).bindTooltip('My location', { direction: 'top', offset: [0, -6] }).addTo(map);
        } else {
          locationMarker.setLatLng([lat, lon]);
          accuracyCircle.setLatLng([lat, lon]).setRadius(acc);
        }
      },
      null,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }

  function drawDestinationLayer(containerId, layerGroup) {
    if (containerId !== "mobileMap" || typeof L === "undefined" || !state.selectedDestination) return;
    const destination = [state.selectedDestination.latitude, state.selectedDestination.longitude];
    L.marker(destination, {
      icon: L.divIcon({ className: "destination-marker", html: "<span></span>", iconSize: [24, 24], iconAnchor: [12, 22] }),
    }).bindTooltip("Destination").addTo(layerGroup);
    const best = state.vehicles.filter(v => v.route === state.selectedRoute && Number(v.latitude) && Number(v.longitude)).sort(vehicleSort)[0];
    if (best) {
      L.polyline([[Number(best.latitude), Number(best.longitude)], destination], { color: "#0f766e", weight: 4, dashArray: "8 8", opacity: 0.8 }).addTo(layerGroup);
    }
  }

  function showVehicleDetailsModal(vehicleId) {
    const vehicle = state.vehicles.find(item => item.vehicle_id === vehicleId);
    if (!vehicle) return;
    const route = state.routes.find(item => item.route === vehicle.route);
    const routeAlerts = state.incidents.filter(incident => incident.vehicle_id === vehicleId);
    const activeAlerts = state.alerts.filter(alert => alert.vehicle_id === vehicleId);
    const details = `
      <div class="vehicle-detail-modal">
        <div class="vehicle-detail-grid">
          <div><span>Route</span><strong>${escapeHtml(vehicle.route)}</strong></div>
          <div><span>Direction</span><strong>${escapeHtml(vehicle.direction || "unknown")}</strong></div>
          <div><span>ETA</span><strong>${escapeHtml(String(vehicle.eta_minutes ?? "--"))} min</strong></div>
          <div><span>Load</span><strong>${escapeHtml(String(vehicle.occupancy))}/${escapeHtml(String(vehicle.capacity))}</strong></div>
          <div><span>Status</span><strong>${escapeHtml(vehicle.status || "active")}</strong></div>
          <div><span>Safety</span><strong>${escapeHtml(vehicle.route_deviation?.anomaly ? "Verify route" : "On route")}</strong></div>
        </div>
        <section class="vehicle-history-section">
          <h3>Route details</h3>
          <p>${escapeHtml(route?.name || route?.description || "No route metadata available.")}</p>
          <p class="muted">${escapeHtml(route?.origin_name || "Origin")} to ${escapeHtml(route?.destination_name || "Destination")}</p>
        </section>
        <section class="vehicle-history-section">
          <h3>Verified alerts</h3>
          ${activeAlerts.length ? activeAlerts.map(alert => `<article><strong>${escapeHtml(alert.severity)}</strong><p>${escapeHtml(alert.message)}</p><small>${escapeHtml(alert.verification_status || "open")}</small></article>`).join("") : `<p class="empty-copy">No verified alerts for this PUV.</p>`}
        </section>
        <section class="vehicle-history-section">
          <h3>User reports</h3>
          ${routeAlerts.length ? routeAlerts.slice(0, 4).map(incident => `<article><strong>${escapeHtml(incident.severity)}</strong><p>${escapeHtml(incident.message)}</p><small>${escapeHtml(incident.verification_status || "open")}</small></article>`).join("") : `<p class="empty-copy">No user incidents reported yet.</p>`}
        </section>
      </div>
    `;
    openModal({
      title: `${vehicle.vehicle_id} details`,
      bodyHtml: details,
      actions: [],
    });
  }

  function reportVehicleIncidentModal(vehicleId, routeId) {
    const categories = ["Safety", "Route deviation", "Crowding", "Delay", "Driver conduct", "Other"];
    openModal({
      title: `Report incident for ${vehicleId}`,
      bodyHtml: `
        <form class="incident-report-form">
          <div class="incident-context-grid">
            <div><span>Vehicle</span><strong>${escapeHtml(vehicleId)}</strong></div>
            <div><span>Route</span><strong>${escapeHtml(routeId)}</strong></div>
          </div>
          <label><span>Category</span><select id="incidentCategory">${categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}</select></label>
          <label><span>Severity</span><select id="incidentSeverity"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></label>
          <label><span>Explanation</span><textarea id="incidentExplanation" rows="4" placeholder="Describe what happened, where it happened, and whether passengers are affected."></textarea></label>
        </form>
      `,
      actions: [
        {
          id: "submit",
          label: "Submit report",
          className: "primary",
          onClick: ({ overlay, close }) => {
            const category = overlay.querySelector("#incidentCategory")?.value || "Other";
            const severity = overlay.querySelector("#incidentSeverity")?.value || "medium";
            const explanation = overlay.querySelector("#incidentExplanation")?.value.trim() || "";
            if (!explanation) {
              if (typeof showToast === "function") showToast("Add a short incident explanation.");
              return;
            }
            if (typeof createAlert === "function") {
              createAlert(vehicleId, routeId, { category, severity, explanation, source: "user_reported" });
            }
            close();
          },
        },
        { id: "cancel", label: "Cancel", className: "secondary", onClick: ({ close }) => close() },
      ],
    });
  }

  function renderVehicleCard(vehicle) {
    return `
      <article class="vehicle-card">
        <div>
          <h4>Route ${escapeHtml(vehicle.route)} <span style="font-size: 14px; font-weight: 600; color: var(--muted);">${escapeHtml(vehicle.vehicle_id)}</span></h4>
          <p style="margin-bottom: 12px;">${escapeHtml(routeName(vehicle.route))}</p>
          
          <ul class="route-stops-timeline" style="margin-bottom: 16px; margin-left: 4px;">
            <li><span class="stop-dot" style="background: var(--teal); border-color: var(--teal);"></span>Board: <strong>Stop ${Number(vehicle.next_stop_id ?? 0) + 1}</strong></li>
            <li><span class="stop-dot" style="background: var(--destructive, #ef4444); border-color: var(--destructive, #ef4444);"></span>Alight: <strong>Select destination</strong></li>
          </ul>

          <div class="trip-detail-grid">
            <div style="color: var(--muted);">ETA to you:</div> <div><strong>${escapeHtml(vehicle.eta_minutes ?? "--")} min</strong></div>
          </div>
        </div>
        <div class="vehicle-card-actions">
          <span class="occupancy-pill ${tierClass(vehicle.tier)}">${tierLabel(vehicle.tier)}</span>
          <button class="mini-action zoom-btn" data-zoom-vehicle="${escapeHtml(vehicle.vehicle_id)}" title="Zoom on Map" aria-label="Zoom on Map">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
          </button>
        </div>
      </article>
    `;
  }

