  async function createAlert(vehicle_id, route, message) {
    try {
      const payloadMessage = typeof message === "object" && message !== null
        ? `${message.category || "User report"}: ${message.explanation || ""}`.trim()
        : message;
      const note = payloadMessage || await confirmAction({
        title: "Flag operator incident",
        message: `Create an operator incident for ${vehicle_id} on Route ${route}?`,
        inputLabel: "Incident note",
        inputValue: `${vehicle_id} flagged by operator`,
        confirmText: "Create alert",
        danger: true,
      });
      if (!note) return false;
      const payload = {
        vehicle_id,
        route,
        message: note,
        severity: typeof message === "object" && message !== null ? (message.severity || "medium") : "medium",
      };
      const response = await fetch(api + "/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (result.alert) {
        await fetch(api + "/operator-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alert_id: result.alert.id, vehicle_id, route, action: `created: ${note}` }),
        });
      }
      await refreshData({ includeAuxiliary: false });
      if (typeof renderOperator === "function") renderOperator();
      if (typeof renderMobile === "function") renderMobile();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
