import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ─── Machine & Route Config ──────────────────────────────────────────────────
const MACHINES = [
  { id: "CNC-01", name: "CNC Mill #1",     type: "CNC",       zone: "A", baseTemp: 74, baseVib: 3.4, basePres: 43, baseRPM: 3200, icon: "⚙",  degrading: true,  x: 20, y: 30 },
  { id: "CNC-02", name: "CNC Mill #2",     type: "CNC",       zone: "A", baseTemp: 67, baseVib: 2.7, basePres: 40, baseRPM: 3100, icon: "⚙",  degrading: false, x: 20, y: 70 },
  { id: "ROB-A",  name: "Robot Arm A",     type: "Robot",     zone: "B", baseTemp: 54, baseVib: 1.1, basePres: 27, baseRPM: 900,  icon: "🦾", degrading: false, x: 50, y: 30 },
  { id: "ROB-B",  name: "Robot Arm B",     type: "Robot",     zone: "B", baseTemp: 59, baseVib: 4.2, basePres: 31, baseRPM: 960,  icon: "🦾", degrading: true,  x: 50, y: 70 },
  { id: "CONV-1", name: "Conveyor Belt",   type: "Conveyor",  zone: "C", baseTemp: 44, baseVib: 0.9, basePres: 14, baseRPM: 445,  icon: "📦", degrading: false, x: 80, y: 50 },
  { id: "HYDR-1", name: "Hydraulic Press", type: "Hydraulic", zone: "D", baseTemp: 88, baseVib: 5.8, basePres: 192, baseRPM: 175, icon: "🔧", degrading: true,  x: 80, y: 85 },
];

const THRESHOLDS = {
  CNC:       { temp: [80,92],  vib: [5,7],     pres: [48,56],   rpm: [2600,3700] },
  Robot:     { temp: [65,78],  vib: [2.5,4],   pres: [35,45],   rpm: [700,1200]  },
  Conveyor:  { temp: [55,68],  vib: [1.5,2.5], pres: [18,24],   rpm: [380,560]   },
  Hydraulic: { temp: [95,110], vib: [6,9],     pres: [210,240], rpm: [130,260]   },
};

const ROUTES = [
  { id: "R-01", from: "Warehouse A", to: "Factory Floor",  dist: 2.3,  vehicles: 4, baseEff: 91 },
  { id: "R-02", from: "Port B",      to: "Warehouse A",    dist: 45,   vehicles: 2, baseEff: 78 },
  { id: "R-03", from: "Factory",     to: "Distribution C", dist: 12,   vehicles: 6, baseEff: 85 },
  { id: "R-04", from: "Supplier X",  to: "Warehouse A",    dist: 180,  vehicles: 3, baseEff: 62 },
  { id: "R-05", from: "Dist. C",     to: "Retail D",       dist: 35,   vehicles: 8, baseEff: 94 },
];

const INVENTORY = {
  "Bearing-702": { qty: 4, min: 5 },
  "HydraulicFluid-L": { qty: 12, min: 10 },
  "SensorMount": { qty: 0, min: 2 }, 
  "DriveBelt": { qty: 2, min: 2 }
};

const ZONES = ["ALL", "A", "B", "C", "D"];
const AUTO_EXECUTE_THRESHOLD = 0.85;   // confidence >= this → AIRA auto-executes
const DOWNTIME_COST_PER_HOUR = 8500;  // USD industry average
const REPAIR_DURATION_MS = 8000;       // 8-second repair cycle

// ─── Sensor Simulation ───────────────────────────────────────────────────────
function noise(base, spread) { return base + (Math.random() - 0.5) * spread; }
function degraded(base, spread, tick, factor) {
  return base + factor * tick * 0.04 + noise(0, spread);
}

function simulateMachine(m, tick) {
  const deg = m.degrading ? tick : 0;
  const t = THRESHOLDS[m.type];
  const temp = parseFloat(Math.max(m.baseTemp - 5, degraded(m.baseTemp, 2.5, deg, 0.08)).toFixed(1));
  const vib  = parseFloat(Math.max(0.1, degraded(m.baseVib, 0.5, deg, 0.04)).toFixed(2));
  const pres = parseFloat(noise(m.basePres, m.type === "Hydraulic" ? 6 : 2).toFixed(1));
  const rpm  = parseFloat(noise(m.baseRPM, m.baseRPM * 0.04).toFixed(0));
  const tempScore = scoreMetric(temp, t.temp[0], t.temp[1]);
  const vibScore  = scoreMetric(vib,  t.vib[0],  t.vib[1]);
  const presScore = scoreMetric(pres, t.pres[0], t.pres[1]);
  const rpmScore  = scoreMetric(rpm,  t.rpm[0],  t.rpm[1]);
  const health = Math.round(tempScore * 0.3 + vibScore * 0.35 + presScore * 0.2 + rpmScore * 0.15);
  const status = health > 75 ? "NORMAL" : health > 50 ? "WARNING" : "CRITICAL";
  return { temp, vib, pres, rpm, health, status };
}

function scoreMetric(val, warn, crit) {
  if (val <= warn) return 100;
  if (val >= crit) return 0;
  return Math.round(100 - ((val - warn) / (crit - warn)) * 100);
}

function predictFailure(history) {
  if (history.length < 5) return { hours: null, trend: 0 };
  const recent = history.slice(-8).map(h => h.health);
  const trend = (recent[recent.length - 1] - recent[0]) / recent.length;
  if (trend >= 0) return { hours: null, trend };
  const hoursToThreshold = Math.round((recent[recent.length - 1] - 30) / Math.abs(trend) * (2 / 60));
  return { hours: Math.max(1, hoursToThreshold), trend };
}

// ─── Theme ───────────────────────────────────────────────────────────────────
const A    = "#F59E0B";
const BLUE = "#3B82F6";

const s = {
  app:   { fontFamily: "var(--font-sans)", color: "var(--color-text-primary)", paddingBottom: 20 },
  card:  { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "14px 16px" },
  panel: { background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "10px 14px" },
  mono:  { fontFamily: "var(--font-mono)", fontSize: 13 },
  label: { fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 },
  flex:  { display: "flex", alignItems: "center" },
  tag:   (col) => ({ display: "inline-block", fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: `${col}20`, color: col, border: `0.5px solid ${col}40` }),
};

const statusColor = (st) => ({
  NORMAL:      "var(--color-text-success)",
  WARNING:     "var(--color-text-warning)",
  CRITICAL:    "var(--color-text-danger)",
  MAINTENANCE: BLUE,
}[st] || "var(--color-text-secondary)");

const healthColor = (h) => h > 75 ? "var(--color-text-success)" : h > 50 ? "var(--color-text-warning)" : "var(--color-text-danger)";
const fmt$ = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;

// ─── Subcomponents ───────────────────────────────────────────────────────────
function KPI({ label, value, unit, color, sub, trend }) {
  return (
    <div style={{ ...s.panel, textAlign: "center", position: "relative" }}>
      <div style={s.label}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 500, color: color || "var(--color-text-primary)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
        {value}<span style={{ fontSize: 12, marginLeft: 3, color: "var(--color-text-secondary)" }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 2 }}>{sub}</div>}
      {trend && (
        <div style={{ position: "absolute", top: 10, right: 10, fontSize: 11, color: trend > 0 ? "var(--color-text-success)" : "var(--color-text-danger)" }}>
          {trend > 0 ? "▲" : "▼"} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}

function HealthBar({ value }) {
  const isMaint = value < 0;
  const color = isMaint ? BLUE : healthColor(value);
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ ...s.flex, justifyContent: "space-between", marginBottom: 3 }}>
        <span style={s.label}>Health</span>
        <span style={{ ...s.mono, color, fontSize: 12, fontWeight: 500 }}>{isMaint ? "Repairing" : `${value}%`}</span>
      </div>
      <div style={{ background: "var(--color-border-tertiary)", borderRadius: 4, height: 5, overflow: "hidden" }}>
        {isMaint
          ? <div style={{ width: "100%", height: "100%", background: `repeating-linear-gradient(90deg,${BLUE} 0,${BLUE} 8px,transparent 8px,transparent 14px)`, animation: "slide 1.2s linear infinite", borderRadius: 4 }} />
          : <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
        }
      </div>
    </div>
  );
}

function SensorGauge({ label, value, unit, warn, crit }) {
  const pct = Math.min(value / crit, 1);
  const r = 30, cx = 40, cy = 38, totalArc = 0.75, C = 2 * Math.PI * r;
  const bg = totalArc * C, fg = pct * totalArc * C;
  const col = value < warn ? "var(--color-text-success)" : value < crit ? "var(--color-text-warning)" : "var(--color-text-danger)";
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="80" height="72" viewBox="0 0 80 72">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border-secondary)" strokeWidth="5"
          strokeDasharray={`${bg} ${C}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth="5"
          strokeDasharray={`${fg} ${C}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.3s" }} />
        <text x={cx} y={cy - 3} textAnchor="middle" fontSize="12" fontWeight="500" fill="var(--color-text-primary)" fontFamily="var(--font-mono)">{value}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize="8" fill="var(--color-text-secondary)">{unit}</text>
      </svg>
      <div style={{ ...s.label, marginTop: -4 }}>{label}</div>
    </div>
  );
}

function MachineCard({ m, state, onClick, selected }) {
  const isMaint = state.status === "MAINTENANCE";
  return (
    <div onClick={onClick} style={{
      ...s.card, cursor: "pointer",
      borderColor: isMaint ? BLUE : selected ? A : "var(--color-border-tertiary)",
      borderWidth: isMaint || selected ? 1 : 0.5,
      background: isMaint ? `${BLUE}08` : "var(--color-background-primary)",
    }}>
      <div style={{ ...s.flex, justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ ...s.flex, gap: 6 }}>
          <span style={{ fontSize: 16 }}>{m.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
        </div>
        <span style={s.tag(statusColor(state.status))}>{state.status}</span>
      </div>
      <HealthBar value={isMaint ? -1 : (state.health ?? 0)} />
      {isMaint
        ? <div style={{ fontSize: 11, color: BLUE, marginTop: 8, textAlign: "center", animation: "pulse 1.5s infinite" }}>🔧 Repair cycle in progress…</div>
        : (
          <div style={{ ...s.flex, justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ ...s.mono, color: "var(--color-text-secondary)", fontSize: 11 }}>T: {state.temp}°C</span>
            <span style={{ ...s.mono, color: "var(--color-text-secondary)", fontSize: 11 }}>V: {state.vib} mm/s</span>
            <span style={{ ...s.mono, color: "var(--color-text-secondary)", fontSize: 11 }}>Zone {m.zone}</span>
          </div>
        )
      }
    </div>
  );
}

function AlertBadge({ count }) {
  return count > 0
    ? <span style={{ background: "var(--color-background-danger)", color: "var(--color-text-danger)", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600, marginLeft: 6 }}>{count}</span>
    : null;
}

// Confidence meter with threshold marker at AUTO_EXECUTE_THRESHOLD
function ConfidenceMeter({ value }) {
  const pct = Math.round(value * 100);
  const autoEligible = value >= AUTO_EXECUTE_THRESHOLD;
  const col = autoEligible ? "var(--color-text-success)" : "var(--color-text-warning)";
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ ...s.flex, justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>Confidence</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: col, fontFamily: "var(--font-mono)" }}>{pct}%</span>
      </div>
      <div style={{ position: "relative", height: 5, background: "var(--color-border-tertiary)", borderRadius: 3, overflow: "visible" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 3, transition: "width 0.3s" }} />
        <div style={{ position: "absolute", top: -3, left: `${AUTO_EXECUTE_THRESHOLD * 100}%`, width: 1.5, height: 11, background: A, transform: "translateX(-50%)" }} />
      </div>
      <div style={{ fontSize: 9, color: autoEligible ? "var(--color-text-success)" : "var(--color-text-secondary)", marginTop: 2, textAlign: "right" }}>
        {autoEligible ? "▶ AUTO-ELIGIBLE" : `${Math.round((AUTO_EXECUTE_THRESHOLD - value) * 100)}% below threshold`}
      </div>
    </div>
  );
}

// ─── API ─────────────────────────────────────────────────────────────────────
function buildFactoryPayload(machineStates, routeStates, inventory) {
  return {
    machines: MACHINES.map(m => ({
      id: m.id, name: m.name, type: m.type, zone: m.zone,
      health: machineStates[m.id]?.health,
      status: machineStates[m.id]?.status,
      temp: machineStates[m.id]?.temp,
      vibration: machineStates[m.id]?.vib,
      pressure: machineStates[m.id]?.pres,
      rpm: machineStates[m.id]?.rpm,
    })),
    routes: ROUTES.map(r => ({
      id: r.id, from: r.from, to: r.to,
      efficiency: routeStates[r.id]?.eff,
      delay: routeStates[r.id]?.delay,
      utilization: routeStates[r.id]?.util,
    })),
    inventory
  };
}

async function callAgent(machineStates, routeStates, inventory) {
  const payload = buildFactoryPayload(machineStates, routeStates, inventory);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1500,
      system: `You are AIRA — Autonomous Industrial Response Agent. Analyze real-time sensor telemetry and supply chain data. Respond ONLY with valid JSON, no markdown, no preamble.

CONFIDENCE CALIBRATION (critical for safety):
- confidence >= 0.85: assign ONLY when multiple sensors are in warning/critical range simultaneously — these will be AUTO-EXECUTED without human approval
- confidence 0.60-0.84: issue is present but ambiguous — requires human review (ESCALATION LEVEL: REVIEW)
- confidence < 0.60: early signal — monitor only (ESCALATION LEVEL: MONITOR)

AGENTIC REASONING:
For each action, provide a "thoughtProcess" array detailing how you arrived at this conclusion (e.g., sense -> correlate -> check inventory -> decide).
Include prescriptive repairs (root cause, repair steps, parts needed).`,
      messages: [{
        role: "user",
        content: `Analyze this factory data and return a single JSON object with this exact structure:
{
  "summary": "2-3 sentence overall assessment citing specific machine IDs",
  "overallStatus": "GOOD|WARNING|CRITICAL",
  "riskScore": 0-100,
  "estimatedDowntimeRisk": "e.g. 4-8 hours if untreated",
  "issues": ["specific issue with machine ID and metric values"],
  "actions": [
    {
      "id": "ACT-1",
      "type": "MAINTENANCE|ORDER_PARTS|INSPECTION|REROUTE|SHUTDOWN",
      "target": "machine or route id",
      "title": "short action title",
      "reason": "cite specific sensor values that justify this action",
      "confidence": 0.0-1.0,
      "priority": "HIGH|MEDIUM|LOW",
      "impact": "expected outcome if taken",
      "estimatedSavings": estimated USD savings from preventing downtime,
      "escalationLevel": "AUTO|REVIEW|MONITOR",
      "thoughtProcess": ["Step 1:...", "Step 2:..."],
      "prescriptiveRepair": {
         "rootCause": "probable root cause",
         "steps": ["Step 1...", "Step 2..."],
         "partsNeeded": ["part1", "part2"]
      }
    }
  ]
}

Factory telemetry:
${JSON.stringify(payload, null, 2)}`
      }]
    })
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

async function callChat(conversationHistory, machineStates, routeStates, inventory) {
  const payload = buildFactoryPayload(machineStates, routeStates, inventory);
  const critical = MACHINES.filter(m => machineStates[m.id]?.status === "CRITICAL").map(m => m.name);
  const warning  = MACHINES.filter(m => machineStates[m.id]?.status === "WARNING").map(m => m.name);
  const maint    = MACHINES.filter(m => machineStates[m.id]?.status === "MAINTENANCE").map(m => m.name);
  const avgH = Math.round(Object.values(machineStates).filter(s => (s.health ?? -1) >= 0).reduce((a, s) => a + s.health, 0) / MACHINES.length);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      system: `You are AIRA — Autonomous Industrial Response Agent. Answer operator questions concisely, citing specific machine IDs and sensor values. Live snapshot:
Fleet avg health: ${avgH}% | Critical: ${critical.join(", ") || "None"} | Warning: ${warning.join(", ") || "None"} | Maintenance: ${maint.join(", ") || "None"}
Full telemetry: ${JSON.stringify(payload)}`,
      messages: conversationHistory,
    })
  });
  const data = await res.json();
  return data.content?.[0]?.text || "I couldn't process that. Please try again.";
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const tick = useRef(0);
  const runAgentRef    = useRef(null);
  const machineStatesRef = useRef({});
  const routeStatesRef   = useRef({});
  const maintenanceRef   = useRef(new Set());
  const inventoryRef     = useRef(INVENTORY);

  const [tab, setTab] = useState("dashboard");
  const [machineStates, setMachineStates] = useState(() =>
    Object.fromEntries(MACHINES.map(m => [m.id, simulateMachine(m, 0)]))
  );
  const [history, setHistory] = useState(() =>
    Object.fromEntries(MACHINES.map(m => [m.id, Array.from({ length: 15 }, (_, i) => ({
      t: i, health: simulateMachine(m, 0).health + (Math.random() - 0.5) * 8
    }))]))
  );
  const [fleetTrend, setFleetTrend] = useState(() =>
    Array.from({ length: 15 }, (_, i) => ({ t: i, avg: 85 + (Math.random() - 0.5) * 10 }))
  );
  const [routeStates, setRouteStates] = useState(() =>
    Object.fromEntries(ROUTES.map(r => [r.id, { eff: r.baseEff + noise(0, 5), delay: noise(12, 10), util: noise(70, 20) }]))
  );
  const [alerts, setAlerts] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState("CNC-01");
  const [zoneFilter, setZoneFilter] = useState("ALL");
  const [agentState, setAgentState] = useState({ status: "idle", result: null, error: null });
  const [actionLog, setActionLog] = useState([]);
  const [autoMode, setAutoMode] = useState(false);
  const [time, setTime] = useState(new Date());
  const [executedActions, setExecutedActions] = useState(new Set());
  
  // Agentic repair state
  const [maintenanceMachines, setMaintenanceMachines] = useState(new Set());
  const [totalSavings, setTotalSavings] = useState(0);
  const [downtimePrevented, setDowntimePrevented] = useState(0);
  const [autonomousEvents, setAutonomousEvents] = useState([]);
  
  // Automation tasks
  const [automationTasks, setAutomationTasks] = useState([
    { id: "TSK-01", type: "REORDER_PARTS", desc: "Auto-reorder SensorMount (below minimum threshold)", status: "COMPLETED", time: new Date(Date.now() - 3600000).toLocaleTimeString() }
  ]);

  // KPIs
  const [mttrAvg, setMttrAvg] = useState(45); // initial mock value in minutes

  // Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { machineStatesRef.current = machineStates; }, [machineStates]);
  useEffect(() => { routeStatesRef.current = routeStates; }, [routeStates]);
  useEffect(() => { maintenanceRef.current = maintenanceMachines; }, [maintenanceMachines]);

  // Live simulation
  useEffect(() => {
    const iv = setInterval(() => {
      tick.current++;
      const t = tick.current;
      setTime(new Date());
      const nextStates = {};
      const newAlerts  = [];

      MACHINES.forEach(m => {
        if (maintenanceRef.current.has(m.id)) {
          nextStates[m.id] = {
            temp: parseFloat(noise(m.baseTemp - 3, 0.5).toFixed(1)),
            vib:  parseFloat((m.baseVib * 0.35).toFixed(2)),
            pres: parseFloat(noise(m.basePres, 0.5).toFixed(1)),
            rpm:  0,
            health: -1,
            status: "MAINTENANCE",
          };
        } else {
          nextStates[m.id] = simulateMachine(m, t);
        }
      });

      setMachineStates(prev => {
        MACHINES.forEach(m => {
          const state = nextStates[m.id];
          if (state.status !== "NORMAL" && state.status !== "MAINTENANCE" && prev[m.id]?.status !== state.status) {
            newAlerts.push({ id: `${Date.now()}-${m.id}`, machineId: m.id, machineName: m.name, status: state.status, health: state.health, time: new Date().toLocaleTimeString() });
          }
        });
        if (newAlerts.length > 0) setAlerts(a => [...newAlerts, ...a].slice(0, 20));
        return nextStates;
      });

      setHistory(prev => {
        const next = { ...prev };
        MACHINES.forEach(m => {
          const h = nextStates[m.id].health;
          next[m.id] = [...(prev[m.id] || []).slice(-29), { t, health: h < 0 ? 85 : h }];
        });
        return next;
      });

      setFleetTrend(prev => {
        const vals = Object.values(nextStates).filter(s => s.health >= 0).map(s => s.health);
        const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 85;
        return [...prev.slice(-29), { t, avg }];
      });

      setRouteStates(
        Object.fromEntries(ROUTES.map(r => [r.id, {
          eff:   Math.max(30, Math.min(99, r.baseEff + noise(0, 8))),
          delay: Math.max(0, noise(12, 15)),
          util:  Math.max(20, Math.min(99, noise(70, 25))),
        }]))
      );
    }, 2500);
    return () => clearInterval(iv);
  }, []);

  const executeAction = useCallback((action, isAutonomous = false) => {
    const targetMachine = MACHINES.find(m => m.id === action.target);
    const isMachineAction = !!targetMachine && ["MAINTENANCE", "INSPECTION", "SHUTDOWN", "ORDER_PARTS"].includes(action.type);

    if (action.type === "ORDER_PARTS") {
       setAutomationTasks(prev => [{
         id: "TSK-" + Date.now(),
         type: "REORDER_PARTS",
         desc: `Auto-reorder initiated for ${action.target} parts`,
         status: "EXECUTING",
         time: new Date().toLocaleTimeString()
       }, ...prev]);
       
       setTimeout(() => {
          setAutomationTasks(prev => prev.map(t => t.status === "EXECUTING" ? { ...t, status: "COMPLETED" } : t));
       }, 5000);
    }

    if (isMachineAction) {
      setMaintenanceMachines(prev => new Set([...prev, action.target]));

      setTimeout(() => {
        setMaintenanceMachines(prev => {
          const next = new Set(prev);
          next.delete(action.target);
          return next;
        });
        setAutonomousEvents(prev => [{
          id: Date.now(),
          time: new Date().toLocaleTimeString(),
          event: `${action.target} (${targetMachine.name}) restored to operational — health reset to baseline`,
          type: "RESTORED",
        }, ...prev].slice(0, 30));
        
        // Improve MTTR since AIRA fixed it fast
        setMttrAvg(prev => Math.max(15, Math.round(prev * 0.95))); 
      }, REPAIR_DURATION_MS);

      const savings = action.estimatedSavings || DOWNTIME_COST_PER_HOUR * 2;
      setTotalSavings(s => s + savings);
      setDowntimePrevented(d => d + 2);
    }

    setExecutedActions(prev => new Set([...prev, action.id]));
    setActionLog(prev => [{
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      action: action.title,
      target: action.target,
      type: action.type,
      priority: action.priority,
      autonomous: isAutonomous,
      confidence: action.confidence,
    }, ...prev].slice(0, 50));

    if (isAutonomous) {
      setAutonomousEvents(prev => [{
        id: Date.now() + 1,
        time: new Date().toLocaleTimeString(),
        event: `AIRA dispatched "${action.title}" on ${action.target} — ${Math.round(action.confidence * 100)}% confidence`,
        type: "DISPATCHED",
      }, ...prev].slice(0, 30));
    }
  }, []);

  const executedActionsRef = useRef(executedActions);
  useEffect(() => { executedActionsRef.current = executedActions; }, [executedActions]);
  const autoModeRef = useRef(autoMode);
  useEffect(() => { autoModeRef.current = autoMode; }, [autoMode]);

  const runAgent = useCallback(async () => {
    setAgentState({ status: "running", result: null, error: null });
    try {
      const result = await callAgent(machineStatesRef.current, routeStatesRef.current, inventoryRef.current);
      setAgentState({ status: "done", result, error: null });

      if (autoModeRef.current && result.actions) {
        result.actions
          .filter(a => a.confidence >= AUTO_EXECUTE_THRESHOLD && !executedActionsRef.current.has(a.id))
          .forEach(a => executeAction(a, true));
      }
    } catch (e) {
      setAgentState({ status: "error", result: null, error: e.message });
    }
  }, [executeAction]);

  useEffect(() => { runAgentRef.current = runAgent; }, [runAgent]);

  useEffect(() => {
    if (!autoMode) return;
    const iv = setInterval(() => {
      if (agentState.status !== "running") runAgentRef.current?.();
    }, 30000);
    return () => clearInterval(iv);
  }, [autoMode, agentState.status]);

  const dismissAlert = useCallback((id) => setAlerts(prev => prev.filter(a => a.id !== id)), []);
  const clearAlerts  = useCallback(() => setAlerts([]), []);

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const userMsg = { role: "user", content: text };
    const next = [...chatMessages, userMsg];
    setChatMessages(next);
    setChatInput("");
    setChatLoading(true);
    try {
      const reply = await callChat(next, machineStatesRef.current, routeStatesRef.current, inventoryRef.current);
      setChatMessages(h => [...h, { role: "assistant", content: reply }]);
    } catch (e) {
      setChatMessages(h => [...h, { role: "assistant", content: `⚠ Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatLoading]);

  // Derived stats
  const allStates      = Object.values(machineStates);
  const criticalCount  = allStates.filter(s => s.status === "CRITICAL").length;
  const warningCount   = allStates.filter(s => s.status === "WARNING").length;
  const maintCount     = allStates.filter(s => s.status === "MAINTENANCE").length;
  const validHealths   = allStates.filter(s => (s.health ?? -1) >= 0).map(s => s.health);
  const avgHealth      = validHealths.length ? Math.round(validHealths.reduce((a, b) => a + b, 0) / validHealths.length) : 0;
  const avgRouteEff    = Math.round(Object.values(routeStates).reduce((a, r) => a + r.eff, 0) / ROUTES.length);
  const overallStatus  = criticalCount > 0 ? "CRITICAL" : warningCount > 0 ? "WARNING" : "NORMAL";
  const selMachine     = MACHINES.find(m => m.id === selectedMachine);
  const selState       = machineStates[selectedMachine] || {};
  const selHistory     = history[selectedMachine] || [];
  const selThresh      = THRESHOLDS[selMachine?.type] || {};
  const selPredict     = predictFailure(selHistory);
  const filteredMachines = zoneFilter === "ALL" ? MACHINES : MACHINES.filter(m => m.zone === zoneFilter);

  // Industry KPIs Calculations
  // Availability = (total machines - down machines) / total machines
  const availability = Math.round(((MACHINES.length - maintCount - criticalCount) / MACHINES.length) * 100);
  // Performance = overall avg health / 100 (simplified proxy)
  const performance = avgHealth;
  // Quality = Route efficiency (simplified proxy for supply chain quality)
  const quality = avgRouteEff;
  const oee = Math.round((availability/100) * (performance/100) * (quality/100) * 100);
  const otif = Math.round(avgRouteEff * 0.95); // On-Time In-Full roughly based on efficiency

  const tabStyle = (id) => ({
    padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500, border: "none",
    background: "none", color: tab === id ? A : "var(--color-text-secondary)",
    borderBottom: tab === id ? `2px solid ${A}` : "2px solid transparent",
    transition: "color 0.2s", whiteSpace: "nowrap",
  });

  return (
    <div style={s.app}>
      {/* ── Header ── */}
      <div style={{ ...s.card, borderRadius: 10, marginBottom: 12 }}>
        <div style={{ ...s.flex, justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ ...s.flex, gap: 10, alignItems: "baseline" }}>
              <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>AIRA</span>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Autonomous Industrial Response Agent</span>
              {autoMode && <span style={{ ...s.tag(A), animation: "pulse 1.5s infinite" }}>● AUTONOMOUS</span>}
            </div>
            <div style={{ ...s.flex, gap: 6, marginTop: 4 }}>
              <span style={s.tag(statusColor(overallStatus))}>● {overallStatus}</span>
              <span style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)" }}>{time.toLocaleTimeString()}</span>
              <span style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)" }}>TICK #{tick.current}</span>
            </div>
          </div>
          <div style={{ ...s.flex, gap: 14 }}>
            {[
              { label: "Critical",    value: criticalCount, color: criticalCount > 0 ? "var(--color-text-danger)"  : "var(--color-text-success)" },
              { label: "Warning",     value: warningCount,  color: warningCount  > 0 ? "var(--color-text-warning)" : "var(--color-text-success)" },
              { label: "OEE Score",   value: `${oee}%`, color: A },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ ...s.mono, fontSize: 20, fontWeight: 600, color }}>{value}</div>
                <div style={s.label}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ ...s.flex, borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: 14, overflowX: "auto", scrollbarWidth: "none" }}>
        {[
          { id: "dashboard", label: "Dashboard" },
          { id: "factory",   label: "Factory Map" },
          { id: "machines",  label: "Machines" },
          { id: "supply",    label: "Supply Chain" },
          { id: "automation",label: "Task Automation" },
          { id: "agent",     label: "AI Agent" },
          { id: "chat",      label: "AIRA Chat" },
        ].map(({ id, label }) => (
          <button key={id} style={tabStyle(id)} onClick={() => setTab(id)}>
            {label}
            {id === "dashboard" && alerts.length > 0 && <AlertBadge count={alerts.length} />}
            {id === "automation" && automationTasks.some(t => t.status === "EXECUTING") && <span style={{ ...s.tag(BLUE), marginLeft: 6, fontSize: 9 }}>1 ACTIVE</span>}
            {id === "agent" && agentState.result?.overallStatus === "CRITICAL" && <span style={{ marginLeft: 5, color: "var(--color-text-danger)", fontSize: 11 }}>!</span>}
          </button>
        ))}
      </div>

      {/* ════════════ DASHBOARD ════════════ */}
      {tab === "dashboard" && (
        <div>
          <div style={{ ...s.label, marginBottom: 8 }}>Industry Standard KPIs</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            <KPI label="OEE"                value={oee}         unit="%" color={healthColor(oee)} trend={2.1} sub="Overall Eq. Effectiveness" />
            <KPI label="MTTR"               value={mttrAvg}     unit="m" color={mttrAvg < 60 ? "var(--color-text-success)" : "var(--color-text-warning)"} trend={-14} sub="Mean Time To Repair" />
            <KPI label="OTIF Delivery"      value={otif}        unit="%" color={otif > 85 ? "var(--color-text-success)" : "var(--color-text-danger)"} sub="On-Time In-Full" />
            <KPI label="Est. Savings"       value={fmt$(totalSavings)} unit="" color={A} sub={`${actionLog.filter(l => l.autonomous).length} auto-executed`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
            <div>
              <div style={{ ...s.card, marginBottom: 14 }}>
                <div style={{ ...s.label, marginBottom: 8 }}>Fleet Health Trend</div>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={fleetTrend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={A} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={A} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="t" hide />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} />
                    <Tooltip formatter={v => [`${Math.round(v)}%`, "Avg Health"]} labelFormatter={() => ""} contentStyle={{ fontSize: 12, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" }} />
                    <Area type="monotone" dataKey="avg" stroke={A} strokeWidth={2} fill="url(#fg)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Autonomous event feed */}
              {autonomousEvents.length > 0 && (
                <div style={{ ...s.card, borderColor: `${BLUE}40` }}>
                  <div style={{ ...s.label, marginBottom: 10, color: BLUE }}>⚡ Autonomous Action Feed</div>
                  {autonomousEvents.slice(0, 4).map(ev => (
                    <div key={ev.id} style={{ ...s.flex, gap: 10, padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12 }}>
                      <span style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)", minWidth: 64 }}>{ev.time}</span>
                      <span style={s.tag(ev.type === "RESTORED" ? "var(--color-text-success)" : BLUE)}>{ev.type}</span>
                      <span style={{ flex: 1 }}>{ev.event}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              {alerts.length > 0 ? (
                <div style={s.card}>
                  <div style={{ ...s.flex, justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={s.label}>Recent Alerts</div>
                    <button onClick={clearAlerts} style={{ fontSize: 11, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>Clear all</button>
                  </div>
                  {alerts.slice(0, 6).map(al => (
                    <div key={al.id} style={{ ...s.flex, gap: 8, padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", flexWrap: "wrap" }}>
                      <span style={s.tag(statusColor(al.status))}>{al.status}</span>
                      <span style={{ fontSize: 13, flex: 1 }}>{al.machineName}</span>
                      <span style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)" }}>{al.time}</span>
                    </div>
                  ))}
                </div>
              ) : (
                 <div style={{ ...s.card, textAlign: "center", padding: 30 }}>
                    <div style={{ fontSize: 24, marginBottom: 10 }}>✅</div>
                    <div style={{ fontSize: 14 }}>All Systems Nominal</div>
                 </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════ FACTORY MAP  ════════════ */}
      {tab === "factory" && (
        <div style={s.card}>
          <div style={{ ...s.flex, justifyContent: "space-between", marginBottom: 14 }}>
            <div style={s.label}>Real-Time Spacial Awareness</div>
            <div style={{ ...s.flex, gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>● Normal</span>
              <span style={{ fontSize: 11, color: "var(--color-text-warning)" }}>● Warning</span>
              <span style={{ fontSize: 11, color: "var(--color-text-danger)" }}>● Critical</span>
              <span style={{ fontSize: 11, color: BLUE }}>● Maintenance</span>
            </div>
          </div>
          
          <div style={{ position: "relative", width: "100%", height: 400, background: "var(--color-background-secondary)", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", overflow: "hidden" }}>
             {/* Simple grid background */}
             <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundImage: "radial-gradient(var(--color-border-tertiary) 1px, transparent 1px)", backgroundSize: "20px 20px", opacity: 0.5 }} />
             
             {/* Zones */}
             <div style={{ position: "absolute", top: "5%", left: "5%", width: "30%", height: "90%", border: "1px dashed var(--color-border-secondary)", borderRadius: 8 }}>
                <div style={{ position: "absolute", top: 10, left: 10, ...s.label, color: "var(--color-text-secondary)" }}>Zone A (Machining)</div>
             </div>
             <div style={{ position: "absolute", top: "5%", left: "38%", width: "25%", height: "90%", border: "1px dashed var(--color-border-secondary)", borderRadius: 8 }}>
                <div style={{ position: "absolute", top: 10, left: 10, ...s.label, color: "var(--color-text-secondary)" }}>Zone B (Assembly)</div>
             </div>
             <div style={{ position: "absolute", top: "5%", left: "66%", width: "30%", height: "90%", border: "1px dashed var(--color-border-secondary)", borderRadius: 8 }}>
                <div style={{ position: "absolute", top: 10, left: 10, ...s.label, color: "var(--color-text-secondary)" }}>Zone C/D (Press & Pack)</div>
             </div>

             {/* Conveyor path */}
             <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                <path d="M 25 50 L 55 50 L 85 50" stroke="var(--color-border-secondary)" strokeWidth="4" strokeDasharray="8 4" fill="none" />
                <circle cx="25%" cy="50%" r="4" fill="var(--color-border-secondary)" />
                <circle cx="55%" cy="50%" r="4" fill="var(--color-border-secondary)" />
                <circle cx="85%" cy="50%" r="4" fill="var(--color-border-secondary)" />
             </svg>

             {/* Machines */}
             {MACHINES.map(m => {
               const st = machineStates[m.id];
               const col = statusColor(st?.status);
               const isM = st?.status === "MAINTENANCE";
               return (
                 <div key={m.id} 
                      onClick={() => { setSelectedMachine(m.id); setTab("machines"); }}
                      style={{ 
                        position: "absolute", left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)",
                        background: "var(--color-background-primary)", border: `2px solid ${col}`, padding: "8px 12px", borderRadius: 8,
                        cursor: "pointer", boxShadow: `0 4px 12px ${col}30`,
                        animation: isM ? "pulse 1.5s infinite" : "none", zIndex: 10, textAlign: "center", minWidth: 80
                 }}>
                   <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
                   <div style={{ fontSize: 11, fontWeight: 600 }}>{m.id}</div>
                   {isM ? (
                     <div style={{ fontSize: 10, color: col, marginTop: 2 }}>REPAIRING</div>
                   ) : (
                     <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 2 }}>{st?.health}%</div>
                   )}
                 </div>
               );
             })}
          </div>
        </div>
      )}

      {/* ════════════ TASK AUTOMATION  ════════════ */}
      {tab === "automation" && (
        <div>
          <div style={{ ...s.card, marginBottom: 14 }}>
            <div style={{ ...s.flex, justifyContent: "space-between", marginBottom: 14 }}>
               <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>AIRA Task Automation Queue</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>Autonomous execution of repetitive tasks (Parts reordering, logistics routing, scheduling)</div>
               </div>
               <button onClick={() => setAutomationTasks([])} style={{ background: "none", border: "1px solid var(--color-border-secondary)", borderRadius: 6, padding: "5px 12px", fontSize: 11, color: "var(--color-text-secondary)", cursor: "pointer" }}>Clear History</button>
            </div>

            {automationTasks.length === 0 ? (
               <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>No recent automated tasks.</div>
            ) : (
               <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {automationTasks.map(t => (
                     <div key={t.id} style={{ ...s.panel, display: "flex", alignItems: "center", gap: 14 }}>
                        {t.status === "EXECUTING" ? (
                           <div style={{ width: 16, height: 16, borderRadius: 8, border: `2px solid ${BLUE}`, borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
                        ) : t.status === "COMPLETED" ? (
                           <div style={{ color: "var(--color-text-success)" }}>✓</div>
                        ) : (
                           <div style={{ width: 8, height: 8, borderRadius: 4, background: "var(--color-text-secondary)" }} />
                        )}
                        <div style={{ flex: 1 }}>
                           <div style={{ ...s.flex, gap: 10 }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{t.type}</span>
                              <span style={s.tag(t.status === "COMPLETED" ? "var(--color-text-success)" : BLUE)}>{t.status}</span>
                           </div>
                           <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{t.desc}</div>
                        </div>
                        <div style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)" }}>{t.time}</div>
                     </div>
                  ))}
               </div>
            )}
          </div>
          
          <div style={s.card}>
             <div style={{ ...s.label, marginBottom: 12 }}>Live Parts Inventory (WMS Sync)</div>
             <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {Object.entries(INVENTORY).map(([name, data]) => (
                   <div key={name} style={{ ...s.panel, borderColor: data.qty <= data.min ? "var(--color-border-danger)" : "var(--color-border-tertiary)" }}>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{name}</div>
                      <div style={{ ...s.flex, justifyContent: "space-between" }}>
                         <span style={{ ...s.mono, fontSize: 18, color: data.qty === 0 ? "var(--color-text-danger)" : "var(--color-text-primary)" }}>{data.qty}</span>
                         <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>Min: {data.min}</span>
                      </div>
                      {data.qty <= data.min && (
                         <div style={{ fontSize: 10, color: "var(--color-text-danger)", marginTop: 4 }}>Reorder required</div>
                      )}
                   </div>
                ))}
             </div>
          </div>
        </div>
      )}

      {/* ════════════ MACHINES ════════════ */}
      {tab === "machines" && (
        <div>
          <div style={{ ...s.flex, gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ ...s.label, marginRight: 4 }}>Zone:</span>
            {ZONES.map(z => (
              <button key={z} onClick={() => setZoneFilter(z)} style={{
                padding: "4px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 500,
                border: `0.5px solid ${zoneFilter === z ? A : "var(--color-border-secondary)"}`,
                background: zoneFilter === z ? `${A}18` : "none",
                color: zoneFilter === z ? A : "var(--color-text-secondary)",
              }}>{z === "ALL" ? "All Zones" : `Zone ${z}`}</button>
            ))}
          </div>
          <div style={{ ...s.flex, gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {filteredMachines.map(m => (
              <button key={m.id} onClick={() => setSelectedMachine(m.id)} style={{
                padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 500,
                border: `0.5px solid ${selectedMachine === m.id ? A : "var(--color-border-secondary)"}`,
                background: selectedMachine === m.id ? `${A}18` : "none",
                color: selectedMachine === m.id ? A : "var(--color-text-secondary)",
              }}>{m.icon} {m.id}</button>
            ))}
          </div>

          {selMachine && (
            <div>
              <div style={{ ...s.card, marginBottom: 10 }}>
                <div style={{ ...s.flex, justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{selMachine.name}</div>
                    <div style={{ ...s.mono, fontSize: 12, color: "var(--color-text-secondary)", marginTop: 3 }}>Type: {selMachine.type} · Zone {selMachine.zone} · ID: {selMachine.id}</div>
                  </div>
                  <div style={{ ...s.flex, gap: 10 }}>
                    <span style={s.tag(statusColor(selState.status))}>{selState.status}</span>
                    {(selState.health ?? -1) >= 0 && <span style={{ ...s.mono, fontSize: 14, fontWeight: 600, color: healthColor(selState.health) }}>{selState.health}% Health</span>}
                  </div>
                </div>
                <HealthBar value={selState.health ?? -1} />
              </div>

              {selState.status === "MAINTENANCE" ? (
                <div style={{ ...s.card, marginBottom: 10, borderColor: `${BLUE}50`, background: `${BLUE}06` }}>
                  <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🔧</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: BLUE }}>AIRA Repair Cycle Active</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6 }}>
                      Autonomous maintenance dispatched. Degradation paused. Health will be restored on completion.
                    </div>
                    <div style={{ ...s.flex, justifyContent: "center", gap: 6, marginTop: 12 }}>
                      {[0,1,2].map(i => <span key={i} style={{ display: "inline-block", width: 7, height: 7, borderRadius: 4, background: BLUE, animation: `pulse 1s ${i * 0.2}s infinite` }} />)}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ ...s.card, marginBottom: 10 }}>
                    <div style={{ ...s.label, marginBottom: 12 }}>Live Sensor Readings</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", justifyItems: "center" }}>
                      <SensorGauge label="Temp"      value={selState.temp} unit="°C"   warn={selThresh.temp?.[0]}  crit={selThresh.temp?.[1]} />
                      <SensorGauge label="Vibration" value={selState.vib}  unit="mm/s" warn={selThresh.vib?.[0]}   crit={selThresh.vib?.[1]} />
                      <SensorGauge label="Pressure"  value={selState.pres} unit="bar"  warn={selThresh.pres?.[0]}  crit={selThresh.pres?.[1]} />
                      <SensorGauge label="RPM"       value={selState.rpm}  unit="rpm"  warn={selThresh.rpm?.[0]}   crit={selThresh.rpm?.[1]} />
                    </div>
                  </div>

                  <div style={{ ...s.card, marginBottom: 10 }}>
                    <div style={{ ...s.label, marginBottom: 8 }}>Health Score History</div>
                    <ResponsiveContainer width="100%" height={130}>
                      <AreaChart data={selHistory} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                        <defs>
                          <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={A} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={A} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="t" hide />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} />
                        <Tooltip formatter={v => [`${Math.round(v)}%`, "Health"]} labelFormatter={() => ""} contentStyle={{ fontSize: 12, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" }} />
                        <Area type="monotone" dataKey="health" stroke={A} strokeWidth={2} fill="url(#hg)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...s.card, borderColor: selPredict.trend < -0.5 ? "var(--color-border-danger)" : "var(--color-border-tertiary)" }}>
                    <div style={{ ...s.label, marginBottom: 8 }}>Predictive Analysis</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={s.panel}>
                        <div style={s.label}>Trend</div>
                        <div style={{ ...s.mono, fontSize: 18, fontWeight: 600, color: selPredict.trend < 0 ? "var(--color-text-warning)" : "var(--color-text-success)", marginTop: 4 }}>
                          {selPredict.trend < 0 ? "↘ Degrading" : "↗ Stable"}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 3 }}>Rate: {selPredict.trend.toFixed(2)}%/tick</div>
                      </div>
                      <div style={s.panel}>
                        <div style={s.label}>Est. Time to Maintenance</div>
                        <div style={{ ...s.mono, fontSize: 18, fontWeight: 600, color: selPredict.hours ? (selPredict.hours < 48 ? "var(--color-text-danger)" : "var(--color-text-warning)") : "var(--color-text-success)", marginTop: 4 }}>
                          {selPredict.hours ? `~${selPredict.hours}h` : "Stable"}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 3 }}>
                          {selPredict.hours ? "Threshold: 30% health" : "No imminent failure"}
                        </div>
                      </div>
                    </div>
                    {selMachine.degrading && (
                      <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--color-background-warning)", borderRadius: 8, fontSize: 12, color: "var(--color-text-warning)" }}>
                        ⚠ Sensor trend anomaly on {selMachine.name}. Predictive maintenance recommended.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════ SUPPLY CHAIN ════════════ */}
      {tab === "supply" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
            <KPI label="Avg Efficiency"  value={avgRouteEff} unit="%" color={avgRouteEff > 80 ? "var(--color-text-success)" : "var(--color-text-warning)"} />
            <KPI label="Active Routes"   value={ROUTES.length} unit="" />
            <KPI label="Delayed Routes"  value={Object.values(routeStates).filter(r => r.delay > 20).length} unit="" color="var(--color-text-danger)" />
          </div>
          <div style={{ ...s.card, marginBottom: 14 }}>
            <div style={{ ...s.label, marginBottom: 8 }}>Route Efficiency Overview</div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={ROUTES.map(r => ({ name: r.id, eff: Math.round(routeStates[r.id]?.eff || 0), util: Math.round(routeStates[r.id]?.util || 0) }))} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} />
                <Tooltip contentStyle={{ fontSize: 12, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" }} />
                <Bar dataKey="eff"  name="Efficiency %"  fill={A}    radius={[3,3,0,0]} />
                <Bar dataKey="util" name="Utilization %" fill={BLUE} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...s.label, marginBottom: 8 }}>Route Details</div>
          {ROUTES.map(r => {
            const rs = routeStates[r.id] || {};
            const effCol = rs.eff > 80 ? "var(--color-text-success)" : rs.eff > 60 ? "var(--color-text-warning)" : "var(--color-text-danger)";
            return (
              <div key={r.id} style={{ ...s.card, marginBottom: 8 }}>
                <div style={{ ...s.flex, justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.from} → {r.to}</div>
                    <div style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{r.id} · {r.dist} km · {r.vehicles} vehicles</div>
                  </div>
                  <div style={{ ...s.flex, gap: 16 }}>
                    {[
                      { val: `${Math.round(rs.eff)}%`, label: "efficiency", col: effCol },
                      { val: `${Math.round(rs.delay)}m`, label: "delay", col: rs.delay > 20 ? "var(--color-text-danger)" : "var(--color-text-secondary)" },
                      { val: `${Math.round(rs.util)}%`, label: "utilization", col: "var(--color-text-primary)" },
                    ].map(({ val, label, col }) => (
                      <div key={label} style={{ textAlign: "right" }}>
                        <div style={{ ...s.mono, fontWeight: 600, color: col }}>{val}</div>
                        <div style={s.label}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {rs.eff < 70 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-warning)", background: "var(--color-background-warning)", padding: "5px 10px", borderRadius: 6 }}>
                    Low efficiency — consider rerouting or adding capacity.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════ AI AGENT ════════════ */}
      {tab === "agent" && (
        <div>
          {/* Mission control header */}
          <div style={{ ...s.card, marginBottom: 12, borderColor: autoMode ? `${A}50` : "var(--color-border-tertiary)" }}>
            
            {/* Guardrails Banner */}
            <div style={{ marginBottom: 14, background: "var(--color-background-secondary)", borderRadius: 6, padding: "8px 12px", border: "1px dashed var(--color-border-tertiary)" }}>
               <div style={{ ...s.flex, gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>🛡️ Autonomy Guardrails:</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-success)" }}>Confidence ≥ 85% → Auto Execute</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-warning)" }}>60-84% → Manual Review required</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>&lt; 60% → Monitor only</span>
               </div>
            </div>

            <div style={{ ...s.flex, justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <div>
                <div style={{ ...s.flex, gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>AIRA — Agentic Mode</span>
                  {autoMode && <span style={{ ...s.tag(A), fontSize: 10, animation: "pulse 1.5s infinite" }}>● AUTONOMOUS ACTIVE</span>}
                </div>
              </div>
              <div style={{ ...s.flex, gap: 10 }}>
                <label style={{ ...s.flex, gap: 6, cursor: "pointer", fontSize: 12 }}>
                  <span style={{ color: autoMode ? A : "var(--color-text-secondary)", fontWeight: autoMode ? 600 : 400, transition: "color 0.2s" }}>
                    {autoMode ? "Autonomous ON" : "Auto-monitor"}
                  </span>
                  <div onClick={() => setAutoMode(a => !a)} style={{ width: 32, height: 18, borderRadius: 9, background: autoMode ? A : "var(--color-border-secondary)", position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                    <div style={{ position: "absolute", top: 2, left: autoMode ? 14 : 2, width: 14, height: 14, borderRadius: 7, background: "#fff", transition: "left 0.2s" }} />
                  </div>
                </label>
                <button onClick={runAgent} disabled={agentState.status === "running"} style={{
                  padding: "7px 16px", borderRadius: 8, cursor: agentState.status === "running" ? "default" : "pointer",
                  background: agentState.status === "running" ? "var(--color-border-secondary)" : A,
                  color: agentState.status === "running" ? "var(--color-text-secondary)" : "#000",
                  border: "none", fontSize: 13, fontWeight: 600, transition: "background 0.2s",
                }}>
                  {agentState.status === "running" ? "Analyzing…" : "▶ Run Analysis"}
                </button>
              </div>
            </div>
          </div>

          {agentState.status === "running" && (
            <div style={{ ...s.panel, marginBottom: 12, ...s.flex, gap: 10 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: A, animation: "pulse 1s infinite" }} />
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                Streaming telemetry channels, route metrics, and WMS inventory data to AIRA for multi-agent reasoning…
              </span>
            </div>
          )}

          {agentState.error && (
            <div style={{ ...s.card, marginBottom: 12, borderColor: "var(--color-border-danger)" }}>
              <div style={{ fontSize: 13, color: "var(--color-text-danger)" }}>⚠ Analysis failed: {agentState.error}</div>
            </div>
          )}

          {agentState.result && (
            <div>
              <div style={{ ...s.card, marginBottom: 10 }}>
                <div style={{ ...s.flex, justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  <div style={s.label}>AIRA Assessment</div>
                  <div style={{ ...s.flex, gap: 8 }}>
                    <span style={s.tag(statusColor(agentState.result.overallStatus))}>{agentState.result.overallStatus}</span>
                    <span style={{ ...s.mono, fontSize: 13, fontWeight: 600, color: agentState.result.riskScore > 70 ? "var(--color-text-danger)" : agentState.result.riskScore > 40 ? "var(--color-text-warning)" : "var(--color-text-success)" }}>
                      Risk {agentState.result.riskScore}/100
                    </span>
                    {agentState.result.estimatedDowntimeRisk && (
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary)", ...s.mono }}>⏱ {agentState.result.estimatedDowntimeRisk}</span>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>{agentState.result.summary}</p>
                {agentState.result.issues?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={s.label}>Detected Issues</div>
                    {agentState.result.issues.map((issue, i) => (
                      <div key={i} style={{ ...s.flex, gap: 6, marginTop: 5, fontSize: 12 }}>
                        <span style={{ color: "var(--color-text-danger)", fontSize: 10 }}>●</span><span>{issue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {agentState.result.actions?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...s.flex, justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={s.label}>Recommended Actions / Agentic Workflow</div>
                  </div>

                  {agentState.result.actions.map(action => {
                    const done = executedActions.has(action.id);
                    const autoEligible = action.confidence >= AUTO_EXECUTE_THRESHOLD;
                    const priColor = action.priority === "HIGH" ? "var(--color-text-danger)" : action.priority === "MEDIUM" ? "var(--color-text-warning)" : "var(--color-text-success)";
                    
                    return (
                      <div key={action.id} style={{
                        ...s.card, marginBottom: 12,
                        opacity: done ? 0.75 : 1,
                        borderLeft: `3px solid ${done ? "var(--color-border-tertiary)" : autoEligible ? A : action.priority === "HIGH" ? "var(--color-text-danger)" : "var(--color-border-tertiary)"}`,
                        borderColor: done ? "var(--color-border-tertiary)" : autoEligible ? `${A}60` : "var(--color-border-tertiary)",
                      }}>
                        <div style={{ ...s.flex, justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                          <div style={{ ...s.flex, gap: 8, flexWrap: "wrap" }}>
                            <span style={s.tag(priColor)}>{action.priority}</span>
                            <span style={{ ...s.mono, fontSize: 11, background: "var(--color-background-secondary)", padding: "2px 7px", borderRadius: 4 }}>{action.type}</span>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{action.title}</span>
                            {autoEligible && !done && <span style={{ ...s.tag(A), fontSize: 9 }}>AUTO-EXECUTABLE</span>}
                            {action.escalationLevel === "REVIEW" && !done && <span style={{ ...s.tag("var(--color-text-warning)"), fontSize: 9 }}>MANUAL REVIEW REQ</span>}
                          </div>
                          <div style={{ ...s.flex, gap: 6 }}>
                             {done && <button style={{ background: "none", border: "1px solid var(--color-border-secondary)", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "var(--color-text-secondary)", cursor: "pointer" }}>↺ Undo</button>}
                             <button onClick={() => executeAction(action, false)} disabled={done} style={{
                               padding: "4px 12px", borderRadius: 6, cursor: done ? "default" : "pointer",
                               background: done ? "var(--color-background-secondary)" : `${A}20`,
                               color: done ? "var(--color-text-secondary)" : A,
                               border: `0.5px solid ${done ? "var(--color-border-tertiary)" : A}`,
                               fontSize: 12, fontWeight: 500,
                             }}>
                               {done ? "✓ Executed" : "Execute"}
                             </button>
                          </div>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <ConfidenceMeter value={action.confidence} />
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                           {/* Left Column: Details */}
                           <div>
                              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 6 }}>
                                <strong style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>Target:</strong> {action.target} — {action.reason}
                              </div>
                              {action.impact && <div style={{ fontSize: 11, color: "var(--color-text-success)", marginTop: 4 }}>Expected outcome: {action.impact}</div>}
                              
                              {/* Prescriptive Repairs */}
                              {action.prescriptiveRepair && (
                                <div style={{ marginTop: 10, background: "var(--color-background-secondary)", borderRadius: 6, padding: 10, border: "0.5px solid var(--color-border-tertiary)" }}>
                                   <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>🔧 Prescriptive Repair Plan</div>
                                   <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}><strong>Root Cause:</strong> {action.prescriptiveRepair.rootCause}</div>
                                   <ol style={{ margin: "4px 0 0 16px", padding: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>
                                      {action.prescriptiveRepair.steps?.map((step, i) => <li key={i}>{step}</li>)}
                                   </ol>
                                   {action.prescriptiveRepair.partsNeeded?.length > 0 && (
                                      <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-secondary)" }}>
                                         <strong>Parts required:</strong> {action.prescriptiveRepair.partsNeeded.join(", ")}
                                      </div>
                                   )}
                                </div>
                              )}
                           </div>
                           
                           {/* Right Column: Reasoning */}
                           {action.thoughtProcess && (
                              <div style={{ background: "#111827", borderRadius: 6, padding: 10, border: "0.5px solid var(--color-border-tertiary)" }}>
                                 <div style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>🧠 Agent Thought Process</div>
                                 <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    {action.thoughtProcess.map((step, i) => (
                                       <div key={i} style={{ fontSize: 11, color: "#D1D5DB", fontFamily: "var(--font-mono)", lineHeight: 1.4 }}>
                                          <span style={{ color: "#4B5563" }}>&gt;</span> {step}
                                       </div>
                                    ))}
                                 </div>
                              </div>
                           )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {agentState.status === "idle" && !agentState.result && (
            <div style={{ ...s.panel, textAlign: "center", padding: 30 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🤖</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>AIRA is standing by</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6, maxWidth: 400, margin: "6px auto 0" }}>
                Click "Run Analysis" to scan telemetry, evaluate KPIs (OEE, MTTR), and trigger the agent logic loop. Enable Autonomous mode for zero-touch remediation.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════ AIRA CHAT ════════════ */}
      {tab === "chat" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...s.panel, ...s.flex, gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Live context injected per message</span>
            <span style={s.tag(statusColor(overallStatus))}>{overallStatus}</span>
            <span style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)" }}>
              {criticalCount} critical · {warningCount} warning · {maintCount} maintenance · {avgHealth}% avg health
            </span>
            {chatMessages.length > 0 && (
              <button onClick={() => setChatMessages([])} style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>Clear chat</button>
            )}
          </div>

          <div style={{ ...s.card, minHeight: 320, maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {chatMessages.length === 0 && !chatLoading && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, opacity: 0.5, padding: "30px 0" }}>
                <div style={{ fontSize: 28 }}>💬</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Ask AIRA anything about the factory</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", textAlign: "center", maxWidth: 280 }}>
                  Try: "Which machine is most at risk?", "Why is CNC-01 degrading?", "Do we have DriveBelts in stock?"
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => {
              const isUser = msg.role === "user";
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                  <div style={{ ...s.label, marginBottom: 3, textAlign: isUser ? "right" : "left" }}>{isUser ? "You" : "AIRA"}</div>
                  <div style={{
                    maxWidth: "85%", padding: "9px 13px",
                    borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                    background: isUser ? `${A}18` : "var(--color-background-secondary)",
                    border: `0.5px solid ${isUser ? `${A}40` : "var(--color-border-tertiary)"}`,
                    fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap",
                  }}>{msg.content}</div>
                </div>
              );
            })}
            {chatLoading && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ ...s.label, marginBottom: 3 }}>AIRA</div>
                <div style={{ ...s.panel, padding: "9px 13px", ...s.flex, gap: 6 }}>
                  {[0,1,2].map(i => <span key={i} style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: A, animation: `pulse 1s ${i * 0.2}s infinite` }} />)}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={{ ...s.flex, gap: 8 }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
              placeholder="Ask AIRA about machine health, inventory, or repairs…"
              disabled={chatLoading}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 10,
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-secondary)",
                color: "var(--color-text-primary)", fontSize: 13, outline: "none",
              }}
            />
            <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} style={{
              padding: "10px 18px", borderRadius: 10, border: "none", fontWeight: 600, fontSize: 13,
              cursor: chatLoading || !chatInput.trim() ? "default" : "pointer",
              background: chatLoading || !chatInput.trim() ? "var(--color-border-secondary)" : A,
              color: chatLoading || !chatInput.trim() ? "var(--color-text-secondary)" : "#000",
              transition: "background 0.2s",
            }}>Send</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slide { from{background-position:0 0} to{background-position:28px 0} }
        @keyframes spin { 100%{transform:rotate(360deg)} }
        input:focus { border-color: ${A} !important; box-shadow: 0 0 0 2px ${A}20; }
      `}</style>
    </div>
  );
}
