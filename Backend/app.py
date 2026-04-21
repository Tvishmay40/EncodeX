from fastapi import FastAPI, BackgroundTasks, WebSocket
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
    if val <= warn: return 100
    if val >= crit: return 0
    return max(0, int(100 - ((val - warn) / (crit - warn)) * 100))

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
