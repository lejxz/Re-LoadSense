/**
 * Re-LoadSense socket.io client integration.
 * Loaded after core.js. Connects to the socket.io mini-service on port 3001
 * via the gateway XTransformPort mechanism.
 *
 * On fleet:update events, triggers the existing refreshData() function
 * so markers move smoothly (sub-3s) instead of waiting for the 3-30s poll.
 */
(function () {
  "use strict";

  // Don't run if socket.io-client isn't available
  if (typeof io === "undefined") {
    console.warn("[socket] socket.io-client not loaded — using polling only");
    return;
  }

  const SOCKET_PORT = 3001;
  let socket = null;
  let connected = false;

  function initSocket() {
    try {
      socket = io("/?XTransformPort=" + SOCKET_PORT, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
      });

      socket.on("connect", function () {
        console.log("[socket] connected:", socket.id);
        connected = true;
        socket.emit("subscribe", { role: "commuter" });
      });

      socket.on("subscribed", function (data) {
        console.log("[socket] subscribed to rooms:", data.rooms);
      });

      socket.on("fleet:update", function (data) {
        console.log("[socket] fleet:update received, tick:", data.tick);
        // Trigger the existing data refresh — this is the key integration.
        // The old JS has a refreshData() function in data.js that re-fetches
        // /api/fleet, /api/routes, /api/alerts, etc.
        if (typeof window.refreshData === "function") {
          window.refreshData();
        } else if (typeof window.LoadSense !== "undefined" && window.LoadSense.refreshData) {
          window.LoadSense.refreshData();
        } else {
          // Fallback: dispatch a custom event that core.js can listen for
          window.dispatchEvent(new CustomEvent("loadsense:fleet-update", { detail: data }));
        }
      });

      socket.on("alert:new", function (data) {
        console.log("[socket] alert:new received:", data.alertId || data.type);
        // Dispatch event for operator.js to pick up
        window.dispatchEvent(new CustomEvent("loadsense:alert-new", { detail: data }));
      });

      socket.on("disconnect", function (reason) {
        console.log("[socket] disconnected:", reason);
        connected = false;
      });

      socket.on("connect_error", function (err) {
        // Silently fall back to polling — don't spam console
        if (!connected) console.warn("[socket] connect error (using polling fallback)");
      });
    } catch (e) {
      console.warn("[socket] init failed:", e);
    }
  }

  // Initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSocket);
  } else {
    initSocket();
  }

  // Expose for debugging
  window.LoadSenseSocket = { getSocket: () => socket, isConnected: () => connected };
})();
