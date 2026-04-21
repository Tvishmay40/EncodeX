import asyncio
import json
import os
import random
import time
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from google import genai
except Exception:  # pragma: no cover
    genai = None


class TelemetryPacket(BaseModel):
    machine_id: str
    temp: float
    vib: float
    pres: float
    rpm: float
    kw: float
    co2: float
    ts: int = Field(default_factory=lambda: int(time.time()))


class AgentStep(BaseModel):
    stage: str
    agent: str
    decision: str
    evidence: str


class AgentAction(BaseModel):
    action: str
    machine_id: str
    reason: str
    confidence: float
    estimated_savings_usd: int


class AgentDecision(BaseModel):
    status: str
    summary: str
    trace: list[AgentStep]
    actions: list[AgentAction]


class HaltRequest(BaseModel):
    machine_id: str
    reason: str


class EcoModeRequest(BaseModel):
    machine_id: str
    duration_ticks: int = 5


MACHINES: dict[str, dict[str, Any]] = {
    "CNC-01": {"name": "CNC Mill #1", "health": 82, "temp": 75, "vib": 3.3, "kw": 45, "status": "NORMAL"},
    "CNC-02": {"name": "CNC Mill #2", "health": 88, "temp": 68, "vib": 2.6, "kw": 42, "status": "NORMAL"},
    "ROB-A": {"name": "Robot Arm A", "health": 91, "temp": 54, "vib": 1.1, "kw": 14, "status": "NORMAL"},
    "ROB-B": {"name": "Robot Arm B", "health": 71, "temp": 61, "vib": 4.5, "kw": 19, "status": "WARNING"},
}

INVENTORY = {
    "Bearing-702": 2,
    "HydraulicFluid-L": 12,
    "DriveBelt": 3,
}

EVENTS: list[dict[str, Any]] = []
ECO_MODE_UNTIL: dict[str, int] = {}
CURRENT_TICK = 0


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        payload = json.dumps(message)
        stale: list[WebSocket] = []
        for conn in self.active_connections:
            try:
                await conn.send_text(payload)
            except Exception:
                stale.append(conn)
        for conn in stale:
            self.disconnect(conn)


app = FastAPI(title="Industrial Agentic Backend", version="1.0.0")
manager = ConnectionManager()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def compute_health(temp: float, vib: float, rpm: float) -> int:
    base = 100
    temp_penalty = max(0, int((temp - 70) * 1.4))
    vib_penalty = max(0, int((vib - 2.5) * 14))
    rpm_penalty = 0 if 500 < rpm < 3800 else 8
    return max(5, base - temp_penalty - vib_penalty - rpm_penalty)


def classify_status(health: int) -> str:
    if health < 50:
        return "CRITICAL"
    if health < 75:
        return "WARNING"
    return "NORMAL"


def estimate_savings(machine_id: str, action: str) -> int:
    machine = MACHINES.get(machine_id, {})
    kw = float(machine.get("kw", 20))
    health = float(machine.get("health", 80))
    severity = max(0.2, (100.0 - health) / 100.0)
    downtime_cost = 3600
    hours = 6 if action == "HALT" else 3
    return int(downtime_cost * hours * severity + kw * 28)


def fallback_decision(target_machine: str) -> AgentDecision:
    low_inventory = INVENTORY.get("Bearing-702", 0) <= 2
    machine = MACHINES[target_machine]

    trace = [
        AgentStep(
            stage="Anomaly Detected",
            agent="Sensor Mesh",
            decision=f"{target_machine} crossed risk threshold",
            evidence=f"temp={machine['temp']} vib={machine['vib']} health={machine['health']}",
        ),
        AgentStep(
            stage="Diagnostic Check",
            agent="Diagnostic Agent",
            decision="Maintenance required",
            evidence="Degradation trend indicates failure window tightening",
        ),
        AgentStep(
            stage="Logistics Check",
            agent="Logistics Agent",
            decision="Bearing inventory evaluated",
            evidence=f"Bearing-702 quantity={INVENTORY.get('Bearing-702', 0)}",
        ),
    ]

    actions: list[AgentAction] = []
    if low_inventory:
        trace.append(
            AgentStep(
                stage="Autonomous Decision",
                agent="Orchestrator Agent",
                decision="Execute ECO_MODE and trigger replenishment",
                evidence="Maintenance conflict with low inventory",
            )
        )
        actions.append(
            AgentAction(
                action="ECO_MODE",
                machine_id=target_machine,
                reason="Repair blocked by low bearing inventory",
                confidence=0.91,
                estimated_savings_usd=estimate_savings(target_machine, "ECO_MODE"),
            )
        )
    else:
        trace.append(
            AgentStep(
                stage="Autonomous Decision",
                agent="Orchestrator Agent",
                decision="Halt assembly line for safe intervention",
                evidence="High confidence in imminent fault prevention",
            )
        )
        actions.append(
            AgentAction(
                action="HALT_ASSEMBLY_LINE",
                machine_id=target_machine,
                reason="Critical anomaly with repair readiness available",
                confidence=0.93,
                estimated_savings_usd=estimate_savings(target_machine, "HALT"),
            )
        )

    return AgentDecision(
        status="CRITICAL" if machine["status"] == "CRITICAL" else "WARNING",
        summary="Autonomous decision generated with diagnostic and logistics cross-check.",
        trace=trace,
        actions=actions,
    )


def maybe_use_gemini(target_machine: str) -> AgentDecision | None:
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not api_key or genai is None:
        return None

    prompt = {
        "task": "Return strict JSON with status, summary, trace[], actions[].",
        "rule": "If CNC-01 critical and Bearing-702 low, return ECO_MODE first.",
        "machine": {"id": target_machine, **MACHINES[target_machine]},
        "inventory": INVENTORY,
    }

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=json.dumps(prompt),
        )
        raw = (response.text or "").strip().replace("```json", "").replace("```", "")
        parsed = json.loads(raw)
        return AgentDecision.model_validate(parsed)
    except Exception:
        return None


async def publish_state(event_type: str, payload: dict[str, Any]) -> None:
    await manager.broadcast({
        "event": event_type,
        "tick": CURRENT_TICK,
        "payload": payload,
    })


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/machines")
def get_machines() -> dict[str, Any]:
    return {
        "machines": MACHINES,
        "inventory": INVENTORY,
        "events": EVENTS[-25:],
        "tick": CURRENT_TICK,
    }


@app.post("/api/telemetry")
async def ingest_telemetry(packet: TelemetryPacket) -> dict[str, Any]:
    global CURRENT_TICK
    CURRENT_TICK += 1

    machine = MACHINES.setdefault(packet.machine_id, {"name": packet.machine_id})
    machine.update({
        "temp": packet.temp,
        "vib": packet.vib,
        "rpm": packet.rpm,
        "kw": packet.kw,
        "co2": packet.co2,
    })

    health_score = compute_health(packet.temp, packet.vib, packet.rpm)
    status = classify_status(health_score)

    machine["health"] = health_score
    machine["status"] = status

    event = {
        "time": int(time.time()),
        "type": "TELEMETRY",
        "machine_id": packet.machine_id,
        "status": status,
        "health": health_score,
    }
    EVENTS.append(event)
    await publish_state("telemetry", event)

    return {"accepted": True, "machine": packet.machine_id, "status": status, "health": health_score}


@app.post("/api/actions/halt_assembly_line")
async def halt_assembly_line(req: HaltRequest) -> dict[str, Any]:
    machine = MACHINES.get(req.machine_id)
    if not machine:
        return {"ok": False, "error": "Machine not found"}

    machine["status"] = "MAINTENANCE"
    event = {
        "time": int(time.time()),
        "type": "ACTION",
        "action": "HALT_ASSEMBLY_LINE",
        "machine_id": req.machine_id,
        "reason": req.reason,
    }
    EVENTS.append(event)
    await publish_state("action", event)
    return {"ok": True, "action": "HALT_ASSEMBLY_LINE", "machine_id": req.machine_id}


@app.post("/api/actions/eco_mode")
async def eco_mode(req: EcoModeRequest) -> dict[str, Any]:
    global CURRENT_TICK
    ECO_MODE_UNTIL[req.machine_id] = CURRENT_TICK + req.duration_ticks
    event = {
        "time": int(time.time()),
        "type": "ACTION",
        "action": "ECO_MODE",
        "machine_id": req.machine_id,
        "duration_ticks": req.duration_ticks,
    }
    EVENTS.append(event)
    await publish_state("action", event)
    return {"ok": True, "action": "ECO_MODE", "machine_id": req.machine_id, "until_tick": ECO_MODE_UNTIL[req.machine_id]}


@app.post("/api/agent/evaluate")
async def evaluate() -> dict[str, Any]:
    target_machine = min(MACHINES.keys(), key=lambda m_id: MACHINES[m_id].get("health", 100))
    gemini_decision = maybe_use_gemini(target_machine)
    decision = gemini_decision or fallback_decision(target_machine)

    for action in decision.actions:
        if action.action == "ECO_MODE":
            ECO_MODE_UNTIL[action.machine_id] = CURRENT_TICK + 5
        if action.action == "HALT_ASSEMBLY_LINE":
            MACHINES[action.machine_id]["status"] = "MAINTENANCE"

    event = {
        "time": int(time.time()),
        "type": "AGENT_DECISION",
        "status": decision.status,
        "summary": decision.summary,
        "trace": [step.model_dump() for step in decision.trace],
        "actions": [act.model_dump() for act in decision.actions],
    }
    EVENTS.append(event)
    await publish_state("agent_decision", event)

    return decision.model_dump()


@app.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(20)
            await websocket.send_text(json.dumps({"event": "heartbeat", "ts": int(time.time())}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
