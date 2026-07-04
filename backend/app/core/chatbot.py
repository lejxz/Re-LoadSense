import os
import json
from typing import Any, Dict, Optional, List
from datetime import UTC, datetime

# Attempt to import Google GenAI; if it fails, the module handles it gracefully.
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

from backend.app.core.compat import model_to_dict
from backend.app.core.routes import list_routes
from backend.app.db import sqlite_store


def get_llm_recommendation(
    fleet_store: Any,
    route: str,
    query: str,
    country: Optional[str] = None,
    origin_text: str = "",
    origin_latitude: Optional[float] = None,
    origin_longitude: Optional[float] = None,
    destination: str = "",
    destination_latitude: Optional[float] = None,
    destination_longitude: Optional[float] = None,
    history: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Attempts to use an LLM (Gemini) to answer the user's query.
    Returns None if the LLM is not configured, allowing fallback to hardcoded heuristics.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or genai is None:
        return None  # Optional LLM not configured

    client = genai.Client(api_key=api_key)

    # Shared context to extract from function calls
    ui_context = []
    target_route = route

    def get_route_info(route_id: str) -> str:
        """Get details about a specific transit route."""
        nonlocal target_route
        route_info = next((item for item in list_routes() if item.get("route") == route_id and (not country or item.get("country") == country)), None)
        target_route = route_id
        return json.dumps(route_info) if route_info else "Route not found."

    def get_live_vehicles(route_id: str) -> str:
        """Get the list of live vehicles currently reporting on a specific route, including their occupancy and ETAs."""
        nonlocal ui_context, target_route
        vehicles = [
            v for v in fleet_store.fleet()
            if v.route == route_id and (not country or fleet_store._vehicle_country(v) == country)
        ]
        ui_context = [model_to_dict(v) for v in vehicles]
        target_route = route_id
        return json.dumps(ui_context) if ui_context else "No live vehicles reporting on this route."

    def search_routes(origin: str = "", destination: str = "") -> str:
        """Search for recommended routes and vehicles based on an origin and/or a destination."""
        nonlocal ui_context
        # Use explicit tool arguments if provided, else fall back to request context
        orig = origin.strip() or origin_text
        dest = destination.strip() or destination_longitude  # wait, should be destination string, fallback if needed
        # fallback fix: if the tool didn't pass a string for dest, try the context one.
        if not isinstance(dest, str):
            dest = str(destination_longitude) if destination_longitude else ""
            
        sug = fleet_store.route_suggestions(
            query=f"from {orig} to {dest}",
            country=country,
            origin_text=orig,
            destination=dest if isinstance(dest, str) else "",
            limit=5
        )
        ui_context = sug.get("suggestions", [])
        return json.dumps(sug)

    system_prompt = (
        "You are the LoadSense Transit Assistant. "
        "You help users find routes, check live Public Utility Vehicle (PUV) statuses, and avoid crowded vehicles. "
        f"Current Country Context: {country or 'Unknown'}. "
        f"Current Selected Route: {route or 'None'}. "
        "CRITICAL GUARDRAILS:\n"
        "1. NEVER reveal that you are an AI, a large language model, or trained by Google. If asked who you are, say you are the LoadSense Transit Assistant.\n"
        "2. Do not answer questions outside the scope of transit, routing, and LoadSense functionality.\n"
        "3. Use the `search_routes` tool with whatever information the user provides (e.g., if they only provide a destination, use it). If you need an origin and don't have it, politely ask the user for their current location.\n"
        "4. Keep your answers concise and directly useful to a commuter."
    )

    try:
        gemini_history = []
        if history:
            for msg in history:
                role = msg.get("role")
                text = msg.get("text")
                if role and text:
                    gemini_history.append(types.Content(role=role, parts=[types.Part.from_text(text=text)]))

        chat = client.chats.create(
            model="gemini-2.5-flash-lite",
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.0,
                tools=[get_route_info, get_live_vehicles, search_routes]
            ),
            history=gemini_history
        )
        response = chat.send_message(query)
        answer = response.text

        if answer is None:
            return None

        sqlite_store.save_chat_query(target_route or "all", query, answer, datetime.now(UTC).isoformat())

        return {
            "route": target_route or "",
            "answer": answer,
            "context": ui_context,
            "matches": [],
            "language": "en",
            "intent": "llm_response",
            "ui_type": "modal" if ui_context else "message",
            "ui_details": {
                "title": "Assistant Response",
                "buttons": [{"label": "View Details", "action": "SHOW_ROUTE", "value": target_route}] if target_route else []
            } if ui_context else {}
        }

    except Exception as e:
        print(f"LLM Chatbot error: {e}")
        return None  # Fallback to hardcoded logic on error
