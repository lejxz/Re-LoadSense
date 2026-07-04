import json
import requests
from datetime import UTC, datetime
from typing import Any, Dict, Optional, List

from backend.app.core.compat import model_to_dict
from backend.app.core.routes import list_routes
from backend.app.db import sqlite_store

OLLAMA_API_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "llama3.2:3b"

def get_ollama_recommendation(
    fleet_store: Any,
    route: str,
    query: str,
    country: str | None = None,
    origin_text: str = "",
    origin_latitude: Optional[float] = None,
    origin_longitude: Optional[float] = None,
    destination: str = "",
    destination_latitude: Optional[float] = None,
    destination_longitude: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    
    ui_context = []
    target_route = route
    target_origin = origin_text
    target_destination = destination

    def get_route_info(route_id: str) -> str:
        nonlocal target_route
        route_info = next((item for item in list_routes() if item.get("route") == route_id and (not country or item.get("country") == country)), None)
        target_route = route_id
        return json.dumps(route_info) if route_info else "Route not found."

    def get_live_vehicles(route_id: str) -> str:
        nonlocal ui_context, target_route
        vehicles = [
            v for v in fleet_store.fleet()
            if v.route == route_id and (not country or fleet_store._vehicle_country(v) == country)
        ]
        ui_context = [model_to_dict(v) for v in vehicles]
        target_route = route_id
        return json.dumps(ui_context) if ui_context else "No live vehicles reporting on this route."

    def search_routes(origin: str = "", destination_str: str = "") -> str:
        nonlocal ui_context, target_origin, target_destination
        orig = origin.strip() or origin_text
        dest = destination_str.strip() or destination
        
        target_origin = orig
        target_destination = dest
            
        sug = fleet_store.route_suggestions(
            query=f"from {orig} to {dest}",
            country=country,
            origin_text=orig,
            destination=dest,
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
        "1. NEVER reveal that you are an AI. If asked who you are, say you are the LoadSense Transit Assistant.\n"
        "2. Do not answer questions outside the scope of transit, routing, and LoadSense functionality.\n"
        "3. ALWAYS use the `search_routes` tool immediately if the user mentions a place they want to go to or depart from. DO NOT ask for their location unless they provided no places at all, or if the tool returns no results.\n"
        "4. Keep your answers concise and directly useful to a commuter."
    )

    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_route_info",
                "description": "Get details about a specific transit route.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "route_id": {"type": "string", "description": "The ID of the route"}
                    },
                    "required": ["route_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_live_vehicles",
                "description": "Get the list of live vehicles currently reporting on a specific route, including their occupancy and ETAs.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "route_id": {"type": "string", "description": "The ID of the route"}
                    },
                    "required": ["route_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search_routes",
                "description": "Search for recommended routes and vehicles based on an origin and/or a destination.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "origin": {"type": "string", "description": "The starting location"},
                        "destination_str": {"type": "string", "description": "The place the user wants to go to"}
                    }
                }
            }
        }
    ]

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": query}
    ]

    try:
        # Step 1: Send query with tools
        response = requests.post(
            OLLAMA_API_URL,
            json={
                "model": MODEL_NAME,
                "messages": messages,
                "tools": tools,
                "stream": False,
                "options": {
                    "temperature": 0.0
                }
            },
            timeout=30
        )
        response.raise_for_status()
        result = response.json()
        message = result.get("message", {})

        # Step 2: Process tool calls if any
        if message.get("tool_calls"):
            messages.append(message)
            for tool_call in message["tool_calls"]:
                name = tool_call["function"]["name"]
                args = tool_call["function"]["arguments"]
                
                try:
                    if name == "get_route_info":
                        func_result = get_route_info(args.get("route_id", ""))
                    elif name == "get_live_vehicles":
                        func_result = get_live_vehicles(args.get("route_id", ""))
                    elif name == "search_routes":
                        func_result = search_routes(args.get("origin") or "", args.get("destination_str") or "")
                    else:
                        func_result = "Unknown tool."
                except Exception as e:
                    func_result = f"Error executing tool: {e}"
                
                messages.append({
                    "role": "tool",
                    "content": str(func_result)
                })
            
            # Step 3: Get final answer from LLM
            response = requests.post(
                OLLAMA_API_URL,
                json={
                    "model": MODEL_NAME,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "temperature": 0.0
                    }
                },
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            message = result.get("message", {})
            
        answer = message.get("content", "")

        if not answer:
            return None

        sqlite_store.save_chat_query(target_route or "all", query, answer, datetime.now(UTC).isoformat())

        return {
            "route": target_route or "",
            "answer": answer,
            "context": ui_context,
            "origin": target_origin,
            "destination": target_destination,
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
        print(f"Ollama Chatbot error: {e}")
        return None  # Fallback to the hardcoded heuristics if Ollama is down
