  async function requestTripSuggestions(query = "") {
    const destination = qs("destinationInput")?.value.trim();
    const origin = qs("originInput")?.value.trim();
    if (!destination && !query) {
      showToast("Enter a destination first.");
      return null;
    }
    if (origin && destination && origin.toLowerCase() === destination.toLowerCase()) {
      showToast("Origin and destination cannot be the same.");
      return null;
    }
    const result = await getJson("/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildTripPayload(query)),
    });
    syncTripResult(result);
    state.showTripPanel = true;
    renderMobile();
    
    if (!state.tripSuggestions.length && typeof showToast === "function") {
      showToast(state.tripMessage || "Unable to find a route.");
    }
    
    const map = state.maps.mobileMap;
    const best = state.tripSuggestions[0];
    if (map && state.selectedDestination && typeof L !== "undefined") {
      const points = [[state.selectedDestination.latitude, state.selectedDestination.longitude]];
      if (best && isMapCoordinate({ latitude: best.boarding_stop?.latitude, longitude: best.boarding_stop?.longitude })) {
        points.push([best.boarding_stop.latitude, best.boarding_stop.longitude]);
      }
      try { map.fitBounds(L.latLngBounds(points), { maxZoom: 15, padding: [30, 30] }); } catch (e) {}
    }
    return result;
  }

  function bindVehicleButtons(scope = document) {
    scope.querySelectorAll("[data-zoom-vehicle]").forEach(button => {
      button.addEventListener("click", () => {
        zoomVehicle(button.dataset.zoomVehicle);
        state.showTripPanel = false;
        renderMobile();
      });
    });
    scope.querySelectorAll("[data-select-route]").forEach(button => {
      button.addEventListener("click", () => {
        state.selectedVehicleId = null;
        state.selectedRoute = button.dataset.selectRoute;
        state.tripSuggestions = [];
        activateMobileTab("mapTab");
        drawMap("mobileMap", state.selectedRoute);
        setTimeout(() => fitRoute("mobileMap", state.selectedRoute), 100);
        renderMobile();
      });
    });
  }

  function initMobileTabs() {
    document.querySelectorAll(".mobile-nav button").forEach(button => {
      button.addEventListener("click", () => activateMobileTab(button.dataset.tab));
    });
  }

  function setTripSearchCollapsed(collapsed) {
    const panel = qs("tripSearchPanel");
    const appScreen = qs("appScreen");
    const toggle = qs("toggleTripSearch");
    if (!panel) return;
    state.tripSearchCollapsed = Boolean(collapsed);
    panel.classList.toggle("is-collapsed", state.tripSearchCollapsed);
    appScreen?.classList.toggle("trip-search-collapsed", state.tripSearchCollapsed);
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(!state.tripSearchCollapsed));
      toggle.title = state.tripSearchCollapsed ? "Expand search" : "Collapse search";
      const icon = toggle.querySelector("[data-trip-toggle-icon]");
      if (icon) icon.textContent = state.tripSearchCollapsed ? "+" : "−";
    }
    setTimeout(() => {
      try { state.maps.mobileMap?.invalidateSize(); } catch (e) {}
      if (state.selectedRoute && !state.selectedVehicleId) fitRoute("mobileMap", state.selectedRoute);
    }, 120);
  }

  function activateMobileTab(tabId) {
    const target = qs(tabId);
    if (!target) return;
    document.querySelectorAll(".mobile-nav button").forEach(item => item.classList.toggle("active", item.dataset.tab === tabId));
    document.querySelectorAll(".tab-panel").forEach(item => item.classList.toggle("active", item.id === tabId));
    const tripSearch = qs("tripSearchPanel");
    if (tripSearch) {
      tripSearch.classList.toggle("hidden", !["homeTab", "mapTab"].includes(tabId));
      if (tabId === "mapTab" && !state.tripSearchManuallyChanged) {
        setTripSearchCollapsed(true);
      }
    }
    setTimeout(() => {
      try { state.maps.mobileMap?.invalidateSize(); } catch (e) {}
    }, 100);
  }

  function renderMobile() {
    const selected = state.selectedRoute;
    const mobileRouteTitle = qs("mobileRouteTitle");
    if (mobileRouteTitle) {
      mobileRouteTitle.textContent = state.tripSuggestions[0]
        ? `Best: Route ${state.tripSuggestions[0].route}`
        : selected ? `Nearest: Route ${selected}` : `Select a route`;
    }
    updatePlaceDatalists();

    const routeVehicles = selected ? state.vehicles.filter(vehicle => vehicle.route === selected).sort(vehicleSort) : [];
    const best = routeVehicles[0];
    const activeSuggestions = state.tripSuggestions.length ? state.tripSuggestions : null;
    qs("mobileFleet").innerHTML = activeSuggestions
      ? activeSuggestions.map(renderSuggestionCard).join("")
      : routeVehicles.length
      ? routeVehicles.map(renderVehicleCard).join("")
      : selected
      ? `<p class="empty-copy">No live PUVs for Route ${escapeHtml(selected)} yet. The backend simulator will publish the next loop shortly.</p>`
      : (state.tripMessage && !activeSuggestions)
      ? `<p class="empty-copy">${escapeHtml(state.tripMessage || "Unable to find a route for the given trip.")}</p>`
      : `<p class="empty-copy">Please select an origin and destination to see approaching PUVs.</p>`;
    bindVehicleButtons();

    const bestSuggestion = state.tripSuggestions[0];
    if (bestSuggestion) {
      qs("bestVehicleTitle").innerHTML = `Route ${bestSuggestion.route} <span style="font-size: 16px; font-weight: 600; color: var(--muted);">${bestSuggestion.vehicle_id}</span>`;
      let bodyHtml = "";
      if (bestSuggestion.direction === "multi" && bestSuggestion.legs) {
        const l1 = bestSuggestion.legs[0];
        const l2 = bestSuggestion.legs[1];
        bodyHtml = `
          <div class="multi-leg-itinerary">
            <div class="leg">
              <span class="leg-step">1</span>
              <div>
                <strong>${l1.route}</strong>
                <p>Board: ${l1.boarding_stop.name}</p>
                <p>Alight: ${l1.alighting_stop.name}</p>
              </div>
            </div>
            <div class="leg transfer-leg">
              <span class="leg-step">🚶</span>
              <div>
                <strong>Transfer</strong>
                <p>~${Math.round(bestSuggestion.transfer_walk_meters)}m walk</p>
              </div>
            </div>
            <div class="leg">
              <span class="leg-step">2</span>
              <div>
                <strong>${l2.route}</strong>
                <p>Board: ${l2.boarding_stop.name}</p>
                <p>Alight: ${l2.alighting_stop.name}</p>
              </div>
            </div>
          </div>
          <div class="boarding-detail-row"><span>Total ETA</span><strong>${Math.round(Number(bestSuggestion.eta_minutes || 0))} min</strong></div>
          <div class="boarding-detail-row"><span>Total Fare</span><strong>PHP ${bestSuggestion.fare_pesos || "--"}</strong></div>
        `;
      } else {
        bodyHtml = `
          <div class="boarding-detail-row"><span style="display: flex; align-items: center; gap: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>ETA</span><strong>${Math.round(Number(bestSuggestion.eta_minutes || 0))} min</strong></div>
          <div class="boarding-detail-row"><span style="display: flex; align-items: center; gap: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>Occupancy</span><strong>${bestSuggestion.occupancy}/${bestSuggestion.capacity}</strong></div>
          <div class="boarding-detail-row"><span style="display: flex; align-items: center; gap: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>Fare estimate</span><strong>PHP ${bestSuggestion.fare_pesos || "--"}</strong></div>
          <div class="boarding-detail-row"><span>Alternative</span><strong>${state.tripSuggestions[1] ? state.tripSuggestions[1].route_name : 'None available'}</strong></div>
        `;
      }
      qs("bestVehicleBody").innerHTML = bodyHtml;
      qs("ledPill").className = `occupancy-pill ${tierClass(bestSuggestion.tier)}`;
      qs("ledPill").innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: text-bottom;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${tierLabel(bestSuggestion.tier)}`;
      qs("homeEta").textContent = `${Math.round(Number(bestSuggestion.eta_minutes || 0))}m`;
      qs("homeLoad").textContent = `${bestSuggestion.occupancy}/${bestSuggestion.capacity}`;
      qs("homeSafety").textContent = bestSuggestion.status || "active";
    } else if (best) {
        const safeText = best.route_deviation?.anomaly ? "Verify" : "Clear";
        qs("bestVehicleTitle").innerHTML = `Route ${best.route} <span style="font-size: 16px; font-weight: 600; color: var(--muted);">${best.vehicle_id}</span>`;
        qs("bestVehicleBody").innerHTML = `
          <div class="boarding-detail-row"><span style="display: flex; align-items: center; gap: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>ETA</span><strong>${best.eta_minutes} min</strong></div>
          <div class="boarding-detail-row"><span style="display: flex; align-items: center; gap: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>Occupancy</span><strong>${best.occupancy}/${best.capacity}</strong></div>
          <div class="boarding-detail-row"><span style="display: flex; align-items: center; gap: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>Fare estimate</span><strong>--</strong></div>
          <div class="boarding-detail-row"><span>Alternative</span><strong>None selected</strong></div>
        `;
        qs("ledPill").className = `occupancy-pill ${tierClass(best.tier)}`;
        qs("ledPill").innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: text-bottom;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${tierLabel(best.tier)}`;
        qs("homeEta").textContent = `${best.eta_minutes}m`;
        qs("homeLoad").textContent = `${best.occupancy}/${best.capacity}`;
        qs("homeSafety").textContent = safeText;
    } else {
        qs("bestVehicleTitle").textContent = "No route selected";
        qs("bestVehicleBody").innerHTML = "<p>Please select an origin and destination to find the best boarding option.</p>";
        qs("ledPill").className = "occupancy-pill neutral";
        qs("ledPill").textContent = "Awaiting input";
        qs("homeEta").textContent = "--";
        qs("homeLoad").textContent = "--";
        qs("homeSafety").textContent = "--";
    }

    renderRouteDirectory();
    renderDestinationConfirm();
    drawMap("mobileMap", selected);
  }

  function renderDestinationConfirm() {
    const panel = qs("destinationConfirm");
    if (!panel) return;
    if (!state.selectedDestination) {
      panel.classList.add("hidden");
      panel.classList.remove("collapsed-peek");
      panel.innerHTML = "";
      return;
    }
    
    const lat = state.selectedDestination.latitude.toFixed(5);
    const lon = state.selectedDestination.longitude.toFixed(5);
    const best = state.tripSuggestions[0] || state.vehicles.filter(v => v.route === state.selectedRoute).sort(vehicleSort)[0];
    const title = state.selectedDestination.name || "Search Results";

    if (!state.showTripPanel) {
      panel.classList.remove("hidden");
      panel.classList.add("collapsed-peek");
      const etaText = best && best.eta_minutes ? `~${Math.round(Number(best.eta_minutes))} min away` : 'Calculating...';
      
      panel.innerHTML = `
        <div class="peek-handle"></div>
        <div class="peek-content" id="reopenTripPanel">
          <div class="peek-info">
            <span class="peek-title">${escapeHtml(title)}</span>
            <span class="peek-eta">${etaText}</span>
          </div>
          <button id="clearTripBtn" aria-label="Clear Trip" style="padding: 6px; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: none; background: #f1f5f9; color: #64748b; cursor: pointer;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;
      
      const reopenBtn = qs("reopenTripPanel");
      if (reopenBtn) {
        reopenBtn.addEventListener("click", (e) => {
          if (e.target.closest("#clearTripBtn")) return;
          state.showTripPanel = true;
          renderMobile();
        });
      }
      
      const clearBtn = qs("clearTripBtn");
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          state.selectedDestination = null;
          state.selectedVehicleId = null;
          state.tripSuggestions = [];
          state.showTripPanel = false;
          const destInput = qs("destinationInput");
          if (destInput) destInput.value = "";
          renderMobile();
        });
      }
      return;
    }

    panel.classList.remove("hidden");
    panel.classList.remove("collapsed-peek");

    let routeInfo = "";
    if (best) {
        const rName = best.route_name || (typeof routeName === 'function' ? routeName(best.route) : best.route);
        const bName = typeof normalizeStopLabel === 'function' ? normalizeStopLabel(best.boarding_stop, best.boarding_stop?.name || "waypoint") : (best.boarding_stop?.name || "waypoint");
        const aName = typeof normalizeStopLabel === 'function' ? normalizeStopLabel(best.alighting_stop, best.alighting_stop?.name || "destination") : (best.alighting_stop?.name || "destination");
        const eta = Math.round(Number(best.eta_minutes || 0));
        const dist = Number(best.distance_km || 0).toFixed(1);
        const fare = best.fare_pesos || "--";
        
        routeInfo = `
          <div style="margin-top: 16px;">
            <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--muted); margin-bottom: 8px;">Recommended Route</div>
            
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
              <span style="background: var(--teal); color: white; padding: 4px 10px; border-radius: 8px; font-weight: 800; font-size: 14px;">${escapeHtml(best.route)}</span>
              <div style="display: flex; flex-direction: column;">
                <span style="font-weight: 700; color: var(--ink); font-size: 14px;">${escapeHtml(rName)}</span>
                <span style="font-size: 12px; color: var(--muted);">🚐 <strong>${escapeHtml(best.vehicle_id)}</strong></span>
              </div>
            </div>

            <ul class="route-stops-timeline" style="margin-bottom: 16px; margin-left: 4px;">
              <li><span class="stop-dot" style="background: var(--teal); border-color: var(--teal);"></span>Board: <strong>${escapeHtml(bName)}</strong></li>
              <li><span class="stop-dot" style="background: var(--destructive, #ef4444); border-color: var(--destructive, #ef4444);"></span>Alight: <strong>${escapeHtml(aName)}</strong></li>
            </ul>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px; background: #f8fafc; border-radius: 12px; border: 1px solid rgba(0,0,0,0.04);">
              <div><span style="color: var(--muted); display: block; font-size: 11px; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">ETA to you</span><strong style="font-size: 14px; color: #1e293b; display: block;">~${eta} min</strong></div>
              <div><span style="color: var(--muted); display: block; font-size: 11px; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Distance</span><strong style="font-size: 14px; color: #1e293b; display: block;">${dist} km</strong></div>
              <div style="grid-column: span 2;"><span style="color: var(--muted); display: block; font-size: 11px; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Est. Fare</span><strong style="font-size: 14px; color: #1e293b; display: block;">PHP ${fare}</strong></div>
            </div>
            <button data-zoom-vehicle="${escapeHtml(best.vehicle_id)}" type="button" style="width: 100%; margin-top: 12px; padding: 12px; background: var(--teal); color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
              Zoom to PUV
            </button>
          </div>
        `;
        
        if (state.tripSuggestions.length > 1) {
            const altPills = state.tripSuggestions.slice(1, 4).map(s => {
                const sName = s.route_name || (typeof routeName === 'function' ? routeName(s.route) : s.route);
                return `<span style="display: inline-block; background: #e2e8f0; color: #475569; padding: 4px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; margin-right: 6px; margin-bottom: 6px;">[${escapeHtml(s.route)}] ${escapeHtml(sName)}</span>`;
            }).join("");
            
            routeInfo += `
              <div style="margin-top: 16px;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--muted); margin-bottom: 8px;">Alternative Routes</div>
                <div style="display: flex; flex-wrap: wrap;">${altPills}</div>
              </div>
            `;
        }
    } else {
        routeInfo = `<p style="margin-top: 12px; color: var(--muted);">${state.tripMessage || "Unable to find a route."}</p>`;
    }

    panel.innerHTML = `
      <button id="closeDestinationConfirm" class="close-sheet-btn" aria-label="Close" type="button" style="top: 12px; right: 12px;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      <div style="display: flex; flex-direction: column;">
        <strong style="font-size: 18px; color: var(--ink); display: flex; align-items: center; gap: 6px;">📍 ${escapeHtml(title)}</strong>
        <code style="margin-top: 4px; color: var(--muted); background: rgba(0,0,0,0.04); padding: 2px 6px; border-radius: 4px; font-size: 11px; align-self: flex-start;">${lat}, ${lon}</code>
      </div>
      ${routeInfo}
    `;
    qs("closeDestinationConfirm").addEventListener("click", () => {
      state.showTripPanel = false;
      renderMobile();
    });
    bindVehicleButtons(panel);
  }

  async function askMobileChat(query) {
    const transcript = qs("chatTranscript");
    
    const header = qs("chatHeader");
    if (header) header.classList.add("compact");

    transcript.insertAdjacentHTML("beforeend", `
      <div class="message-wrapper user-wrapper">
        <div class="message user">${escapeHtml(query)}</div>
      </div>
    `);
    
    const indicatorId = "typing-" + Date.now();
    transcript.insertAdjacentHTML("beforeend", `
      <div class="message-wrapper bot-wrapper" id="${indicatorId}">
        <div class="bot-avatar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        </div>
        <div class="message bot">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    `);
    transcript.scrollTop = transcript.scrollHeight;

    if (!state.chatHistory) {
      state.chatHistory = [];
    }
    state.chatHistory.push({ role: "user", text: query });

    const result = await getJson("/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildTripPayload(query, { chat: true })),
    });

    const indicator = document.getElementById(indicatorId);
    if (indicator) indicator.remove();

    if (result && result.answer) {
        state.chatHistory.push({ role: "model", text: result.answer });
    }

    syncChatResult(result);
    transcript.insertAdjacentHTML("beforeend", renderBotMessage(result));
    bindChatActions(transcript);
    transcript.scrollTop = transcript.scrollHeight;
    renderMobile();
  }

  async function initMobile() {
    initMobileTabs();
    bindPlaceSearch("originInput", "originSearchResults");
    bindPlaceSearch("destinationInput", "destinationSearchResults");
    await loadCountries();
    renderSearchableSelect(
      "mobileCountrySelect",
      state.countries.map(country => ({ value: country.code, label: country.name })),
      state.countryFilter,
      async value => {
        state.countryFilter = value || "all";
        state.cityFilter = "all";
        state.regionFilter = "all";
        state.selectedRoute = "";
        state.tripSuggestions = [];
        state.tripMatches = [];
        state.chatContext = { route: "", vehicleId: "" };
        await refreshData({ includeAuxiliary: false });
        renderMobile();
      },
      { placeholder: "Country", label: "Country", compact: true }
    );

    qs("loginForm").addEventListener("submit", async event => {
      event.preventDefault();
      qs("loginScreen").classList.add("hidden");
      qs("appScreen").classList.remove("hidden");
      
      const startNext = async () => {
        await refreshData({ includeAuxiliary: false });
        renderMobile();
      };
      
      try {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(pos => {
            state.lastPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            startNext();
          }, () => { startNext(); }, { timeout: 3000 });
        } else {
          startNext();
        }
      } catch (e) {
        startNext();
      }
    });

    const regionFilter = qs("cityFilter");
    if (regionFilter) {
      regionFilter.addEventListener("change", event => {
        let val = event.target.value || "all";
        if (val === "All regions") val = "all";
        state.cityFilter = val;
        state.regionFilter = state.cityFilter;
        setTimeout(() => {
          renderRouteDirectory();
        }, 0);
      });
    }

    // Wire up country change to populate city dropdown from API and sync both dropdowns
    const initCountryDropdowns = (currentVal) => {
      const handleCountrySelect = async (value) => {
        state.countryFilter = value || "all";
        state.cityFilter = "all";
        state.regionFilter = "all";
        state.selectedRoute = "";
        state.tripSuggestions = [];
        state.tripMatches = [];
        state.chatContext = { route: "", vehicleId: "" };
        try {
          const regionResult = await getJson(`/regions?country=${encodeURIComponent(value || '')}`);
          const regions = regionResult.regions || [];
          const regionDropdown = qs("cityFilter");
          if (regionDropdown) {
            if (regionDropdown.tagName === "DIV") {
              if (typeof window.renderSearchableSelect === "function") {
                window.renderSearchableSelect(
                  "cityFilter",
                  ["all", ...regions].map(r => ({ value: r, label: r === "all" ? "All regions" : r })),
                  "all",
                  (val) => {
                    state.regionFilter = val || "all";
                    state.cityFilter = state.regionFilter;
                    if (typeof window.renderMobile === "function") window.renderMobile();
                  },
                  { placeholder: "All regions", label: "All regions", compact: true }
                );
              }
            } else {
              regionDropdown.innerHTML = `<option value="all">All regions</option>` +
                regions.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
              regionDropdown.value = 'all';
            }
          }
        } catch (e) {
          const regionDropdown = qs("cityFilter");
          if (regionDropdown) {
            const routeRegions = ["all", ...new Set(state.routes
              .filter(r => !value || value === 'all' || r.country === value)
              .map(r => r.region).filter(Boolean))];
            
            if (regionDropdown.tagName === "DIV") {
              if (typeof window.renderSearchableSelect === "function") {
                window.renderSearchableSelect(
                  "cityFilter",
                  routeRegions.map(r => ({ value: r, label: r === "all" ? "All regions" : r })),
                  "all",
                  (val) => {
                    state.regionFilter = val || "all";
                    state.cityFilter = state.regionFilter;
                    if (typeof window.renderMobile === "function") window.renderMobile();
                  },
                  { placeholder: "All regions", label: "All regions", compact: true }
                );
              }
            } else {
              regionDropdown.innerHTML = routeRegions.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r === "all" ? "All regions" : r)}</option>`).join('');
              regionDropdown.value = 'all';
            }
          }
        }
        await refreshData({ includeAuxiliary: false });
        
        // Re-render both dropdowns so their UI stays in sync
        initCountryDropdowns(state.countryFilter);
        renderMobile();
      };

      if (qs("mobileCountrySelect")) {
        renderSearchableSelect(
          "mobileCountrySelect",
          state.countries.map(country => ({ value: country.code, label: country.name })),
          currentVal,
          handleCountrySelect,
          { placeholder: "Country", label: "Country", compact: true }
        );
      }
      
      if (qs("routesCountrySelect")) {
        renderSearchableSelect(
          "routesCountrySelect",
          state.countries.map(country => ({ value: country.code, label: country.name })),
          currentVal,
          handleCountrySelect,
          { placeholder: "Country", label: "Country", compact: true }
        );
      }
    };
    
    // Initial setup
    initCountryDropdowns(state.countryFilter);

    const swapTrip = qs("swapTrip");
    if (swapTrip) {
      swapTrip.addEventListener("click", () => {
        const originInput = qs("originInput");
        const destinationInput = qs("destinationInput");
        const originValue = originInput?.value || "";
        if (originInput && destinationInput) {
          originInput.value = destinationInput.value;
          destinationInput.value = originValue;
          originInput.dispatchEvent(new Event("input"));
          originInput.dispatchEvent(new Event("change"));
          destinationInput.dispatchEvent(new Event("input"));
          destinationInput.dispatchEvent(new Event("change"));
          qs("originSearchResults")?.classList.add("hidden");
          qs("destinationSearchResults")?.classList.add("hidden");
          if (typeof showToast === "function") showToast("Trip fields swapped.");
        }
      });
    }

    const refreshMobile = qs("refreshMobile");
    if (refreshMobile) {
      refreshMobile.addEventListener("click", async () => {
        await refreshData({ includeAuxiliary: false });
        renderMobile();
      });
    }

    const routeSearch = qs("routeSearch");
    if (routeSearch) {
      routeSearch.addEventListener("input", event => {
        state.routeQuery = event.target.value.trim();
        renderRouteDirectory();
      });
    }
    // setup recenter buttons; map.js owns the location watch to avoid duplicate refresh loops.
    setupRecenterButtons();
    
    const confirmPinBtn = qs("confirmPinBtn");
    const cancelPinBtn = qs("cancelPinBtn");
    if (confirmPinBtn) {
      confirmPinBtn.addEventListener("click", () => {
        const map = state.maps["mobileMap"];
        if (map) {
          const center = map.getCenter();
          const destName = `Pinned Location (${center.lat.toFixed(5)}, ${center.lng.toFixed(5)})`;
          const destInput = qs("destinationInput");
          if (destInput) destInput.value = destName;
          
          state.selectedDestination = {
            name: destName,
            city: "Unknown",
            latitude: center.lat,
            longitude: center.lng,
          };
          
          if (typeof window.togglePinMode === 'function') {
            window.togglePinMode("mobileMap", map);
          }
          
          if (typeof requestTripSuggestions === 'function') {
            requestTripSuggestions(destName);
          } else {
            if (typeof renderDestinationConfirm === 'function') renderDestinationConfirm();
            if (typeof renderMobile === 'function') renderMobile();
          }
          
          if (typeof showToast === "function") showToast("Destination selected on map.");
        }
      });
    }
    if (cancelPinBtn) {
      cancelPinBtn.addEventListener("click", () => {
        const map = state.maps["mobileMap"];
        if (map && typeof window.togglePinMode === 'function') {
          window.togglePinMode("mobileMap", map);
        }
      });
    }

    const chatForm = qs("chatForm");
    if (chatForm) {
      chatForm.addEventListener("submit", async event => {
        event.preventDefault();
        const input = qs("chatInput");
        const query = input.value.trim();
        if (!query) return;
        input.value = "";
        await askMobileChat(query);
      });
    }
    // Dirty-checking: only re-render if data actually changed
    let _lastMobileHash = '';
    setInterval(async () => {
      if (!qs("appScreen").classList.contains("hidden")) {
        await refreshData({ includeAuxiliary: false });
        const newHash = JSON.stringify({
          v: state.vehicles.map(v => v.vehicle_id + v.latitude + v.longitude + v.tier + v.occupancy),
          r: state.routes.map(r => r.route),
          s: state.selectedRoute
        });
        if (newHash !== _lastMobileHash) {
          _lastMobileHash = newHash;
          renderMobile();
        }
      }
    }, 30000);
  }

  window.togglePinMode = function(containerId, map) {
    const isPinMode = document.body.classList.toggle("pin-selection-mode");
    const overlay = document.getElementById("centerPinOverlay");
    const confirmBar = document.getElementById("pinConfirmBar");
    
    if (isPinMode) {
      if (overlay) overlay.classList.remove("hidden");
      if (confirmBar) confirmBar.classList.remove("hidden");
      // Hide live vehicles from map temporarily
      const layerGroup = state.mapLayers[containerId];
      const clusterGroup = state.mapClusters[containerId];
      if (layerGroup) map.removeLayer(layerGroup);
      if (clusterGroup) map.removeLayer(clusterGroup);
    } else {
      if (overlay) overlay.classList.add("hidden");
      if (confirmBar) confirmBar.classList.add("hidden");
      const layerGroup = state.mapLayers[containerId];
      const clusterGroup = state.mapClusters[containerId];
      if (layerGroup) layerGroup.addTo(map);
      if (clusterGroup) clusterGroup.addTo(map);
    }
  };


// === Menu tab + theme toggle ===
  // Handle theme toggle buttons
  document.querySelectorAll('#themeToggle button').forEach(btn => {
    btn.addEventListener('click', function() {
      const theme = this.getAttribute('data-theme');
      document.querySelectorAll('#themeToggle button').forEach(b => b.classList.remove('primary'));
      this.classList.add('primary');
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        // System — respect prefers-color-scheme
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
      try { localStorage.setItem('loadsense_theme', theme); } catch(e) {}
    });
  });

  // Restore saved theme
  try {
    const savedTheme = localStorage.getItem('loadsense_theme') || 'system';
    document.querySelectorAll('#themeToggle button').forEach(b => {
      b.classList.toggle('primary', b.getAttribute('data-theme') === savedTheme);
    });
    if (savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
