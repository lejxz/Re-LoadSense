  function cleanStopName(stopName, routeId) {
    if (!stopName) return "nearest stop";
    let normalizedStop = stopName.replace(/\s*->\s*/g, " - ");
    const rName = routeName(routeId);
    let cleaned = normalizedStop.replace(rName, "").replace(routeId, "");
    cleaned = cleaned.replace(/^[\s:\->]+/, "").trim();
    const lowerCleaned = cleaned.toLowerCase();
    if (lowerCleaned === "waypoint" || lowerCleaned === "turn" || lowerCleaned === "origin" || lowerCleaned === "end") {
      return "Intersection";
    }
    return cleaned || "nearest stop";
  }

  function renderSuggestionCard(suggestion) {
    if (suggestion.legs) {
      return `
        <article class="vehicle-card suggestion-card">
          <div class="vehicle-card-content">
            <h4>Multi-leg Trip</h4>
            <p class="route-name" style="margin-bottom: 12px;">${escapeHtml(suggestion.route_name)}</p>
            
            <div class="multi-puv-leg">
              <strong>PUV 1 - Route ${escapeHtml(suggestion.legs[0].route)}</strong>
              <div class="trip-detail-grid">
                <div style="color: var(--muted);">Board:</div> <div><strong>${escapeHtml(cleanStopName(suggestion.legs[0].boarding_stop?.name, suggestion.legs[0].route))}</strong></div>
                <div style="color: var(--muted);">Alight:</div> <div><strong>${escapeHtml(cleanStopName(suggestion.legs[0].alighting_stop?.name, suggestion.legs[0].route))}</strong></div>
                <div style="color: var(--muted);">Distance:</div> <div>First leg</div>
                <div style="color: var(--muted);">ETA to you:</div> <div>~${Math.round(Number(suggestion.eta_minutes || 0))} min</div>
                <div style="color: var(--muted);">Fare:</div> <div>Included below</div>
              </div>
            </div>
            
            <div class="multi-puv-leg">
              <strong>PUV 2 - Route ${escapeHtml(suggestion.legs[1].route)}</strong>
              <div class="trip-detail-grid">
                <div style="color: var(--muted);">Board:</div> <div><strong>${escapeHtml(cleanStopName(suggestion.legs[1].boarding_stop?.name, suggestion.legs[1].route))}</strong></div>
                <div style="color: var(--muted);">Alight:</div> <div><strong>${escapeHtml(cleanStopName(suggestion.legs[1].alighting_stop?.name, suggestion.legs[1].route))}</strong></div>
                <div style="color: var(--muted);">Distance:</div> <div>Transfer + final leg</div>
                <div style="color: var(--muted);">ETA to you:</div> <div>After transfer</div>
                <div style="color: var(--muted);">Fare:</div> <div>Included below</div>
              </div>
            </div>

            <div class="trip-detail-grid">
                <div style="color: var(--muted);">Distance:</div> <div>${Number(suggestion.distance_km || 0).toFixed(1)} km</div>
                <div style="color: var(--muted);">ETA to you:</div> <div>~${Math.round(Number(suggestion.eta_minutes || 0))} min</div>
                <div style="color: var(--muted);">Fare:</div> <div>PHP ${escapeHtml(suggestion.fare_pesos || "--")}</div>
            </div>
          </div>
          <div class="vehicle-card-actions">
            <span class="occupancy-pill ${tierClass(suggestion.tier)}">${tierLabel(suggestion.tier)}</span>
          </div>
        </article>
      `;
    }
    const rName = suggestion.route_name || routeName(suggestion.route);
    const bName = normalizeStopLabel(suggestion.boarding_stop, cleanStopName(suggestion.boarding_stop?.name, suggestion.route));
    const aName = normalizeStopLabel(suggestion.alighting_stop, cleanStopName(suggestion.alighting_stop?.name, suggestion.route));
    const boardCoords = formatStopCoords(suggestion.boarding_stop);
    const alightCoords = formatStopCoords(suggestion.alighting_stop);
    return `
      <article class="vehicle-card suggestion-card">
        <div class="vehicle-card-content">
          <h4>Route ${escapeHtml(suggestion.route)} <span style="font-size: 14px; font-weight: 600; color: var(--muted);">${escapeHtml(suggestion.vehicle_id)}</span></h4>
          <p class="route-name" style="margin-bottom: 12px;">${escapeHtml(rName)}</p>
          
          <ul class="route-stops-timeline" style="margin-bottom: 16px; margin-left: 4px;">
            <li><span class="stop-dot" style="background: var(--teal); border-color: var(--teal);"></span>Board: <strong>${escapeHtml(bName || "nearest stop")}</strong></li>
            <li><span class="stop-dot" style="background: var(--destructive, #ef4444); border-color: var(--destructive, #ef4444);"></span>Alight: <strong>${escapeHtml(aName || "destination")}</strong></li>
          </ul>

          <div class="trip-detail-grid">
            <div style="color: var(--muted);">Distance:</div> <div>${Number(suggestion.distance_km || 0).toFixed(1)} km</div>
            <div style="color: var(--muted);">Applicability:</div> <div>${Math.round(Number(suggestion.route_applicability || 0) * 100)}%</div>
            <div style="color: var(--muted);">ETA to you:</div> <div>~${Math.round(Number(suggestion.eta_minutes || 0))} min</div>
            <div style="color: var(--muted);">Fare:</div> <div>PHP ${escapeHtml(suggestion.fare_pesos || "--")}</div>
          </div>
        </div>
        <div class="vehicle-card-actions">
          <span class="occupancy-pill ${tierClass(suggestion.tier)}">${tierLabel(suggestion.tier)}</span>
          <button class="mini-action zoom-btn" data-zoom-vehicle="${escapeHtml(suggestion.vehicle_id)}" title="Zoom on Map" aria-label="Zoom on Map">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
          </button>
        </div>
      </article>
    `;
  }

  function normalizeSearch(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function formatPlaceTitle(place) {
    let title = place.name;
    if (place.city && place.city.toLowerCase() !== place.name.toLowerCase()) {
      title += `, ${place.city}`;
    }
    return title;
  }

  function formatPlaceSubtitle(place) {
    let raw = String(place?.subtitle || place?.address_text || place?.city || place?.country || '').trim();
    let parts = raw.split(',').map(p => p.trim()).filter(Boolean);
    
    if (place.city && place.city.toLowerCase() !== place.name.toLowerCase()) {
      parts = parts.filter(p => p.toLowerCase() !== place.city.toLowerCase());
    }
    
    if (parts.length > 1) {
      parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      return `${parts[0]} • ${parts.slice(1).join(', ')}`;
    } else if (parts.length === 1) {
      parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      return parts[0];
    }
    return raw;
  }

  function getPlaceIcon(place) {
    const kind = String(place?.kind || place?.osm_value || '').toLowerCase();
    const source = String(place?.source || '').toLowerCase();
    if (source === 'route_stop') return '🚏';
    if (['city', 'town', 'municipality', 'administrative'].includes(kind)) return '🏢';
    if (['village', 'suburb', 'residential', 'neighbourhood'].includes(kind)) return '🏘️';
    if (['terminal', 'station', 'bus_stop'].includes(kind)) return '🚌';
    if (['commercial', 'retail', 'mall'].includes(kind)) return '🛒';
    if (['school', 'university', 'college'].includes(kind)) return '🎓';
    return '📍';
  }

  function renderPlaceResults(inputId, panelId, exactMatches = null) {
    const input = qs(inputId);
    const panel = qs(panelId);
    if (!input || !panel) return;
    const isOrigin = inputId === 'originInput';
    
    let sourceList = exactMatches || [];
    const matches = sourceList.filter(place => place && place.name).slice(0, 8);

    if (!matches.length && !isOrigin) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    panel.classList.remove('hidden');

    let html = '';
    if (isOrigin) {
      html += `
        <button type="button" data-use-location="true" class="use-location-btn">
          <strong>📍 Use my location</strong>
        </button>
      `;
    }
    html += matches.map((place, index) => `
      <button type="button" class="${index === 0 ? 'active' : ''} place-result-btn" data-place-name="${escapeHtml(place.name)}" data-city="${escapeHtml(place.city || '')}" data-lat="${place.latitude || ''}" data-lon="${place.longitude || ''}" title="${escapeHtml(place.name)}">
        <span class="place-icon">${getPlaceIcon(place)}</span>
        <div class="place-text-stack">
          <strong>${escapeHtml(formatPlaceTitle(place))}</strong>
          <span alt="${escapeHtml(formatPlaceSubtitle(place))}">${escapeHtml(formatPlaceSubtitle(place))}</span>
        </div>
      </button>
    `).join('');

    panel.innerHTML = html;

    const useLocBtn = panel.querySelector('[data-use-location]');
    if (useLocBtn) {
      useLocBtn.addEventListener('click', () => {
        input.value = '';
        state.usingCurrentLocation = true;
        input.blur();
        input.dispatchEvent(new Event('change'));
        panel.classList.add('hidden');
        panel.innerHTML = '';
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(pos => {
            state.lastPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            if (typeof renderMobile === 'function') renderMobile();
          }, () => {
            if (typeof showToast === 'function') showToast('Location access denied.');
          });
        }
        updateOriginPlaceholder();
      });
    }

    panel.querySelectorAll('[data-place-name]').forEach(button => {
      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = button.dataset.placeName;
        if (isOrigin) {
          state.usingCurrentLocation = false;
          if (button.dataset.lat && button.dataset.lon) {
            state.selectedOrigin = {
              name: button.dataset.placeName,
              city: button.dataset.city,
              latitude: Number(button.dataset.lat),
              longitude: Number(button.dataset.lon),
            };
          }
          updateOriginPlaceholder();
        } else if (button.dataset.lat && button.dataset.lon) {
          state.selectedDestination = {
            name: button.dataset.placeName,
            city: button.dataset.city,
            latitude: Number(button.dataset.lat),
            longitude: Number(button.dataset.lon),
          };
          if (typeof requestTripSuggestions === 'function') {
            requestTripSuggestions(button.dataset.placeName);
          } else {
            if (typeof renderDestinationConfirm === 'function') renderDestinationConfirm();
            if (typeof renderMobile === 'function') renderMobile();
          }
        }
        input.blur();
        input.dispatchEvent(new Event('change', { bubbles: true }));
        panel.classList.add('hidden');
        panel.innerHTML = '';
      });
    });
  }

  function updateOriginPlaceholder() {
    const isUsingLoc = state.usingCurrentLocation;
    const el = qs('originInput');
    if (!el) return;
    el.placeholder = isUsingLoc ? '📍 Using your location' : 'Origin';
  }

  const placeSearchSeq = {};

  async function fetchPlaces(query) {
    const params = new URLSearchParams({ q: query, limit: '8', remote: 'true' });
    if (state.countryFilter && state.countryFilter !== "all") {
      params.set("country", state.countryFilter);
    }
    const result = await getJson(`/places?${params.toString()}`);
    return result.places || [];
  }

  function bindPlaceSearch(inputId, panelId) {
    const input = qs(inputId);
    if (!input) return;
    input.addEventListener('input', () => {
      if (inputId === 'originInput') state.selectedOrigin = null;
      if (inputId === 'destinationInput') state.selectedDestination = null;
      renderPlaceResults(inputId, panelId);
      clearTimeout(state.placeSearchTimers[inputId]);
      state.placeSearchTimers[inputId] = setTimeout(async () => {
        const query = input.value.trim();
        if (query.length < 2) return;
        placeSearchSeq[inputId] = (placeSearchSeq[inputId] || 0) + 1;
        const seq = placeSearchSeq[inputId];
        try {
          const apiPlaces = await fetchPlaces(query);
          if (seq !== placeSearchSeq[inputId] || document.activeElement !== input) return;
          renderPlaceResults(inputId, panelId, apiPlaces);
        } catch (error) {
          if (document.activeElement === input) renderPlaceResults(inputId, panelId);
        }
      }, 400);
    });
    input.addEventListener('focus', () => renderPlaceResults(inputId, panelId));
    input.addEventListener('blur', () => {
      setTimeout(() => qs(panelId)?.classList.add('hidden'), 140);
    });
  }

  function queryNeedsRouteSearch(query, destination) {
    const text = `${query || ""} ${destination || ""}`.toLowerCase();
    return Boolean(destination) || /(get to|go to|reach|route to|going to|towards?|papunta|paingon|padung|pakadto|mapan|llegar|hacia)/i.test(text);
  }

  function queryUsesChatRouteContext(query) {
    const text = String(query || "").toLowerCase();
    return /(that route|this route|current route|selected route|in that route|in this route|explain this route|what is this route|which do i ride|which should i ride|which jeepney do i ride)/.test(text);
  }

  function queryLooksLikeFreshTrip(query) {
    const text = String(query || "").toLowerCase();
    return /(get to|go to|reach|route to|going to|need to go|destination|from|currently located|current location|papunta|paingon|padung|pakadto)/.test(text);
  }

  function buildTripPayload(query = "", options = {}) {
    const activeOriginInput = qs("originInput");
    const activeDestInput = qs("destinationInput");
    state.originInput = activeOriginInput?.value.trim() || "Current Location";
    state.destinationInput = activeDestInput?.value.trim() || "";
    const chatMode = options.chat === true;
    const useRouteContext = chatMode && queryUsesChatRouteContext(query);
    const freshTrip = chatMode && queryLooksLikeFreshTrip(query);
    const payloadOrigin = chatMode && freshTrip ? "" : state.originInput;
    const payloadDestination = chatMode ? "" : state.destinationInput;
    const dynamicRouteSearch = queryNeedsRouteSearch(query, payloadDestination);
    const payload = {
      route: useRouteContext ? (state.chatContext.route || state.selectedRoute) : (dynamicRouteSearch || chatMode ? "" : state.selectedRoute),
      query,
      country: state.countryFilter && state.countryFilter !== "all" ? state.countryFilter : "",
      origin: payloadOrigin,
      destination: payloadDestination,
      limit: 6,
      history: chatMode ? state.chatHistory : undefined,
    };
    
    // Priority 1: Exact selected coordinates from dropdown
    // Priority 2: Fuzzy match from local ranked places
    if (state.selectedOrigin && payloadOrigin.toLowerCase() === (state.selectedOrigin.name || "").toLowerCase()) {
      payload.origin_latitude = state.selectedOrigin.latitude;
      payload.origin_longitude = state.selectedOrigin.longitude;
    }
    
    if (!payload.origin_latitude && state.lastPosition && (!payloadOrigin || state.usingCurrentLocation || /current location|my location|here/i.test(payloadOrigin))) {
      payload.origin_latitude = state.lastPosition.latitude;
      payload.origin_longitude = state.lastPosition.longitude;
    }

    if (state.selectedDestination && payloadDestination.toLowerCase() === (state.selectedDestination.name || "").toLowerCase()) {
      payload.destination_latitude = state.selectedDestination.latitude;
      payload.destination_longitude = state.selectedDestination.longitude;
      if (!payload.destination) payload.destination = state.selectedDestination.name || "";
    }
    
    return payload;
  }

  function syncTripResult(result) {
    state.tripSuggestions = result?.suggestions || result?.context || [];
    state.tripMatches = result?.matches || [];
    state.tripMessage = result?.answer || "";
    state.tripNoRouteFound = result?.no_route_found === true;
    if (result?.destination && isMapCoordinate(result.destination)) {
      state.selectedDestination = {
        latitude: Number(result.destination.latitude),
        longitude: Number(result.destination.longitude),
        name: result.destination.name,
      };
    }
    const nextRoute = state.tripSuggestions[0]?.route || state.tripMatches[0]?.route;
    if (nextRoute) {
      state.selectedRoute = nextRoute;
    }
    if (nextRoute || state.tripSuggestions[0]?.vehicle_id) {
      state.chatContext.route = nextRoute || state.chatContext.route;
      state.chatContext.vehicleId = state.tripSuggestions[0]?.vehicle_id || state.chatContext.vehicleId;
    }
  }

  function syncChatResult(result) {
    const tripLike = Boolean(result?.destination || (result?.matches || []).length || (result?.context || [])[0]?.boarding_stop);
    if (tripLike) {
      syncTripResult(result);
      return;
    }
    const firstVehicle = (result?.context || []).find(item => item.vehicle_id && item.route);
    if (firstVehicle) {
      state.chatContext.route = firstVehicle.route;
      state.chatContext.vehicleId = firstVehicle.vehicle_id;
    } else if (result?.route && result.route !== "all") {
      state.chatContext.route = result.route;
    }
  }

  function renderBotMessage(result) {
    const firstVehicle = (result?.context || []).find(item => item.vehicle_id && item.route);
    const routeId = firstVehicle?.route || (result?.route && result.route !== "all" ? result.route : state.chatContext.route);
    
    let cardsHtml = "";
    if (result?.context && result.context.length > 0 && result.context[0].boarding_stop) {
        cardsHtml = result.context.slice(0, 1).map(sug => renderSuggestionCard(sug)).join("");
    }

    let innerContent = "";

    if (result?.ui_type === "modal") {
        const details = result.ui_details || {};
        const title = details.title || "Information";
        const dynamicButtons = (details.buttons || []).map(btn => {
            let actionAttr = "";
            if (btn.action === "SHOW_ROUTE") actionAttr = `data-chat-route="${escapeHtml(btn.value)}"`;
            else if (btn.action === "ZOOM_VEHICLE") actionAttr = `data-chat-zoom="${escapeHtml(btn.value)}"`;
            else if (btn.action === "SUGGEST_ROUTE") actionAttr = `data-chat-suggest="${escapeHtml(btn.value)}"`;
            return `<button class="mini-action primary-action" style="margin-right: 8px; font-weight: 600;" ${actionAttr} type="button">${escapeHtml(btn.label)}</button>`;
        }).join("");

        innerContent = `
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div style="background: var(--teal, #0f172a); color: white; padding: 10px 14px; font-weight: 600; font-size: 14px;">
                    ${escapeHtml(title)}
                </div>
                <div style="padding: 14px; font-size: 14px; color: var(--ink, #1e293b);">
                    <p style="margin: 0 0 12px 0;">${escapeHtml(result?.answer || "")}</p>
                    ${cardsHtml ? `<div class="chat-cards" style="margin-bottom: 12px;">${cardsHtml}</div>` : ""}
                    ${dynamicButtons ? `<div style="border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 8px;">${dynamicButtons}</div>` : ""}
                </div>
            </div>
        `;
    } else {
        const actions = [];
        const canZoom = ["boarding", "trip_recommendation"].includes(result?.intent) || (result?.intent === "llm_response" && firstVehicle);
        if (canZoom && firstVehicle?.vehicle_id) {
          actions.push(`<button class="mini-action" data-chat-zoom="${escapeHtml(firstVehicle.vehicle_id)}" type="button">Zoom PUV</button>`);
        }
        
        const hideRouteButton = ["smalltalk"].includes(result?.intent) || (result?.intent === "llm_response" && result?.ui_type === "message");
        if (routeId && !hideRouteButton) {
          actions.push(`<button class="mini-action" data-chat-route="${escapeHtml(routeId)}" type="button">Show route</button>`);
        }

        innerContent = `
          <p>${escapeHtml(result?.answer || "I could not answer that yet.")}</p>
          ${actions.length ? `<div class="chat-actions">${actions.join("")}</div>` : ""}
          ${cardsHtml ? `<div class="chat-cards">${cardsHtml}</div>` : ""}
        `;
    }

    return `
      <div class="message-wrapper bot-wrapper">
        <div class="bot-avatar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        </div>
        <div class="message bot" style="max-width: 90%; ${result?.ui_type === 'modal' ? 'padding: 0; background: transparent; box-shadow: none;' : ''}">
          ${innerContent}
        </div>
      </div>
    `;
  }

  function bindChatActions(scope) {
    scope.querySelectorAll("[data-chat-zoom]").forEach(button => {
      button.addEventListener("click", () => {
        activateMobileTab("mapTab");
        if (typeof zoomVehicle === "function") zoomVehicle(button.dataset.chatZoom);
      });
    });
    scope.querySelectorAll("[data-chat-route]").forEach(button => {
      button.addEventListener("click", () => {
        state.selectedRoute = button.dataset.chatRoute;
        activateMobileTab("mapTab");
        if (typeof previewRoute === "function") previewRoute(button.dataset.chatRoute, "mobileMap");
      });
    });
    scope.querySelectorAll("[data-chat-suggest]").forEach(button => {
      button.addEventListener("click", () => {
        state.selectedRoute = button.dataset.chatSuggest;
        activateMobileTab("mapTab");
        if (typeof previewRoute === "function") previewRoute(state.selectedRoute, "mobileMap");
      });
    });
  }

