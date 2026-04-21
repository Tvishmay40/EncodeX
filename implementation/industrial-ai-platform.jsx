import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ─── Machine & Route Config ──────────────────────────────────────────────────
const MACHINES = [
  { id: "CNC-01", name: "CNC Mill #1",    type: "CNC",       zone: "A", baseTemp: 74, baseVib: 3.4, basePres: 43, baseRPM: 3200, icon: "⚙", degrading: true },
  { id: "CNC-02", name: "CNC Mill #2",    type: "CNC",       zone: "A", baseTemp: 67, baseVib: 2.7, basePres: 40, baseRPM: 3100, icon: "⚙", degrading: false },
  { id: "ROB-A",  name: "Robot Arm A",    type: "Robot",     zone: "B", baseTemp: 54, baseVib: 1.1, basePres: 27, baseRPM: 900,  icon: "🦾", degrading: false },
  { id: "ROB-B",  name: "Robot Arm B",    type: "Robot",     zone: "B", baseTemp: 59, baseVib: 4.2, basePres: 31, baseRPM: 960,  icon: "🦾", degrading: true },
  { id: "CONV-1", name: "Conveyor Belt",  type: "Conveyor",  zone: "C", baseTemp: 44, baseVib: 0.9, basePres: 14, baseRPM: 445,  icon: "📦", degrading: false },
  { id: "HYDR-1", name: "Hydraulic Press",type: "Hydraulic", zone: "D", baseTemp: 88, baseVib: 5.8, basePres: 192, baseRPM: 175, icon: "🔧", degrading: true },
];

const THRESHOLDS = {
  CNC:       { temp: [80,92], vib: [5,7],   pres: [48,56],  rpm: [2600,3700] },
  Robot:     { temp: [65,78], vib: [2.5,4], pres: [35,45],  rpm: [700,1200] },
  Conveyor:  { temp: [55,68], vib: [1.5,2.5], pres: [18,24], rpm: [380,560] },
  Hydraulic: { temp: [95,110],vib: [6,9],   pres: [210,240], rpm: [130,260] },
};

const ROUTES = [
  { id: "R-01", from: "Warehouse A", to: "Factory Floor",   dist: 2.3,  vehicles: 4, baseEff: 91 },
  { id: "R-02", from: "Port B",      to: "Warehouse A",     dist: 45,   vehicles: 2, baseEff: 78 },
  { id: "R-03", from: "Factory",     to: "Distribution C",  dist: 12,   vehicles: 6, baseEff: 85 },
  { id: "R-04", from: "Supplier X",  to: "Warehouse A",     dist: 180,  vehicles: 3, baseEff: 62 },
  { id: "R-05", from: "Dist. C",     to: "Retail D",        dist: 35,   vehicles: 8, baseEff: 94 },
];

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

  const tempScore  = scoreMetric(temp,  t.temp[0],  t.temp[1]);
  const vibScore   = scoreMetric(vib,   t.vib[0],   t.vib[1]);
  const presScore  = scoreMetric(pres,  t.pres[0],  t.pres[1]);
  const rpmScore   = scoreMetric(rpm,   t.rpm[0],   t.rpm[1]);
  const health = Math.round((tempScore * 0.3 + vibScore * 0.35 + presScore * 0.2 + rpmScore * 0.15));

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

// ─── Styles & Theme ──────────────────────────────────────────────────────────
const A = "#F59E0B"; // amber accent
const s = {
  app:   { fontFamily: "var(--font-sans)", color: "var(--color-text-primary)", paddingBottom: 20 },
  card:  { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "14px 16px" },
  panel: { background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "10px 14px" },
  mono:  { fontFamily: "var(--font-mono)", fontSize: 13 },
  label: { fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
  flex:  { display: "flex", alignItems: "center" },
  tag:   (col) => ({ display: "inline-block", fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: `${col}20`, color: col, border: `0.5px solid ${col}40` }),
};

const statusColor = (st) => st === "NORMAL" ? "var(--color-text-success)" : st === "WARNING" ? "var(--color-text-warning)" : "var(--color-text-danger)";
const statusBg    = (st) => st === "NORMAL" ? "var(--color-background-success)" : st === "WARNING" ? "var(--color-background-warning)" : "var(--color-background-danger)";
const healthColor = (h)  => h > 75 ? "var(--color-text-success)" : h > 50 ? "var(--color-text-warning)" : "var(--color-text-danger)";

// ─── Subcomponents ───────────────────────────────────────────────────────────
function KPI({ label, value, unit, color }) {
  return (
    <div style={{ ...s.panel, textAlign: "center" }}>
      <div style={s.label}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 500, color: color || "var(--color-text-primary)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
        {value}<span style={{ fontSize: 13, marginLeft: 3, color: "var(--color-text-secondary)" }}>{unit}</span>
      </div>
    </div>
  );
}

function HealthBar({ value }) {
  const color = healthColor(value);
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ ...s.flex, justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ ...s.label }}>Health</span>
        <span style={{ ...s.mono, color, fontSize: 12, fontWeight: 500 }}>{value}%</span>
      </div>
      <div style={{ background: "var(--color-border-tertiary)", borderRadius: 4, height: 5, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

function SensorGauge({ label, value, unit, warn, crit }) {
  const pct = Math.min(value / crit, 1);
  const r = 30, cx = 40, cy = 38;
  const totalArc = 0.75;
  const C = 2 * Math.PI * r;
  const bg = totalArc * C;
  const fg = pct * totalArc * C;
  const col = value < warn ? "var(--color-text-success)" : value < crit ? "var(--color-text-warning)" : "var(--color-text-danger)";
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="80" height="72" viewBox="0 0 80 72">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border-secondary)" strokeWidth="5"
          strokeDasharray={`${bg} ${C}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth="5"
          strokeDasharray={`${fg} ${C}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.3s" }} />
        <text x={cx} y={cy - 3} textAnchor="middle" fontSize="12" fontWeight="500"
          fill="var(--color-text-primary)" fontFamily="var(--font-mono)">{value}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize="8" fill="var(--color-text-secondary)">{unit}</text>
      </svg>
      <div style={{ ...s.label, marginTop: -4 }}>{label}</div>
    </div>
  );
}

function MachineCard({ m, state, onClick, selected }) {
  return (
    <div onClick={onClick} style={{ ...s.card, cursor: "pointer", borderColor: selected ? A : "var(--color-border-tertiary)", borderWidth: selected ? 1 : 0.5 }}>
      <div style={{ ...s.flex, justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ ...s.flex, gap: 6 }}>
          <span style={{ fontSize: 16 }}>{m.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
        </div>
        <span style={{ ...s.tag(statusColor(state.status)) }}>{state.status}</span>
      </div>
      <HealthBar value={state.health} />
      <div style={{ ...s.flex, justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ ...s.mono, color: "var(--color-text-secondary)", fontSize: 11 }}>T: {state.temp}°C</span>
        <span style={{ ...s.mono, color: "var(--color-text-secondary)", fontSize: 11 }}>V: {state.vib} mm/s</span>
        <span style={{ ...s.mono, color: "var(--color-text-secondary)", fontSize: 11 }}>Zone {m.zone}</span>
      </div>
    </div>
  );
}

function AlertBadge({ alerts }) {
  return alerts.length > 0 ? (
    <span style={{ background: "var(--color-background-danger)", color: "var(--color-text-danger)", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600, marginLeft: 6 }}>{alerts.length}</span>
  ) : null;
}

// ─── Claude AI Agent Call ─────────────────────────────────────────────────────
async function callAgent(machineStates, routeStates) {
  const payload = {
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
    }))
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `You are AIRA — Autonomous Industrial Response Agent. Analyze real-time machine sensor data and supply chain metrics. Respond ONLY with valid JSON, no markdown, no preamble. Your response must be a single JSON object.`,
      messages: [{
        role: "user",
        content: `Analyze this factory data and return JSON with this exact structure:
{
  "summary": "2-3 sentence overall assessment",
  "overallStatus": "GOOD|WARNING|CRITICAL",
  "riskScore": 0-100,
  "issues": ["list of detected issues"],
  "actions": [
    {
      "id": "ACT-1",
      "type": "MAINTENANCE|ORDER_PARTS|INSPECTION|REROUTE|SHUTDOWN",
      "target": "machine or route id",
      "title": "short action title",
      "reason": "explanation of why this action is needed",
      "confidence": 0.0-1.0,
      "priority": "HIGH|MEDIUM|LOW",
      "impact": "expected outcome if action is taken"
    }
  ]
}

Factory data:
${JSON.stringify(payload, null, 2)}`
      }]
    })
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const tick = useRef(0);
  const [tab, setTab] = useState("dashboard");
  const [machineStates, setMachineStates] = useState(() =>
    Object.fromEntries(MACHINES.map(m => [m.id, simulateMachine(m, 0)]))
  );
  const [history, setHistory] = useState(() =>
    Object.fromEntries(MACHINES.map(m => [m.id, Array.from({ length: 15 }, (_, i) => ({
      t: i, health: simulateMachine(m, 0).health + (Math.random() - 0.5) * 8
    }))]))
  );
  const [routeStates, setRouteStates] = useState(() =>
    Object.fromEntries(ROUTES.map(r => [r.id, {
      eff: r.baseEff + noise(0, 5),
      delay: noise(12, 10),
      util: noise(70, 20),
    }]))
  );
  const [alerts, setAlerts] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState("CNC-01");
  const [agentState, setAgentState] = useState({ status: "idle", result: null, error: null });
  const [actionLog, setActionLog] = useState([]);
  const [autoMode, setAutoMode] = useState(false);
  const [time, setTime] = useState(new Date());
  const [executedActions, setExecutedActions] = useState(new Set());

  // Live simulation
  useEffect(() => {
    const iv = setInterval(() => {
      tick.current++;
      const t = tick.current;
      setTime(new Date());

      setMachineStates(prev => {
        const next = {};
        const newAlerts = [];
        MACHINES.forEach(m => {
          const state = simulateMachine(m, t);
          next[m.id] = state;
          if (state.status !== "NORMAL" && prev[m.id]?.status !== state.status) {
            newAlerts.push({ id: Date.now() + m.id, machineId: m.id, machineName: m.name, status: state.status, health: state.health, time: new Date().toLocaleTimeString() });
          }
        });
        if (newAlerts.length > 0) setAlerts(a => [...newAlerts, ...a].slice(0, 20));
        return next;
      });

      setHistory(prev => {
        const next = { ...prev };
        MACHINES.forEach(m => {
          const state = simulateMachine(m, t);
          const entry = { t, health: state.health };
          next[m.id] = [...(prev[m.id] || []).slice(-29), entry];
        });
        return next;
      });

      setRouteStates(() =>
        Object.fromEntries(ROUTES.map(r => [r.id, {
          eff: Math.max(30, Math.min(99, r.baseEff + noise(0, 8))),
          delay: Math.max(0, noise(12, 15)),
          util: Math.max(20, Math.min(99, noise(70, 25))),
        }]))
      );
    }, 2500);
    return () => clearInterval(iv);
  }, []);

  // Auto agent mode
  useEffect(() => {
    if (!autoMode) return;
    const iv = setInterval(() => {
      if (agentState.status !== "running") runAgent();
    }, 30000);
    return () => clearInterval(iv);
  }, [autoMode, agentState.status]);

  const runAgent = useCallback(async () => {
    setAgentState({ status: "running", result: null, error: null });
    try {
      const result = await callAgent(machineStates, routeStates);
      setAgentState({ status: "done", result, error: null });
    } catch (e) {
      setAgentState({ status: "error", result: null, error: e.message });
    }
  }, [machineStates, routeStates]);

  const executeAction = useCallback((action) => {
    setExecutedActions(prev => new Set([...prev, action.id]));
    setActionLog(prev => [{
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      action: action.title,
      target: action.target,
      type: action.type,
      priority: action.priority,
    }, ...prev].slice(0, 50));
  }, []);

  // ── Stats ──
  const allStates = Object.values(machineStates);
  const criticalCount  = allStates.filter(s => s.status === "CRITICAL").length;
  const warningCount   = allStates.filter(s => s.status === "WARNING").length;
  const avgHealth      = Math.round(allStates.reduce((a, s) => a + s.health, 0) / allStates.length);
  const avgRouteEff    = Math.round(Object.values(routeStates).reduce((a, r) => a + r.eff, 0) / ROUTES.length);
  const overallStatus  = criticalCount > 0 ? "CRITICAL" : warningCount > 0 ? "WARNING" : "NORMAL";
  const selMachine     = MACHINES.find(m => m.id === selectedMachine);
  const selState       = machineStates[selectedMachine] || {};
  const selHistory     = history[selectedMachine] || [];
  const selThresh      = THRESHOLDS[selMachine?.type] || {};
  const selPredict     = predictFailure(selHistory);

  // ── Tab styles ──
  const tabStyle = (id) => ({
    padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500, border: "none",
    background: "none", color: tab === id ? A : "var(--color-text-secondary)",
    borderBottom: tab === id ? `2px solid ${A}` : "2px solid transparent",
    transition: "color 0.2s",
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
            </div>
            <div style={{ ...s.flex, gap: 6, marginTop: 4 }}>
              <span style={s.tag(statusColor(overallStatus))}>● {overallStatus}</span>
              <span style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)" }}>{time.toLocaleTimeString()}</span>
              <span style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)" }}>TICK #{tick.current}</span>
            </div>
          </div>
          <div style={{ ...s.flex, gap: 8 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ ...s.mono, fontSize: 20, fontWeight: 600, color: criticalCount > 0 ? "var(--color-text-danger)" : "var(--color-text-success)" }}>{criticalCount}</div>
              <div style={s.label}>Critical</div>
            </div>
            <div style={{ textAlign: "center", marginLeft: 10 }}>
              <div style={{ ...s.mono, fontSize: 20, fontWeight: 600, color: warningCount > 0 ? "var(--color-text-warning)" : "var(--color-text-success)" }}>{warningCount}</div>
              <div style={s.label}>Warning</div>
            </div>
            <div style={{ textAlign: "center", marginLeft: 10 }}>
              <div style={{ ...s.mono, fontSize: 20, fontWeight: 600, color: A }}>{avgHealth}%</div>
              <div style={s.label}>Avg Health</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ ...s.flex, borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: 14, overflowX: "auto" }}>
        {[
          { id: "dashboard", label: "Dashboard" },
          { id: "machines",  label: "Machines" },
          { id: "supply",    label: "Supply Chain" },
          { id: "agent",     label: "AI Agent" },
        ].map(({ id, label }) => (
          <button key={id} style={tabStyle(id)} onClick={() => setTab(id)}>
            {label}
            {id === "dashboard" && alerts.length > 0 && <AlertBadge alerts={alerts} />}
            {id === "agent" && agentState.result && agentState.result.overallStatus === "CRITICAL" &&
              <span style={{ marginLeft: 5, color: "var(--color-text-danger)", fontSize: 11 }}>!</span>}
          </button>
        ))}
      </div>

      {/* ════════════ DASHBOARD TAB ════════════ */}
      {tab === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            <KPI label="Fleet Health" value={avgHealth} unit="%" color={healthColor(avgHealth)} />
            <KPI label="Active Machines" value={allStates.filter(s => s.status !== "CRITICAL").length} unit={`/${MACHINES.length}`} color="var(--color-text-primary)" />
            <KPI label="Route Efficiency" value={avgRouteEff} unit="%" color={avgRouteEff > 80 ? "var(--color-text-success)" : "var(--color-text-warning)"} />
            <KPI label="Open Alerts" value={alerts.length} unit="" color={alerts.length > 0 ? "var(--color-text-danger)" : "var(--color-text-success)"} />
          </div>

          {/* Machine Grid */}
          <div style={{ ...s.label, marginBottom: 8 }}>Machine Status</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
            {MACHINES.map(m => (
              <MachineCard key={m.id} m={m} state={machineStates[m.id] || {}} selected={selectedMachine === m.id}
                onClick={() => { setSelectedMachine(m.id); setTab("machines"); }} />
            ))}
          </div>

          {/* Alert Feed */}
          {alerts.length > 0 && (
            <div style={s.card}>
              <div style={{ ...s.label, marginBottom: 10 }}>Recent Alerts</div>
              {alerts.slice(0, 5).map(al => (
                <div key={al.id} style={{ ...s.flex, gap: 10, padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <span style={s.tag(statusColor(al.status))}>{al.status}</span>
                  <span style={{ fontSize: 13, flex: 1 }}>{al.machineName}</span>
                  <span style={{ ...s.mono, fontSize: 12, color: "var(--color-text-secondary)" }}>Health: {al.health}%</span>
                  <span style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)" }}>{al.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════ MACHINES TAB ════════════ */}
      {tab === "machines" && (
        <div>
          {/* Machine selector */}
          <div style={{ ...s.flex, gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {MACHINES.map(m => (
              <button key={m.id} onClick={() => setSelectedMachine(m.id)} style={{
                padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 500,
                border: `0.5px solid ${selectedMachine === m.id ? A : "var(--color-border-secondary)"}`,
                background: selectedMachine === m.id ? `${A}18` : "none",
                color: selectedMachine === m.id ? A : "var(--color-text-secondary)",
              }}>
                {m.icon} {m.id}
              </button>
            ))}
          </div>

          {selMachine && (
            <div>
              {/* Machine header */}
              <div style={{ ...s.card, marginBottom: 10 }}>
                <div style={{ ...s.flex, justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{selMachine.name}</div>
                    <div style={{ ...s.mono, fontSize: 12, color: "var(--color-text-secondary)", marginTop: 3 }}>
                      Type: {selMachine.type} · Zone {selMachine.zone} · ID: {selMachine.id}
                    </div>
                  </div>
                  <div style={{ ...s.flex, gap: 10 }}>
                    <span style={s.tag(statusColor(selState.status))}>{selState.status}</span>
                    <span style={{ ...s.mono, fontSize: 14, fontWeight: 600, color: healthColor(selState.health) }}>{selState.health}% Health</span>
                  </div>
                </div>
                <HealthBar value={selState.health} />
              </div>

              {/* Sensor Gauges */}
              <div style={{ ...s.card, marginBottom: 10 }}>
                <div style={{ ...s.label, marginBottom: 12 }}>Live Sensor Readings</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", justifyItems: "center" }}>
                  <SensorGauge label="Temp" value={selState.temp} unit="°C" warn={selThresh.temp?.[0]} crit={selThresh.temp?.[1]} />
                  <SensorGauge label="Vibration" value={selState.vib} unit="mm/s" warn={selThresh.vib?.[0]} crit={selThresh.vib?.[1]} />
                  <SensorGauge label="Pressure" value={selState.pres} unit="bar" warn={selThresh.pres?.[0]} crit={selThresh.pres?.[1]} />
                  <SensorGauge label="RPM" value={selState.rpm} unit="rpm" warn={selThresh.rpm?.[0]} crit={selThresh.rpm?.[1]} />
                </div>
              </div>

              {/* Health history chart */}
              <div style={{ ...s.card, marginBottom: 10 }}>
                <div style={{ ...s.label, marginBottom: 8 }}>Health Score History</div>
                <ResponsiveContainer width="100%" height={130}>
                  <AreaChart data={selHistory} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={A} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={A} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="t" hide />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} />
                    <Tooltip formatter={v => [`${Math.round(v)}%`, "Health"]} labelFormatter={() => ""} contentStyle={{ fontSize: 12, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" }} />
                    <Area type="monotone" dataKey="health" stroke={A} strokeWidth={2} fill="url(#healthGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Prediction panel */}
              <div style={{ ...s.card, borderColor: selPredict.trend < -0.5 ? "var(--color-border-danger)" : "var(--color-border-tertiary)" }}>
                <div style={{ ...s.label, marginBottom: 8 }}>Predictive Analysis</div>
                <div style={s.grid2}>
                  <div style={s.panel}>
                    <div style={s.label}>Trend</div>
                    <div style={{ ...s.mono, fontSize: 18, fontWeight: 600, color: selPredict.trend < 0 ? "var(--color-text-warning)" : "var(--color-text-success)", marginTop: 4 }}>
                      {selPredict.trend < 0 ? "↘ Degrading" : "↗ Stable"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 3 }}>
                      Rate: {selPredict.trend.toFixed(2)}%/tick
                    </div>
                  </div>
                  <div style={s.panel}>
                    <div style={s.label}>Est. Time to Maintenance</div>
                    <div style={{ ...s.mono, fontSize: 18, fontWeight: 600, color: selPredict.hours ? (selPredict.hours < 48 ? "var(--color-text-danger)" : "var(--color-text-warning)") : "var(--color-text-success)", marginTop: 4 }}>
                      {selPredict.hours ? `~${selPredict.hours}h` : "Stable"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 3 }}>
                      {selPredict.hours ? "Maintenance threshold: 30%" : "No imminent failure predicted"}
                    </div>
                  </div>
                </div>
                {selMachine.degrading && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--color-background-warning)", borderRadius: 8, fontSize: 12, color: "var(--color-text-warning)" }}>
                    ⚠ Sensor trend anomaly detected on {selMachine.name}. Recommend scheduling predictive maintenance inspection.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════ SUPPLY CHAIN TAB ════════════ */}
      {tab === "supply" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
            <KPI label="Avg Efficiency" value={avgRouteEff} unit="%" color={avgRouteEff > 80 ? "var(--color-text-success)" : "var(--color-text-warning)"} />
            <KPI label="Active Routes" value={ROUTES.length} unit="" color="var(--color-text-primary)" />
            <KPI label="Delayed Routes" value={Object.values(routeStates).filter(r => r.delay > 20).length} unit="" color="var(--color-text-danger)" />
          </div>

          {/* Efficiency chart */}
          <div style={{ ...s.card, marginBottom: 14 }}>
            <div style={{ ...s.label, marginBottom: 8 }}>Route Efficiency Overview</div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={ROUTES.map(r => ({ name: r.id, eff: Math.round(routeStates[r.id]?.eff || 0), util: Math.round(routeStates[r.id]?.util || 0) }))} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} />
                <Tooltip contentStyle={{ fontSize: 12, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" }} />
                <Bar dataKey="eff" name="Efficiency %" fill={A} radius={[3, 3, 0, 0]} />
                <Bar dataKey="util" name="Utilization %" fill="#3B82F6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Route cards */}
          <div style={{ ...s.label, marginBottom: 8 }}>Route Details</div>
          {ROUTES.map(r => {
            const rs = routeStates[r.id] || {};
            const effCol = rs.eff > 80 ? "var(--color-text-success)" : rs.eff > 60 ? "var(--color-text-warning)" : "var(--color-text-danger)";
            return (
              <div key={r.id} style={{ ...s.card, marginBottom: 8 }}>
                <div style={{ ...s.flex, justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.from} → {r.to}</div>
                    <div style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
                      {r.id} · {r.dist} km · {r.vehicles} vehicles
                    </div>
                  </div>
                  <div style={{ ...s.flex, gap: 16 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ ...s.mono, fontWeight: 600, color: effCol }}>{Math.round(rs.eff)}%</div>
                      <div style={s.label}>efficiency</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ ...s.mono, fontWeight: 600, color: rs.delay > 20 ? "var(--color-text-danger)" : "var(--color-text-secondary)" }}>{Math.round(rs.delay)}m</div>
                      <div style={s.label}>delay</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ ...s.mono, fontWeight: 600 }}>{Math.round(rs.util)}%</div>
                      <div style={s.label}>utilization</div>
                    </div>
                  </div>
                </div>
                {rs.eff < 70 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-warning)", background: "var(--color-background-warning)", padding: "5px 10px", borderRadius: 6 }}>
                    Low efficiency detected — consider rerouting or adding capacity.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════ AI AGENT TAB ════════════ */}
      {tab === "agent" && (
        <div>
          {/* Agent header */}
          <div style={{ ...s.card, marginBottom: 12 }}>
            <div style={{ ...s.flex, justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>AIRA — Agentic Analysis Mode</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 3 }}>
                  Autonomously analyzes live sensor data and supply chain metrics using Claude AI
                </div>
              </div>
              <div style={{ ...s.flex, gap: 8 }}>
                <label style={{ ...s.flex, gap: 6, cursor: "pointer", fontSize: 12 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>Auto-monitor</span>
                  <div onClick={() => setAutoMode(a => !a)} style={{
                    width: 32, height: 18, borderRadius: 9, background: autoMode ? A : "var(--color-border-secondary)",
                    position: "relative", cursor: "pointer", transition: "background 0.2s",
                  }}>
                    <div style={{ position: "absolute", top: 2, left: autoMode ? 14 : 2, width: 14, height: 14, borderRadius: 7, background: "#fff", transition: "left 0.2s" }} />
                  </div>
                </label>
                <button onClick={runAgent} disabled={agentState.status === "running"} style={{
                  padding: "7px 16px", borderRadius: 8, cursor: agentState.status === "running" ? "default" : "pointer",
                  background: agentState.status === "running" ? "var(--color-border-secondary)" : A,
                  color: agentState.status === "running" ? "var(--color-text-secondary)" : "#000",
                  border: "none", fontSize: 13, fontWeight: 600, transition: "background 0.2s",
                }}>
                  {agentState.status === "running" ? "Analyzing..." : "▶ Run Analysis"}
                </button>
              </div>
            </div>
            {agentState.status === "running" && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: A, animation: "pulse 1s infinite" }} />
                Sending {MACHINES.length} machine readings and {ROUTES.length} route metrics to AIRA...
              </div>
            )}
          </div>

          {/* Agent Result */}
          {agentState.error && (
            <div style={{ ...s.card, marginBottom: 12, borderColor: "var(--color-border-danger)" }}>
              <div style={{ fontSize: 13, color: "var(--color-text-danger)" }}>⚠ Analysis failed: {agentState.error}</div>
            </div>
          )}

          {agentState.result && (
            <div>
              {/* Summary */}
              <div style={{ ...s.card, marginBottom: 10 }}>
                <div style={{ ...s.flex, justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ ...s.label }}>AIRA Assessment</div>
                  <div style={{ ...s.flex, gap: 8 }}>
                    <span style={s.tag(statusColor(agentState.result.overallStatus))}>{agentState.result.overallStatus}</span>
                    <span style={{ ...s.mono, fontSize: 13, fontWeight: 600, color: agentState.result.riskScore > 70 ? "var(--color-text-danger)" : agentState.result.riskScore > 40 ? "var(--color-text-warning)" : "var(--color-text-success)" }}>
                      Risk: {agentState.result.riskScore}/100
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: "var(--color-text-primary)" }}>{agentState.result.summary}</p>
                {agentState.result.issues?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={s.label}>Detected Issues</div>
                    {agentState.result.issues.map((issue, i) => (
                      <div key={i} style={{ ...s.flex, gap: 6, marginTop: 5, fontSize: 12 }}>
                        <span style={{ color: "var(--color-text-danger)", fontSize: 10 }}>●</span>
                        <span>{issue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recommended Actions */}
              {agentState.result.actions?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...s.label, marginBottom: 8 }}>Recommended Actions ({agentState.result.actions.length})</div>
                  {agentState.result.actions.map(action => {
                    const done = executedActions.has(action.id);
                    const priColor = action.priority === "HIGH" ? "var(--color-text-danger)" : action.priority === "MEDIUM" ? "var(--color-text-warning)" : "var(--color-text-success)";
                    return (
                      <div key={action.id} style={{ ...s.card, marginBottom: 8, opacity: done ? 0.6 : 1, borderColor: done ? "var(--color-border-tertiary)" : action.priority === "HIGH" ? "var(--color-border-danger)" : "var(--color-border-tertiary)" }}>
                        <div style={{ ...s.flex, justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                          <div style={{ ...s.flex, gap: 8 }}>
                            <span style={s.tag(priColor)}>{action.priority}</span>
                            <span style={{ ...s.mono, fontSize: 11, background: "var(--color-background-secondary)", padding: "2px 7px", borderRadius: 4 }}>{action.type}</span>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{action.title}</span>
                          </div>
                          <div style={{ ...s.flex, gap: 6 }}>
                            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                              Confidence: <span style={{ color: action.confidence > 0.8 ? "var(--color-text-success)" : "var(--color-text-warning)", fontWeight: 600 }}>{Math.round(action.confidence * 100)}%</span>
                            </span>
                            <button onClick={() => executeAction(action)} disabled={done} style={{
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
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                          <strong style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>Target:</strong> {action.target} — {action.reason}
                        </div>
                        {action.impact && (
                          <div style={{ fontSize: 11, color: "var(--color-text-success)", marginTop: 4 }}>
                            Expected outcome: {action.impact}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Action Log */}
          {actionLog.length > 0 && (
            <div style={s.card}>
              <div style={{ ...s.label, marginBottom: 8 }}>Autonomous Action Log</div>
              {actionLog.slice(0, 8).map(log => (
                <div key={log.id} style={{ ...s.flex, gap: 10, padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12 }}>
                  <span style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)", minWidth: 60 }}>{log.time}</span>
                  <span style={s.tag(log.priority === "HIGH" ? "var(--color-text-danger)" : "var(--color-text-warning)")}>{log.type}</span>
                  <span style={{ flex: 1 }}>{log.action}</span>
                  <span style={{ ...s.mono, fontSize: 11, color: "var(--color-text-secondary)" }}>{log.target}</span>
                </div>
              ))}
            </div>
          )}

          {agentState.status === "idle" && !agentState.result && (
            <div style={{ ...s.panel, textAlign: "center", padding: 30 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🤖</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>AIRA is standing by</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 5 }}>
                Click "Run Analysis" to let AIRA autonomously analyze all machine and supply chain data, identify risks, and recommend actions with full reasoning.
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
