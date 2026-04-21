<<<<<<< HEAD
"""
AIRA OS — FastAPI Backend
Updated to support Manual Fault Injection
"""

import asyncio
import json
import random
import time
from typing import Dict, List, Optional, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
=======
from fastapi import FastAPI, BackgroundTasks, WebSocket
>>>>>>> 445e04740e323a8ffa51e61e4337e50359dddaf6
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from google import genai
from google.genai import types
import random
import time
import json
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

<<<<<<< HEAD
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
# MACHINE CONFIG
# ─────────────────────────────────────────────────────────────────────────────

MACHINES = [
    {"id": "cnc_1",     "name": "CNC Mill #1",      "type": "CNC",         "zone": "A", "bTemp": 44, "bVib": 12, "bPres": 43,  "bRPM": 3200, "bKW": 45, "bCO2": 12, "deg": True,  "x": 20, "y": 70},
    {"id": "printer_1", "name": "3D Printer #1",    "type": "3D Printer",  "zone": "A", "bTemp": 210,"bVib": 4,  "bPres": 40,  "bRPM": 3100, "bKW": 42, "bCO2": 11, "deg": False, "x": 20, "y": 30},
    {"id": "lathe_1",   "name": "Lathe #1",         "type": "Lathe",       "zone": "B", "bTemp": 78, "bVib": 30, "bPres": 27,  "bRPM": 900,  "bKW": 14, "bCO2": 3,  "deg": False, "x": 50, "y": 70},
    {"id": "robot_1",   "name": "Robotic Arm #1",   "type": "Robotic Arm", "zone": "B", "bTemp": 62, "bVib": 18, "bPres": 31,  "bRPM": 960,  "bKW": 18, "bCO2": 4,  "deg": True,  "x": 50, "y": 30},
]

THRESHOLDS = {
    "CNC":         {"temp": [80,  92],  "vib": [25,   40],  "pres": [48,  56],  "rpm": [2600, 3700]},
    "3D Printer":  {"temp": [230, 250], "vib": [10,   20],  "pres": [35,  45],  "rpm": [700,  1200]},
    "Lathe":       {"temp": [100, 130], "vib": [50,   75],  "pres": [18,  24],  "rpm": [380,  560]},
    "Robotic Arm": {"temp": [95,  110], "vib": [35,   55],  "pres": [210, 240], "rpm": [130,  260]},
}

# ─────────────────────────────────────────────────────────────────────────────
# SHARED SIMULATION STATE
# ─────────────────────────────────────────────────────────────────────────────

class SimState:
    def __init__(self):
        self.tick: int = 0
        self.m_states: Dict  = {}
        self.r_states: Dict  = {}
        self.overrides: Dict[str, Dict[str, float]] = {} # New: Stores {machine_id: {param: value}}
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
        self.history: Dict = {m["id"]: [] for m in MACHINES}
        self.fleet_trend: List[Dict] = []

state = SimState()

def _noise(base: float, spread: float) -> float:
    return base + (random.random() - 0.5) * spread

def _score_metric(val: float, warn: float, crit: float) -> int:
=======
app = FastAPI(title="AIRA OS - Headless Backend")

# Allow Next.js requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── PYDANTIC SCHEMAS (Next.js EXPECTED) ───
class TraceStep(BaseModel):
    stage: str = Field(description="One of: SENSE, THINK, ACT")
    agent: str = Field(description="Name of the agent (e.g. Diagnostic Agent, Logistics Agent)")
    decision: str = Field(description="Short sentence summarizing what was determined")
    evidence: str = Field(description="The underlying sensor data/inventory that caused this")

class AgentAction(BaseModel):
    action: str = Field(description="Short generic action title (e.g. 'Initiate Repair')")
    machine_id: str = Field(description="Machine ID or part ID")
    reason: str = Field(description="Detailed reason for this action")
    estimated_savings_usd: int = Field(description="Dollar savings integer")

class AgentDecision(BaseModel):
    trace: List[TraceStep]
    actions: List[AgentAction]


# ─── INTERNAL STATE DICTIONARIES ───
MACHINES = [
    {"id": "CNC-01", "name": "CNC Mill #1", "type": "CNC", "bTemp": 74, "bVib": 3.4, "bPres": 43, "bRPM": 3200, "bKW": 45, "deg": True},
    {"id": "CNC-02", "name": "CNC Mill #2", "type": "CNC", "bTemp": 67, "bVib": 2.7, "bPres": 40, "bRPM": 3100, "bKW": 42, "deg": False},
    {"id": "ROB-A",  "name": "Robot Arm A", "type": "Robot", "bTemp": 54, "bVib": 1.1, "bPres": 27, "bRPM": 900, "bKW": 14, "deg": False},
    {"id": "ROB-B",  "name": "Robot Arm B", "type": "Robot", "bTemp": 59, "bVib": 4.2, "bPres": 31, "bRPM": 960, "bKW": 18, "deg": True},
]

THRESHOLDS = {
    "CNC": {"temp": [80,92], "vib": [5,7], "pres": [48,56], "rpm": [2600,3700]},
    "Robot": {"temp": [65,78], "vib": [2.5,4], "pres": [35,45], "rpm": [700,1200]},
}

class BackendState:
    def __init__(self):
        self.tick = 0
        self.m_states = {}
        self.inventory = {"Bearing-702": 4, "HydraulicFluid-L": 12}
        self.maintenance = set()
        self.events = []
        self.ws_clients: List[WebSocket] = []

STATE = BackendState()

def noise(base, spread):
    return base + (random.random() - 0.5) * spread

def score_metric(val, warn, crit):
>>>>>>> 445e04740e323a8ffa51e61e4337e50359dddaf6
    if val <= warn: return 100
    if val >= crit: return 0
    return max(0, int(100 - ((val - warn) / (crit - warn)) * 100))

<<<<<<< HEAD
def simulate_machines() -> None:
    new_states: Dict = {}
    tick = state.tick

    for m in MACHINES:
        mid = m["id"]
        # Retrieve any manual overrides from the frontend sliders
        machine_overrides = state.overrides.get(mid, {})

        if mid in state.maintenance:
            new_states[mid] = {
                "temp_c": round(_noise(m["bTemp"] - 3, 0.5), 1),
                "vibration_hz": 0.1,
                "power_w": 0.5,
                "health": 100,
                "status": "MAINTENANCE",
                "type": m["type"],
                "position": {"x": m["x"], "y": m["y"]}
            }
        else:
            deg = tick if m["deg"] else 0
            t = THRESHOLDS.get(m["type"], THRESHOLDS["CNC"])
            
            # Use Override if it exists, otherwise simulate
            temp = machine_overrides.get("temp_c", round(_noise(m["bTemp"] + (0.05 * deg), 2.5), 1))
            vib  = machine_overrides.get("vibration_hz", round(_noise(m["bVib"] + (0.02 * deg), 0.5), 2))
            
            pwr  = round(_noise(m["bKW"] + (deg * 0.05), 1.5), 1)
            
            # Health calculations based on values (overrides will trigger health drops)
            ts = _score_metric(temp, t["temp"][0], t["temp"][1])
            vs = _score_metric(vib,  t["vib"][0],  t["vib"][1])
            hlth = int(ts * 0.5 + vs * 0.5)

            st_val = "active"
            if hlth < 40:   st_val = "emergency"
            elif hlth < 75: st_val = "paused"

            new_states[mid] = {
                "temp_c": temp, 
                "vibration_hz": vib,
                "power_w": pwr,
                "health": hlth, 
                "status": st_val,
                "type": m["type"],
                "position": {"x": m["x"], "y": m["y"]}
            }

    state.m_states = new_states

manager = ConnectionManager() # Assumes ConnectionManager class is defined as in your snippet

# ─────────────────────────────────────────────────────────────────────────────
# FASTAPI APP & WEBSOCKET
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI()

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            
            # Handle Manual Fault Injection from Sliders
            if msg.get("event") == "inject_failure" or msg.get("action") == "inject_failure":
                mid = msg.get("machine_id")
                param = msg.get("parameter")
                val = float(msg.get("target_value", 0))
                
                # Normalize parameter names
                if param == "vibration": param = "vibration_hz"
                
                if mid not in state.overrides: state.overrides[mid] = {}
                state.overrides[mid][param] = val
                print(f"[Override] {mid} {param} -> {val}")

            # ... (handle analyze/approve as before)
    except WebSocketDisconnect:
        manager.disconnect(ws)
=======
def simulate_step():
    new_states = {}
    STATE.tick += 1
    t = STATE.tick
    
    for m in MACHINES:
        mid, typ = m["id"], m["type"]
        if mid in STATE.maintenance:
            new_states[mid] = {"status": "MAINTENANCE", "health": 100, "temp": m["bTemp"], "vib": 0, "name": m["name"]}
            continue
            
        deg = t if m["deg"] else 0
        temp = round(m["bTemp"] + (deg * 0.15) + noise(0, 2), 1)
        vib = round(max(0.1, m["bVib"] + (deg * 0.05) + noise(0, 0.5)), 2)
        kw = round(m["bKW"] + (deg * 0.05), 1)
        
        c_th = THRESHOLDS[typ]
        ts = score_metric(temp, c_th["temp"][0], c_th["temp"][1])
        vs = score_metric(vib, c_th["vib"][0], c_th["vib"][1])
        hlth = int((ts + vs) / 2)
        
        status = "NORMAL"
        if hlth < 50: status = "CRITICAL"
        elif hlth < 75: status = "WARNING"
        
        new_states[mid] = {"status": status, "health": hlth, "temp": temp, "vib": vib, "kw": kw, "name": m["name"]}
        
    STATE.m_states = new_states

@app.on_event("startup")
async def startup_event():
    # Prime iteration
    simulate_step()
    asyncio.create_task(background_tick())

async def background_tick():
    while True:
        await asyncio.sleep(2.0)
        simulate_step()

async def broadcast_event(event_type: str, payload: dict):
    if not STATE.ws_clients: return
    dead = []
    for ws in STATE.ws_clients:
        try:
            await ws.send_json({"event": event_type, "payload": payload})
        except:
            dead.append(ws)
    for w in dead: STATE.ws_clients.remove(w)

def fallback_agent() -> dict:
    return {
        "trace": [
            {"stage": "SENSE", "agent": "Diagnostic Agent", "decision": "Anomaly Detected via Fallback Simulated Policy", "evidence": "Status: CRITICAL"},
            {"stage": "ACT", "agent": "Orchestrator Agent", "decision": "Override engaged, halting line.", "evidence": "N/A"}
        ],
        "actions": [
            {"action": "Simulated Override Maintenance", "machine_id": "CNC-01", "reason": "No API Key provided", "estimated_savings_usd": 1200}
        ]
    }

# ─── FASTAPI ENDPOINTS ───

@app.get("/api/machines")
def get_machines():
    return {
        "tick": STATE.tick,
        "machines": STATE.m_states,
        "inventory": STATE.inventory,
        "events": [{"action": e} for e in STATE.events] 
    }

class HaltRequest(BaseModel):
    machine_id: str
    reason: str

@app.post("/api/actions/halt_assembly_line")
async def halt_assembly(req: HaltRequest):
    STATE.maintenance.add(req.machine_id)
    STATE.events.append(f"HALTED {req.machine_id}: {req.reason}")
    return {"status": "success"}

class EcoRequest(BaseModel):
    machine_id: str
    duration_ticks: int
    
@app.post("/api/actions/eco_mode")
async def eco_mode(req: EcoRequest):
    STATE.events.append(f"ECO_MODE {req.machine_id} for {req.duration_ticks} ticks")
    return {"status": "success"}

@app.post("/api/agent/evaluate")
async def evaluate_agent():
    api_key = os.getenv("GEMINI_API_KEY")
    result = fallback_agent()
    
    if api_key:
        client = genai.Client(api_key=api_key)
        ctx = {"machines": STATE.m_states, "inventory": STATE.inventory}
        sys_p = "You are an Industrial AI Swarm containing Diagnostic, Logistics, and Orchestrator agents. Evaluate the following manufacturing floor context and respond purely in JSON corresponding to the requested schema. Ensure to output traces for Explainable AI."
        user_p = f"Real-time Factory Context:\n{json.dumps(ctx)}"
        
        try:
            resp = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[sys_p, user_p],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=AgentDecision,
                    temperature=0.2,
                )
            )
            result = json.loads(resp.text)
        except Exception as e:
            print(f"Gemini API Error: {e}")
            
    # Send via websocket to prove real-time broadcast capability
    asyncio.create_task(broadcast_event("agent_decision", result))
    
    return result

@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    STATE.ws_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except:
        STATE.ws_clients.remove(websocket)
>>>>>>> 445e04740e323a8ffa51e61e4337e50359dddaf6
