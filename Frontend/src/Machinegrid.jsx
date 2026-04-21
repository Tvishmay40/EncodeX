import React, { useState, useEffect } from "react";

// ─── Font injection ───────────────────────────────────────────────────────────
let _fontInjected = false;
function useFont() {
  useEffect(() => {
    if (_fontInjected) return;
    _fontInjected = true;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap";
    document.head.appendChild(l);
  }, []);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  active: { label: "ACTIVE", color: "#34d399" },
  paused: { label: "PAUSED", color: "#fbbf24" },
  emergency: { label: "EMERGENCY", color: "#f87171" },
};

const ACCENTS = {
  cnc_1: "#00ffe5",
  printer_1: "#bf5fff",
  lathe_1: "#ffb800",
  robot_1: "#00aaff",
};

// ─── Machine Visualizers (With Status-Aware Animations) ───────────────────────

function CNCViz({ position, color, status }) {
  const x = Math.min(100, Math.max(0, position?.x ?? 50));
  const bedOffset = -28 + (x / 100) * 56;
  const isActive = status === 'active';

  return (
    <svg viewBox="0 0 120 68" width="100%" height="100%" style={{ display: "block" }}>
      <rect x="5" y="8" width="110" height="54" rx="3" fill="none" stroke="#1e3a5f" strokeWidth="1.2" />
      <rect x="10" y="12" width="100" height="4" rx="1" fill="#1e3a5f" />

      {/* Spindle — Spins when active */}
      <g style={{ transformOrigin: '60px 21px', animation: isActive ? 'mg-spin 0.5s linear infinite' : 'none' }}>
        <rect x="53" y="12" width="14" height="18" rx="2" fill={color} opacity="0.82" />
        <rect x="58" y="30" width="4" height="8" rx="1" fill={color} />
      </g>

      {/* Laser/Drill effect */}
      <polygon points="60,38 57,44 63,44" fill={color} opacity={isActive ? 0.8 : 0.2} />

      {/* Moving bed */}
      <g transform={`translate(${bedOffset},0)`}>
        <rect x="18" y="48" width="84" height="12" rx="2" fill="#0f2744" stroke={color} strokeWidth="0.8" />
        <rect x="40" y="45" width="40" height="8" rx="1" fill="#162032" stroke={color} strokeWidth="0.6" strokeDasharray="3 2" />
      </g>
      <line x1="10" y1="60" x2="110" y2="60" stroke="#1e3a5f" strokeWidth="1.4" />
      <text x="60" y="67" textAnchor="middle" fontSize="6" fill="#475569" fontFamily="monospace">
        {`BED X:${Math.round(x)}`}
      </text>
    </svg>
  );
}

function PrinterViz({ position, color, status }) {
  const x = Math.min(100, Math.max(0, position?.x ?? 50));
  const headX = 16 + (x / 100) * 86;
  const isActive = status === 'active';

  return (
    <svg viewBox="0 0 120 68" width="100%" height="100%" style={{ display: "block" }}>
      <rect x="8" y="6" width="5" height="58" rx="1" fill="#1e3a5f" />
      <rect x="107" y="6" width="5" height="58" rx="1" fill="#1e3a5f" />
      <rect x="8" y="6" width="104" height="5" rx="1" fill="#1e3a5f" />
      <line x1="13" y1="20" x2="107" y2="20" stroke="#334155" strokeWidth="1.5" />

      {/* Extruder carriage */}
      <rect x={headX - 8} y="14" width="16" height="13" rx="2" fill={color} opacity="0.82" />
      <rect x={headX - 2} y="27" width="4" height="7" rx="1" fill={color} />
      <polygon points={`${headX},34 ${headX - 3},40 ${headX + 3},40`} fill={color} opacity={isActive ? 0.8 : 0.2} />

      {/* Bed + print */}
      <rect x="14" y="53" width="92" height="7" rx="2" fill="#0f2744" stroke={color} strokeWidth="0.8" />
      <rect x="42" y="44" width="36" height="10" rx="1" fill="#162032" stroke={color} strokeWidth="0.6" />
      <rect x="48" y="41" width="24" height="4" rx="1" fill="#162032" stroke={color} strokeWidth="0.5" strokeDasharray="2 2" />
      <text x="60" y="67" textAnchor="middle" fontSize="6" fill="#475569" fontFamily="monospace">
        {`HEAD X:${Math.round(x)}`}
      </text>
    </svg>
  );
}

function LatheViz({ position, color, status }) {
  const x = Math.min(100, Math.max(0, position?.x ?? 50));
  const toolX = 88 - (x / 100) * 48;
  const isActive = status === 'active';

  return (
    <svg viewBox="0 0 120 68" width="100%" height="100%" style={{ display: "block" }}>
      <rect x="5" y="50" width="110" height="8" rx="2" fill="#1e3a5f" />
      <rect x="7" y="26" width="20" height="26" rx="2" fill="#0f2744" stroke="#334155" strokeWidth="1" />

      {/* Spinning Lathe Chuck */}
      <g style={{ transformOrigin: '27px 37px', animation: isActive ? 'mg-spin 0.4s linear infinite' : 'none' }}>
        <circle cx="27" cy="37" r="12" fill="#0f2744" stroke={color} strokeWidth="1.1" />
        {[0, 90, 180, 270].map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const jx = 27 + Math.cos(rad) * 8, jy = 37 + Math.sin(rad) * 8;
          return (
            <rect key={i} x={jx - 2.5} y={jy - 2.5} width="5" height="5" rx="1"
              fill={color} opacity="0.7" transform={`rotate(${deg},${jx},${jy})`} />
          );
        })}
      </g>

      <rect x="27" y="31" width="55" height="12" rx="1" fill="#162032" stroke={color} strokeWidth="0.7" />
      <rect x="92" y="32" width="16" height="20" rx="2" fill="#0f2744" stroke="#334155" strokeWidth="1" />
      <rect x="96" y="35" width="8" height="4" rx="1" fill="#334155" />
      <line x1="27" y1="50" x2="92" y2="50" stroke="#334155" strokeWidth="1.2" />
      {/* Sliding tool post */}
      <rect x={toolX - 4} y="41" width="12" height="10" rx="1" fill="#0f2744" stroke={color} strokeWidth="0.8" />
      <polygon points={`${toolX - 4},45 ${toolX - 10},38 ${toolX - 4},38`} fill={color} opacity="0.82" />
      <text x="60" y="67" textAnchor="middle" fontSize="6" fill="#475569" fontFamily="monospace">
        {`TOOL X:${Math.round(x)}`}
      </text>
    </svg>
  );
}

function RobotArmViz({ position, color, status }) {
  const x = Math.min(100, Math.max(0, position?.x ?? 50));
  const y = Math.min(100, Math.max(0, position?.y ?? 50));
  const bx = 60, by = 60, L1 = 22, L2 = 18;
  const toR = (d) => (d * Math.PI) / 180;

  // If paused, freeze the math slightly to prevent jitter
  const calcX = status === 'active' ? x : 50;
  const calcY = status === 'active' ? y : 50;

  const sR = toR((-65 + (calcX / 100) * 130) - 90);
  const eR = toR((-65 + (calcX / 100) * 130) - 90 + (-85 + (calcY / 100) * 105));
  const ex = bx + L1 * Math.cos(sR), ey = by + L1 * Math.sin(sR);
  const wx = ex + L2 * Math.cos(eR), wy = ey + L2 * Math.sin(eR);

  return (
    <svg viewBox="0 0 120 68" width="100%" height="100%" style={{ display: "block", transition: 'all 0.3s ease' }}>
      <rect x="5" y="62" width="110" height="4" rx="1" fill="#1e3a5f" />
      <rect x="50" y="54" width="20" height="10" rx="2" fill="#0f2744" stroke="#334155" strokeWidth="1" />
      <line x1={bx} y1={by} x2={ex} y2={ey} stroke={color} strokeWidth="4" strokeLinecap="round" />
      <line x1={ex} y1={ey} x2={wx} y2={wy} stroke={color} strokeWidth="2.8" strokeLinecap="round" opacity="0.82" />
      <circle cx={bx} cy={by} r="5" fill="#1e293b" stroke={color} strokeWidth="1.2" />
      <circle cx={ex} cy={ey} r="3.8" fill="#1e293b" stroke={color} strokeWidth="1.1" />

      {/* End Effector glowing when active */}
      <circle cx={wx} cy={wy} r="2.8" fill={color} opacity={status === 'active' ? 1 : 0.4} />
      <line x1={wx - 5} y1={wy} x2={wx + 5} y2={wy} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={wx - 5} y1={wy - 3} x2={wx - 5} y2={wy + 3} stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1={wx + 5} y1={wy - 3} x2={wx + 5} y2={wy + 3} stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <text x="60" y="67" textAnchor="middle" fontSize="6" fill="#475569" fontFamily="monospace">
        {`X:${Math.round(calcX)} Y:${Math.round(calcY)}`}
      </text>
    </svg>
  );
}

const VIZ = {
  "CNC": CNCViz,
  "3D Printer": PrinterViz,
  "Lathe": LatheViz,
  "Robotic Arm": RobotArmViz,
};

// ... (Chip function remains exactly the same)
function Chip({ label, value, unit, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 4,
      background: "rgba(255,255,255,0.04)", border: `1px solid ${color}33`, color, fontSize: 10, fontFamily: "inherit",
    }}>
      <span style={{ opacity: 0.5, fontSize: 9 }}>{label}</span>
      <span style={{ fontWeight: "bold" }}>{value}</span>
      <span style={{ opacity: 0.38, fontSize: 9 }}>{unit}</span>
    </div>
  );
}

// ... (MachineCard function remains exactly the same from the previous step)
function MachineCard({ machineKey, data, onAction }) {
  const accent = ACCENTS[machineKey] ?? "#00ffe5";
  const st = STATUS_CFG[data.status] ?? STATUS_CFG.paused;
  const isE = data.status === "emergency";
  const Viz = VIZ[data.type] ?? CNCViz;

  const [overrideTemp, setOverrideTemp] = useState(data.temp_c || 50);
  const [overrideVib, setOverrideVib] = useState(data.vibration_hz || 10);

  const handleTrigger = () => {
    if (!onAction) return;
    onAction({ event: "inject_failure", machine_id: machineKey, parameter: "temp_c", target_value: overrideTemp });
    onAction({ event: "inject_failure", machine_id: machineKey, parameter: "vibration", target_value: overrideVib });
  };

  return (
    <div className={isE ? "mg-emerg" : ""} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6, padding: "9px 9px 7px", borderRadius: 8, overflow: "hidden", border: `1px solid ${isE ? "#ef4444" : accent}`, boxSizing: "border-box", minHeight: 0, background: isE ? undefined : "linear-gradient(145deg,rgba(15,23,42,0.97) 0%,rgba(15,23,42,0.78) 100%)" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 8, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.014) 2px,rgba(255,255,255,0.014) 3px)" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: "bold", letterSpacing: "0.18em", textTransform: "uppercase", color: accent }}>{data.type}</div>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#475569" }}>{machineKey}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 7px", borderRadius: 20, border: `1px solid ${st.color}`, background: "rgba(0,0,0,0.45)", fontSize: 9, fontWeight: "bold", letterSpacing: "0.1em", color: st.color, flexShrink: 0 }}>
          <span className={isE ? "mg-ping" : "mg-pulse"} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: st.color }} />
          {st.label}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, background: "rgba(0,0,0,0.30)", borderRadius: 5, overflow: "hidden", position: "relative", zIndex: 1, display: "flex", alignItems: "stretch" }}>
        <Viz position={data.position} color={accent} status={data.status} />
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", position: "relative", zIndex: 1, flexShrink: 0 }}>
        <Chip label="TEMP" value={data.temp_c ?? "—"} unit="°C" color="#ff6b6b" />
        <Chip label="PWR" value={data.power_w ?? "—"} unit="W" color="#ffd93d" />
        <Chip label="VIB" value={data.vibration_hz ?? "—"} unit="Hz" color="#6bcb77" />
      </div>
      <div style={{ marginTop: "auto", paddingTop: 8, borderTop: "1px solid rgba(51,65,85,0.5)", display: "flex", flexDirection: "column", gap: 6, position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: "#64748b", fontWeight: "bold" }}>Manual Fault Injection</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, fontFamily: "inherit" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#94a3b8", width: 25 }}>TEMP</span>
            <input type="range" min="20" max="500" value={overrideTemp} onChange={(e) => setOverrideTemp(e.target.value)} style={{ flex: 1, height: 4, borderRadius: 2, appearance: "none", background: "rgba(255,255,255,0.1)", accentColor: "#ff6b6b", cursor: "pointer" }} />
            <span style={{ color: "#ff6b6b", width: 20, textAlign: "right" }}>{overrideTemp}°</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#94a3b8", width: 25 }}>VIBE</span>
            <input type="range" min="0" max="100" value={overrideVib} onChange={(e) => setOverrideVib(e.target.value)} style={{ flex: 1, height: 4, borderRadius: 2, appearance: "none", background: "rgba(255,255,255,0.1)", accentColor: "#6bcb77", cursor: "pointer" }} />
            <span style={{ color: "#6bcb77", width: 20, textAlign: "right" }}>{overrideVib}</span>
          </div>
        </div>
        <button onClick={handleTrigger} style={{ marginTop: 4, padding: "4px 0", borderRadius: 4, fontSize: 9, fontWeight: "bold", letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer", color: "#ef4444", background: "rgba(127,29,29,0.3)", border: "1px solid rgba(239,68,68,0.4)", transition: "all 0.2s" }} onMouseOver={(e) => e.target.style.background = "rgba(127,29,29,0.6)"} onMouseOut={(e) => e.target.style.background = "rgba(127,29,29,0.3)"}>
          Execute Fault Override
        </button>
      </div>
    </div>
  );
}

function getSimulatedData(t) {
  // Same simulated data as before
  return {
    global_emergency: false,
    machines: {
      cnc_1: { type: "CNC", status: "active", temp_c: Math.round(44 + Math.sin(t) * 3), power_w: Math.round(1200 + Math.sin(t * 1.3) * 80), vibration_hz: Math.round(12 + Math.sin(t * 2) * 2), position: { x: 50 + Math.sin(t) * 40, y: 50 } },
      printer_1: { type: "3D Printer", status: "active", temp_c: Math.round(210 + Math.sin(t * 0.5) * 4), power_w: Math.round(340 + Math.cos(t) * 20), vibration_hz: 4, position: { x: 50 + Math.cos(t * 1.5) * 40, y: 70 } },
      lathe_1: { type: "Lathe", status: "paused", temp_c: Math.round(78 + Math.cos(t * 0.8) * 5), power_w: Math.round(860 + Math.sin(t * 1.1) * 60), vibration_hz: Math.round(30 + Math.sin(t * 3) * 4), position: { x: 50 + Math.sin(t * 2) * 35, y: 50 } },
      robot_1: { type: "Robotic Arm", status: "active", temp_c: Math.round(62 + Math.sin(t * 0.7) * 6), power_w: Math.round(980 + Math.cos(t * 1.2) * 100), vibration_hz: Math.round(18 + Math.sin(t * 2.5) * 3), position: { x: 50 + Math.sin(t) * 30, y: 50 + Math.cos(t) * 30 } },
    },
  };
}

export default function MachineGrid({ telemetry, onAction }) {
  useFont();
  const [liveData, setLiveData] = useState(() => telemetry ?? getSimulatedData(0));

  useEffect(() => {
    if (telemetry) { setLiveData(telemetry); return; }
    const id = setInterval(() => { setLiveData(getSimulatedData(Date.now() / 1000)); }, 100);
    return () => clearInterval(id);
  }, [telemetry]);

  const machines = liveData?.machines ?? {};
  const globalEmergency = Boolean(liveData?.global_emergency);
  const SLOTS = ["cnc_1", "printer_1", "lathe_1", "robot_1"];

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 320, display: "flex", flexDirection: "column", padding: 14, boxSizing: "border-box", background: "#0f172a", fontFamily: "'Share Tech Mono','Courier New',monospace", position: "relative", borderRadius: 10, overflow: "hidden" }}>
      <style>{`
        @keyframes mg-spin  { 100% { transform: rotate(360deg); } }
        @keyframes mg-bg    {0%,100%{background-color:rgba(127,29,29,.33)}50%{background-color:rgba(185,28,28,.62)}}
        @keyframes mg-border{0%,100%{box-shadow:0 0 16px #ef444450,inset 0 0 16px #ef444416}50%{box-shadow:0 0 36px #ef4444aa,inset 0 0 32px #ef444438}}
        @keyframes mg-pulse {0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes mg-ping  {0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.75);opacity:.4}}
        .mg-emerg  {animation:mg-bg     1.2s ease-in-out infinite}
        .mg-g-emerg{animation:mg-border 1s   ease-in-out infinite}
        .mg-pulse  {animation:mg-pulse  1.4s ease-in-out infinite}
        .mg-ping   {animation:mg-ping   .85s ease-in-out infinite}
      `}</style>

      {globalEmergency && <div className="mg-g-emerg" style={{ position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none", border: "3px solid #ef4444", borderRadius: 10 }} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.35em", textTransform: "uppercase", color: "#475569" }}>Industrial Control System</div>
          <div style={{ fontSize: 14, fontWeight: "bold", letterSpacing: "0.1em", textTransform: "uppercase", color: "#00ffe5" }}>Machine Grid — Floor A</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          <span className={globalEmergency ? "mg-ping" : "mg-pulse"} style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: globalEmergency ? "#f87171" : "#34d399" }} />
          <span style={{ color: globalEmergency ? "#f87171" : "#34d399" }}>{globalEmergency ? "GLOBAL EMERGENCY" : "ALL SYSTEMS NOMINAL"}</span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 10 }}>
        {SLOTS.map((key) => {
          const m = machines[key];
          return m ? <MachineCard key={key} machineKey={key} data={m} onAction={onAction} /> : <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px dashed #1e293b", background: "rgba(15,23,42,0.4)", color: "#334155", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>NO SIGNAL — {key.toUpperCase()}</div>;
        })}
      </div>
    </div>
  );
}