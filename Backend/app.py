"""
AIRA OS — FastAPI Backend
Converted from Streamlit app.py
Run with: uvicorn main:app --reload --port 8000
"""

import asyncio
import json
import random
import time
from typing import Dict, List, Optional, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# ─────────────────────────────────────────────────────────────────────────────
# PYDANTIC SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class PrescriptiveRepair(BaseModel):
    rootCause: str = Field(description="The engineering root cause of the failure")
    partsNeeded: List[str] = Field(description="List of required parts from the WMS inventory")

class Action(BaseModel):
    id: str = Field(description="Unique ID for the action, like ACT-1")
    type: str = Field(description="One of: MAINTENANCE, ORDER_PARTS, ECO_MODE, SHUTDOWN")
    target: str = Field(description="The Machine ID or Inventory Part ID")
    title: str = Field(description="Short concise title of the action")
    reason: str = Field(description="Why this action is needed")
    confidence: float = Field(description="Confidence from 0.0 to 1.0. If >= 0.85, it is auto-eligible")
    impact: str = Field(description="What will happen after this is executed (e.g. saves $24k)")
    thoughtProcess: List[str] = Field(description="Logs from the multi-agent consensus.")
    prescriptiveRepair: Optional[PrescriptiveRepair] = None

class MultiAgentOutput(BaseModel):
    summary: str = Field(description="Overall consensus summary")
    overallStatus: str = Field(description="One of: NORMAL, WARNING, CRITICAL")
    riskScore: int = Field(description="0 to 100")
    actions: List[Action]

class AnalyzeRequest(BaseModel):
    api_key: str = Field(description="Google AI Studio Gemini API key")

class ApproveRequest(BaseModel):
    action_id: str
    action_type: str
    target: str

# ─────────────────────────────────────────────────────────────────────────────
# MACHINE & ROUTE CONFIG  (identical to Streamlit version)
# ─────────────────────────────────────────────────────────────────────────────

MACHINES = [
    {"id": "CNC-01",  "name": "CNC Mill #1",      "type": "CNC",       "zone": "A", "bTemp": 74, "bVib": 3.4, "bPres": 43,  "bRPM": 3200, "bKW": 45, "bCO2": 12, "deg": True,  "x": 20, "y": 70},
    {"id": "CNC-02",  "name": "CNC Mill #2",      "type": "CNC",       "zone": "A", "bTemp": 67, "bVib": 2.7, "bPres": 40,  "bRPM": 3100, "bKW": 42, "bCO2": 11, "deg": False, "x": 20, "y": 30},
    {"id": "ROB-A",   "name": "Robot Arm A",      "type": "Robot",     "zone": "B", "bTemp": 54, "bVib": 1.1, "bPres": 27,  "bRPM": 900,  "bKW": 14, "bCO2": 3,  "deg": False, "x": 50, "y": 70},
    {"id": "ROB-B",   "name": "Robot Arm B",      "type": "Robot",     "zone": "B", "bTemp": 59, "bVib": 4.2, "bPres": 31,  "bRPM": 960,  "bKW": 18, "bCO2": 4,  "deg": True,  "x": 50, "y": 30},
    {"id": "CONV-1",  "name": "Conveyor Belt",    "type": "Conveyor",  "zone": "C", "bTemp": 44, "bVib": 0.9, "bPres": 14,  "bRPM": 445,  "bKW": 35, "bCO2": 8,  "deg": False, "x": 80, "y": 50},
    {"id": "HYDR-1",  "name": "Hydraulic Press",  "type": "Hydraulic", "zone": "D", "bTemp": 88, "bVib": 5.8, "bPres": 192, "bRPM": 175,  "bKW": 75, "bCO2": 24, "deg": True,  "x": 80, "y": 15},
]

THRESHOLDS = {
    "CNC":       {"temp": [80,  92],  "vib": [5,   7],   "pres": [48,  56],  "rpm": [2600, 3700]},
    "Robot":     {"temp": [65,  78],  "vib": [2.5, 4],   "pres": [35,  45],  "rpm": [700,  1200]},
    "Conveyor":  {"temp": [55,  68],  "vib": [1.5, 2.5], "pres": [18,  24],  "rpm": [380,  560]},
    "Hydraulic": {"temp": [95,  110], "vib": [6,   9],   "pres": [210, 240], "rpm": [130,  260]},
}

ROUTES = [
    {"id": "R-01", "from": "Warehouse A",  "to": "Factory Floor",   "dist": 2.3,  "vehicles": 4, "bEff": 91},
    {"id": "R-02", "from": "Port B",       "to": "Warehouse A",     "dist": 45,   "vehicles": 2, "bEff": 78},
    {"id": "R-03", "from": "Factory",      "to": "Distribution C",  "dist": 12,   "vehicles": 6, "bEff": 85},
]

# ─────────────────────────────────────────────────────────────────────────────
# SHARED SIMULATION STATE  (replaces st.session_state)
# ─────────────────────────────────────────────────────────────────────────────

class SimState:
    def __init__(self):
        self.tick: int = 0
        self.m_states: Dict  = {}
        self.r_states: Dict  = {}
        self.inventory: Dict = {
            "Bearing-702": 4,
            "HydraulicFluid-L": 12,
            "SensorMount": 0,
            "DriveBelt": 2,
        }
        self.maintenance: Set[str] = set()
        self.alerts: List[str]     = []
        self.events: List[str]     = []
        self.savings: int          = 0
        self.agent_result: Optional[Dict] = None
        self.fleet_trend: List[Dict] = [
            {"t": i, "Avg Health": 85.0 + (random.random() - 0.5) * 10}
            for i in range(15)
        ]
        self.history: Dict = {m["id"]: [] for m in MACHINES}

state = SimState()

# ─────────────────────────────────────────────────────────────────────────────
# SIMULATION LOGIC  (identical math to Streamlit version)
# ─────────────────────────────────────────────────────────────────────────────

def _noise(base: float, spread: float) -> float:
    return base + (random.random() - 0.5) * spread

def _score_metric(val: float, warn: float, crit: float) -> int:
    if val <= warn: return 100
    if val >= crit: return 0
    return max(0, int(100 - ((val - warn) / (crit - warn)) * 100))

def simulate_machines() -> None:
    """One simulation tick — updates state.m_states and state.r_states."""
    new_states: Dict = {}
    tick = state.tick

    for m in MACHINES:
        mid = m["id"]
        if mid in state.maintenance:
            new_states[mid] = {
                "temp":   round(_noise(m["bTemp"] - 3, 0.5), 1),
                "vib":    round(m["bVib"] * 0.3, 2),
                "pres":   m["bPres"],
                "rpm":    0,
                "kw":     0.5,
                "co2":    0.0,
                "health": 100,
                "status": "MAINTENANCE",
                "x":      m["x"],
                "y":      m["y"],
                "zone":   m["zone"],
                "name":   m["name"],
                "type":   m["type"],
            }
        else:
            deg = tick if m["deg"] else 0
            t   = THRESHOLDS[m["type"]]
            temp  = round(max(m["bTemp"] - 5, m["bTemp"] + 0.08 * deg * 0.04 * 100 + _noise(0, 2.5)), 1)
            vib   = round(max(0.1, m["bVib"]  + 0.04 * deg * 0.04 * 100 + _noise(0, 0.5)), 2)
            pres  = round(_noise(m["bPres"], 6 if m["type"] == "Hydraulic" else 2), 1)
            rpm   = round(_noise(m["bRPM"], m["bRPM"] * 0.04), 0)
            kw    = round(_noise(m["bKW"] + (deg * 0.05), 1.5), 1)
            co2   = round(_noise(m["bCO2"] + (deg * 0.01), 0.5), 2)

            ts   = _score_metric(temp, t["temp"][0], t["temp"][1])
            vs   = _score_metric(vib,  t["vib"][0],  t["vib"][1])
            ps   = _score_metric(pres, t["pres"][0], t["pres"][1])
            rs   = _score_metric(rpm,  t["rpm"][0],  t["rpm"][1])
            hlth = int(ts * 0.3 + vs * 0.35 + ps * 0.2 + rs * 0.15)

            st_val = "NORMAL"
            if hlth < 50:   st_val = "CRITICAL"
            elif hlth < 75: st_val = "WARNING"

            old_st = state.m_states.get(mid, {}).get("status", "NORMAL")
            if st_val != "NORMAL" and st_val != old_st and st_val != "MAINTENANCE":
                state.alerts.insert(
                    0, f"[{time.strftime('%H:%M:%S')}] {mid} dropped to {st_val} ({hlth}% Health)"
                )

            new_states[mid] = {
                "temp": temp, "vib": vib, "pres": pres,
                "rpm": rpm,   "kw": kw,   "co2": co2,
                "health": hlth, "status": st_val,
                "x":    m["x"],  "y":    m["y"],
                "zone": m["zone"], "name": m["name"], "type": m["type"],
            }

    state.m_states = new_states

    for mid, s in new_states.items():
        state.history[mid].append({"t": tick, "health": s["health"]})
        if len(state.history[mid]) > 30:
            state.history[mid].pop(0)

    new_r: Dict = {}
    for r in ROUTES:
        new_r[r["id"]] = {
            "eff":   max(30, min(99, r["bEff"] + _noise(0, 8))),
            "delay": max(0, _noise(12, 15)),
        }
    state.r_states = new_r

    # Fleet trend
    all_health = [s["health"] for s in new_states.values() if s["health"] >= 0]
    avg_h = sum(all_health) / len(all_health) if all_health else 100
    state.fleet_trend.append({"t": tick, "Avg Health": round(avg_h, 1)})
    if len(state.fleet_trend) > 20:
        state.fleet_trend.pop(0)

# ─────────────────────────────────────────────────────────────────────────────
# GEMINI MULTI-AGENT LOGIC
# ─────────────────────────────────────────────────────────────────────────────

def _run_simulated_agent() -> Dict:
    """Fallback mock response when no API key is supplied."""
    critical_machine = next(
        (mid for mid, s in state.m_states.items() if s["status"] == "CRITICAL"),
        None,
    )
    low_part = next((k for k, v in state.inventory.items() if v <= 2), None)

    result: Dict = {
        "summary": f"MOCKED FALLBACK: Diagnostic confirmed anomalies on {critical_machine or 'fleet'}. Logistics analyzed WMS inventory.",
        "overallStatus": "CRITICAL" if critical_machine else "WARNING",
        "riskScore": 88 if critical_machine else 45,
        "actions": [],
    }

    if critical_machine:
        result["actions"].append({
            "id":         f"ACT-{int(time.time())}",
            "type":       "MAINTENANCE",
            "target":     critical_machine,
            "title":      "Autonomous Repair Protocol",
            "reason":     "Vibration harmonics threshold exceeded.",
            "confidence": 0.92,
            "impact":     "+15% OEE, saves $24k downtime.",
            "thoughtProcess": [
                "Diagnostic Agent: Thermal & Vibration anomalies localized to spindle.",
                "Orchestrator Agent: Confidence exceeds 0.85 Auto-Execute threshold. Initiating.",
            ],
            "prescriptiveRepair": None,
        })

    if low_part:
        result["actions"].append({
            "id":         f"ACT-{int(time.time()) + 1}",
            "type":       "ORDER_PARTS",
            "target":     low_part,
            "title":      f"Restock {low_part}",
            "reason":     "WMS inventory critically low.",
            "confidence": 0.78,
            "impact":     "Prevents production stoppage.",
            "thoughtProcess": [
                f"Logistics Agent: {low_part} stock at critical level.",
                "Orchestrator Agent: Initiating emergency PO.",
            ],
            "prescriptiveRepair": None,
        })

    return result


async def run_multi_agent(api_key: str) -> Dict:
    """
    Calls Gemini 2.5 Flash with structured output (MultiAgentOutput schema).
    Falls back to mock if no key is provided or the API call fails.
    """
    context = {
        "machines":  state.m_states,
        "inventory": state.inventory,
        "routes":    state.r_states,
    }

    system_prompt = (
        "You are the Orchestrator Agent of an Industrial AI System. "
        "You oversee two sub-agents: Diagnostic Agent (analyzes sensor telemetry and power) "
        "and Logistics Agent (analyzes inventory and route delays). "
        "Given the following real-time JSON context of the factory, generate a multi-agent "
        "prescriptive response. Include energy efficiency recommendations. "
        "You MUST output strictly in the requested JSON schema."
    )
    user_prompt = f"Real-time Factory Context:\n{json.dumps(context)}"

    if not api_key:
        return _run_simulated_agent()

    try:
        client   = genai.Client(api_key=api_key)
        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-flash",
            contents=[system_prompt, user_prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=MultiAgentOutput,
                temperature=0.2,
            ),
        )
        return json.loads(response.text)

    except Exception as exc:
        print(f"[Gemini Error] {exc}")
        return _run_simulated_agent()

# ─────────────────────────────────────────────────────────────────────────────
# WEBSOCKET CONNECTION MANAGER
# ─────────────────────────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)
        print(f"[WS] Client connected. Total: {len(self.active)}")

    def disconnect(self, ws: WebSocket) -> None:
        self.active.remove(ws)
        print(f"[WS] Client disconnected. Total: {len(self.active)}")

    async def broadcast(self, payload: dict) -> None:
        """Send JSON payload to every connected client, drop broken sockets."""
        dead: List[WebSocket] = []
        for ws in self.active:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.remove(ws)

manager = ConnectionManager()

# ─────────────────────────────────────────────────────────────────────────────
# BACKGROUND SIMULATION LOOP
# ─────────────────────────────────────────────────────────────────────────────

async def simulation_loop() -> None:
    """Runs every 2 seconds: tick the sim, broadcast telemetry to all WS clients."""
    # Warm-up tick so state is never empty on first request
    simulate_machines()
    print("[Sim] Background simulation loop started.")

    while True:
        await asyncio.sleep(2)
        state.tick += 1
        simulate_machines()

        # Build the broadcast payload
        payload = {
            "tick":        state.tick,
            "m_states":    state.m_states,
            "r_states":    state.r_states,
            "inventory":   state.inventory,
            "alerts":      state.alerts[:10],       # last 10 alerts
            "events":      state.events[-10:],      # last 10 events
            "savings":     state.savings,
            "fleet_trend": state.fleet_trend[-20:],
            "global_emergency": any(
                s["status"] == "CRITICAL" for s in state.m_states.values()
            ),
        }
        await manager.broadcast(payload)

# ─────────────────────────────────────────────────────────────────────────────
# FASTAPI APP
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="AIRA OS API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    # Update this list with your actual Render URL before deploying
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://your-frontend.onrender.com",   # ← replace with real URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Launch the background simulation loop when the server starts."""
    asyncio.create_task(simulation_loop())
    print("[AIRA OS] API ready.")


# ─── REST ENDPOINTS ───────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "AIRA OS online", "tick": state.tick}


@app.get("/telemetry")
async def get_telemetry():
    """
    HTTP snapshot of current telemetry.
    Useful for the initial page load before the WebSocket connects.
    """
    return {
        "tick":        state.tick,
        "m_states":    state.m_states,
        "r_states":    state.r_states,
        "inventory":   state.inventory,
        "alerts":      state.alerts[:10],
        "events":      state.events[-10:],
        "savings":     state.savings,
        "fleet_trend": state.fleet_trend[-20:],
        "global_emergency": any(
            s["status"] == "CRITICAL" for s in state.m_states.values()
        ),
    }


@app.post("/analyze", response_model=MultiAgentOutput)
async def analyze(body: AnalyzeRequest):
    """
    Triggers the Gemini multi-agent analysis against current telemetry.
    Pass {"api_key": "YOUR_KEY"} — leave empty string for mock fallback.
    """
    result = await run_multi_agent(body.api_key)
    state.agent_result = result
    return result


@app.post("/approve")
async def approve_action(body: ApproveRequest):
    """
    Executes an approved action (mirrors the Streamlit 'Approve' button).
    Updates inventory / maintenance sets and logs the event.
    """
    if body.action_type in ("MAINTENANCE", "ECO_MODE"):
        state.maintenance.add(body.target)
        state.savings += 24000
        state.events.append(
            f"[{time.strftime('%H:%M:%S')}] {body.action_id}: Maintenance dispatched → {body.target}"
        )
    elif body.action_type == "ORDER_PARTS":
        if body.target in state.inventory:
            state.inventory[body.target] += 10
        state.events.append(
            f"[{time.strftime('%H:%M:%S')}] {body.action_id}: Parts ordered → {body.target} (+10 units)"
        )
    else:
        state.events.append(
            f"[{time.strftime('%H:%M:%S')}] {body.action_id}: {body.action_type} executed on {body.target}"
        )

    return {
        "ok":      True,
        "savings": state.savings,
        "events":  state.events[-10:],
    }


@app.get("/history/{machine_id}")
async def get_history(machine_id: str):
    """Returns the last 30 health ticks for a specific machine."""
    if machine_id not in state.history:
        raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")
    return {"machine_id": machine_id, "history": state.history[machine_id]}


# ─── WEBSOCKET ENDPOINT ───────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    Persistent WebSocket connection.
    The background loop broadcasts telemetry every 2 s automatically.
    The client can also send JSON commands:
      {"action": "approve", "action_id": "ACT-1", "action_type": "MAINTENANCE", "target": "CNC-01"}
      {"action": "analyze", "api_key": "..."}
    """
    await manager.connect(ws)

    # Send current state immediately on connect so the UI isn't blank
    await ws.send_json({
        "tick":        state.tick,
        "m_states":    state.m_states,
        "r_states":    state.r_states,
        "inventory":   state.inventory,
        "alerts":      state.alerts[:10],
        "events":      state.events[-10:],
        "savings":     state.savings,
        "fleet_trend": state.fleet_trend[-20:],
        "global_emergency": any(
            s["status"] == "CRITICAL" for s in state.m_states.values()
        ),
    })

    try:
        while True:
            # Listen for commands from the frontend
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"error": "Invalid JSON"})
                continue

            action = msg.get("action")

            if action == "analyze":
                result = await run_multi_agent(msg.get("api_key", ""))
                state.agent_result = result
                await ws.send_json({"event": "agent_result", "data": result})

            elif action == "approve":
                req = ApproveRequest(
                    action_id=msg.get("action_id", ""),
                    action_type=msg.get("action_type", ""),
                    target=msg.get("target", ""),
                )
                response = await approve_action(req)
                await ws.send_json({"event": "approve_result", "data": response})

            else:
                await ws.send_json({"error": f"Unknown action: {action}"})

    except WebSocketDisconnect:
        manager.disconnect(ws)