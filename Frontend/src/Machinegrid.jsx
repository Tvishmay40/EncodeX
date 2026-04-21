import React, { useEffect } from "react";

// ─── Inject Google Font once ──────────────────────────────────────────────────
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

// ─── Config ───────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  active:    { label: "ACTIVE",    color: "#34d399" },
  paused:    { label: "PAUSED",    color: "#fbbf24" },
  emergency: { label: "EMERGENCY", color: "#f87171" },
};
const ACCENTS = {
  cnc_1:     "#00ffe5",
  printer_1: "#bf5fff",
  lathe_1:   "#ffb800",
  robot_1:   "#00aaff",
};

// ─── Machine Visualizers ──────────────────────────────────────────────────────

/** CNC: spindle fixed center, work bed slides L/R */
function CNCViz({ position, color }) {
  const x = Math.min(100, Math.max(0, position?.x ?? 50));
  const bedOffset = -28 + (x / 100) * 56;
  return (
    <svg viewBox="0 0 120 68" width="100%" height="100%" style={{ display: "block" }}>
      <rect x="5" y="8" width="110" height="54" rx="3" fill="none" stroke="#1e3a5f" strokeWidth="1.2" />
      <rect x="10" y="12" width="100" height="4" rx="1" fill="#1e3a5f" />
      {/* Spindle — fixed */}
      <rect x="53" y="12" width="14" height="18" rx="2" fill={color} opacity="0.82" />
      <rect x="58" y="30" width="4" height="8"  rx="1" fill={color} />
      <polygon points="60,38 57,44 63,44" fill={color} opacity="0.65" />
      {/* Moving bed */}
      <g transform={`translate(${bedOffset},0)`}>
        <rect x="18" y="48" width="84" height="12" rx="2" fill="#0f2744" stroke={color} strokeWidth="0.8" />
        <rect x="40" y="45" width="40" height="8"  rx="1" fill="#162032" stroke={color} strokeWidth="0.6" strokeDasharray="3 2" />
      </g>
      <line x1="10" y1="60" x2="110" y2="60" stroke="#1e3a5f" strokeWidth="1.4" />
      <text x="60" y="67" textAnchor="middle" fontSize="6" fill="#475569" fontFamily="monospace">{`BED X:${Math.round(x)}`}</text>
    </svg>
  );
}

/** 3D Printer: extruder head moves along top rail */
function PrinterViz({ position, color }) {
  const x = Math.min(100, Math.max(0, position?.x ?? 50));
  const headX = 16 + (x / 100) * 86;
  return (
    <svg viewBox="0 0 120 68" width="100%" height="100%" style={{ display: "block" }}>
      <rect x="8"   y="6"  width="5"  height="58" rx="1" fill="#1e3a5f" />
      <rect x="107" y="6"  width="5"  height="58" rx="1" fill="#1e3a5f" />
      <rect x="8"   y="6"  width="104" height="5" rx="1" fill="#1e3a5f" />
      <line x1="13" y1="20" x2="107" y2="20" stroke="#334155" strokeWidth="1.5" />
      {/* Extruder carriage */}
      <rect x={headX - 8} y="14" width="16" height="13" rx="2" fill={color} opacity="0.82" />
      <rect x={headX - 2} y="27" width="4"  height="7"  rx="1" fill={color} />
      <polygon points={`${headX},34 ${headX - 3},40 ${headX + 3},40`} fill={color} opacity="0.65" />
      {/* Partial print on bed */}
      <rect x="14" y="53" width="92" height="7" rx="2" fill="#0f2744" stroke={color} strokeWidth="0.8" />
      <rect x="42" y="44" width="36" height="10" rx="1" fill="#162032" stroke={color} strokeWidth="0.6" />
      <rect x="48" y="41" width="24" height="4"  rx="1" fill="#162032" stroke={color} strokeWidth="0.5" strokeDasharray="2 2" />
      <text x="60" y="67" textAnchor="middle" fontSize="6" fill="#475569" fontFamily="monospace">{`HEAD X:${Math.round(x)}`}</text>
    </svg>
  );
}

/** Lathe: tool-head carriage slides toward/away from rotating workpiece */
function LatheViz({ position, color }) {
  const x = Math.min(100, Math.max(0, position?.x ?? 50));
  const toolX = 88 - (x / 100) * 48; // x=100 → close, x=0 → far right
  return (
    <svg viewBox="0 0 120 68" width="100%" height="100%" style={{ display: "block" }}>
      {/* Bed */}
      <rect x="5" y="50" width="110" height="8" rx="2" fill="#1e3a5f" />
      {/* Headstock box */}
      <rect x="7" y="26" width="20" height="26" rx="2" fill="#0f2744" stroke="#334155" strokeWidth="1" />
      {/* Chuck */}
      <circle cx="27" cy="37" r="12" fill="#0f2744" stroke={color} strokeWidth="1.1" />
      {[0, 90, 180, 270].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const jx = 27 + Math.cos(rad) * 8, jy = 37 + Math.sin(rad) * 8;
        return <rect key={i} x={jx - 2.5} y={jy - 2.5} width="5" height="5" rx="1" fill={color} opacity="0.7" transform={`rotate(${deg},${jx},${jy})`} />;
      })}
      {/* Workpiece */}
      <rect x="27" y="31" width="55" height="12" rx="1" fill="#162032" stroke={color} strokeWidth="0.7" />
      {/* Tailstock */}
      <rect x="92" y="32" width="16" height="20" rx="2" fill="#0f2744" stroke="#334155" strokeWidth="1" />
      <rect x="96" y="35" width="8"  height="4"  rx="1" fill="#334155" />
      {/* Carriage rail */}
      <line x1="27" y1="50" x2="92" y2="50" stroke="#334155" strokeWidth="1.2" />
      {/* Sliding tool post */}
      <rect x={toolX - 4} y="41" width="12" height="10" rx="1" fill="#0f2744" stroke={color} strokeWidth="0.8" />
      <polygon points={`${toolX - 4},45 ${toolX - 10},38 ${toolX - 4},38`} fill={color} opacity="0.82" />
      <text x="60" y="67" textAnchor="middle" fontSize="6" fill="#475569" fontFamily="monospace">{`TOOL X:${Math.round(x)}`}</text>
    </svg>
  );
}

/** Robotic Arm: 2-segment IK arm driven by x/y */
function RobotArmViz({ position, color }) {
  const x = Math.min(100, Math.max(0, position?.x ?? 50));
  const y = Math.min(100, Math.max(0, position?.y ?? 50));

  const bx = 60, by = 60;
  const L1 = 22, L2 = 18;
  const shoulderDeg = -65 + (x / 100) * 130;
  const elbowRelDeg = -85 + (y / 100) * 105;
  const toR = (d) => (d * Math.PI) / 180;
  const sR = toR(shoulderDeg - 90);
  const eR = toR(shoulderDeg - 90 + elbowRelDeg);
  const ex = bx + L1 * Math.cos(sR), ey = by + L1 * Math.sin(sR);
  const wx = ex + L2 * Math.cos(eR), wy = ey + L2 * Math.sin(eR);

  return (
    <svg viewBox="0 0 120 68" width="100%" height="100%" style={{ display: "block" }}>
      <rect x="5" y="62" width="110" height="4" rx="1" fill="#1e3a5f" />
      <rect x="50" y="54" width="20" height="10" rx="2" fill="#0f2744" stroke="#334155" strokeWidth="1" />
      {/* Arm segments */}
      <line x1={bx} y1={by} x2={ex} y2={ey} stroke={color} strokeWidth="4" strokeLinecap="round" />
      <line x1={ex} y1={ey} x2={wx} y2={wy} stroke={color} strokeWidth="2.8" strokeLinecap="round" opacity="0.82" />
      {/* Joints */}
      <circle cx={bx} cy={by} r="5"   fill="#1e293b" stroke={color} strokeWidth="1.2" />
      <circle cx={ex} cy={ey} r="3.8" fill="#1e293b" stroke={color} strokeWidth="1.1" />
      {/* Gripper */}
      <circle cx={wx} cy={wy} r="2.8" fill={color} opacity="0.9" />
      <line x1={wx - 5} y1={wy} x2={wx + 5} y2={wy} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={wx - 5} y1={wy - 3} x2={wx - 5} y2={wy + 3} stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1={wx + 5} y1={wy - 3} x2={wx + 5} y2={wy + 3} stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <text x="60" y="67" textAnchor="middle" fontSize="6" fill="#475569" fontFamily="monospace">{`X:${Math.round(x)} Y:${Math.round(y)}`}</text>
    </svg>
  );
}

const VIZ = { CNC: CNCViz, "3D Printer": PrinterViz, Lathe: LatheViz, "Robotic Arm": RobotArmViz };

// ─── Stat Chip ────────────────────────────────────────────────────────────────
function Chip({ label, value, unit, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 3,
      padding: "2px 6px", borderRadius: 4,
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${color}33`, color,
      fontSize: 10, fontFamily: "inherit",
    }}>
      <span style={{ opacity: 0.5, fontSize: 9 }}>{label}</span>
      <span style={{ fontWeight: "bold" }}>{value}</span>
      <span style={{ opacity: 0.38, fontSize: 9 }}>{unit}</span>
    </div>
  );
}

// ─── Machine Card ─────────────────────────────────────────────────────────────
function MachineCard({ machineKey, data }) {
  const accent = ACCENTS[machineKey] ?? "#00ffe5";
  const st     = STATUS_CFG[data.status] ?? STATUS_CFG.paused;
  const isE    = data.status === "emergency";
  const Viz    = VIZ[data.type] ?? CNCViz;

  return (
    <div
      className={isE ? "mg-emerg" : ""}
      style={{
        position: "relative",
        display: "flex", flexDirection: "column", gap: 6,
        padding: "9px 9px 7px",
        borderRadius: 8, overflow: "hidden",
        border: `1px solid ${isE ? "#ef4444" : accent}`,
        boxSizing: "border-box", minHeight: 0,
        background: isE ? undefined
          : "linear-gradient(145deg,rgba(15,23,42,0.97) 0%,rgba(15,23,42,0.78) 100%)",
      }}
    >
      {/* Scanline texture */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 8,
        backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.014) 2px,rgba(255,255,255,0.014) 3px)",
      }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: "bold", letterSpacing: "0.18em", textTransform: "uppercase", color: accent }}>{data.type}</div>
          <div style={{ fontSize: 9,  letterSpacing: "0.12em", textTransform: "uppercase", color: "#475569" }}>{machineKey}</div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "2px 7px", borderRadius: 20,
          border: `1px solid ${st.color}`, background: "rgba(0,0,0,0.45)",
          fontSize: 9, fontWeight: "bold", letterSpacing: "0.1em", color: st.color, flexShrink: 0,
        }}>
          <span className={isE ? "mg-ping" : "mg-pulse"} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: st.color }} />
          {st.label}
        </div>
      </div>

      {/* Visualizer */}
      <div style={{
        flex: 1, minHeight: 0,
        background: "rgba(0,0,0,0.30)", borderRadius: 5,
        overflow: "hidden", position: "relative", zIndex: 1,
        display: "flex", alignItems: "stretch",
      }}>
        <Viz position={data.position} color={accent} status={data.status} />
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", position: "relative", zIndex: 1, flexShrink: 0 }}>
        <Chip label="TEMP" value={data.temp_c       ?? "—"} unit="°C" color="#ff6b6b" />
        <Chip label="PWR"  value={data.power_w      ?? "—"} unit="W"  color="#ffd93d" />
        <Chip label="VIB"  value={data.vibration_hz ?? "—"} unit="Hz" color="#6bcb77" />
      </div>
    </div>
  );
}

// ─── MachineGrid — Main Export ────────────────────────────────────────────────
export default function MachineGrid({ telemetry }) {
  useFont();

  const data = telemetry ?? {
    global_emergency: false,
    machines: {
      cnc_1:     { type: "CNC",         status: "active",    temp_c: 45,  power_w: 1200, vibration_hz: 12, position: { x: 20, y: 50 } },
      printer_1: { type: "3D Printer",  status: "paused",    temp_c: 210, power_w: 340,  vibration_hz: 4,  position: { x: 60, y: 70 } },
      lathe_1:   { type: "Lathe",       status: "active",    temp_c: 78,  power_w: 860,  vibration_hz: 30, position: { x: 70, y: 50 } },
      robot_1:   { type: "Robotic Arm", status: "emergency", temp_c: 99,  power_w: 2400, vibration_hz: 55, position: { x: 45, y: 60 } },
    },
  };

  const machines        = data.machines ?? {};
  const globalEmergency = Boolean(data.global_emergency);
  const SLOTS           = ["cnc_1", "printer_1", "lathe_1", "robot_1"];

  return (
    <div style={{
      // ── Layout root — caller must give this a defined height (e.g. height:100vh) ──
      width: "100%", height: "100%", minHeight: 320,
      display: "flex", flexDirection: "column",
      padding: 14, boxSizing: "border-box",
      background: "#0f172a",
      fontFamily: "'Share Tech Mono','Courier New',monospace",
      position: "relative", borderRadius: 10, overflow: "hidden",
    }}>
      <style>{`
        @keyframes mg-bg{0%,100%{background-color:rgba(127,29,29,0.33)}50%{background-color:rgba(185,28,28,0.62)}}
        @keyframes mg-border{0%,100%{box-shadow:0 0 16px #ef444450,inset 0 0 16px #ef444416}50%{box-shadow:0 0 36px #ef4444aa,inset 0 0 32px #ef444438}}
        @keyframes mg-pulse{0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes mg-ping{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.75);opacity:0.4}}
        .mg-emerg{animation:mg-bg 1.2s ease-in-out infinite}
        .mg-g-emerg{animation:mg-border 1s ease-in-out infinite}
        .mg-pulse{animation:mg-pulse 1.4s ease-in-out infinite}
        .mg-ping{animation:mg-ping 0.85s ease-in-out infinite}
      `}</style>

      {/* Global emergency border */}
      {globalEmergency && (
        <div className="mg-g-emerg" style={{ position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none", border: "3px solid #ef4444", borderRadius: 10 }} />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.35em", textTransform: "uppercase", color: "#475569" }}>Industrial Control System</div>
          <div style={{ fontSize: 14, fontWeight: "bold", letterSpacing: "0.1em", textTransform: "uppercase", color: "#00ffe5" }}>Machine Grid — Floor A</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          <span className={globalEmergency ? "mg-ping" : "mg-pulse"} style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: globalEmergency ? "#f87171" : "#34d399" }} />
          <span style={{ color: globalEmergency ? "#f87171" : "#34d399" }}>
            {globalEmergency ? "GLOBAL EMERGENCY" : "ALL SYSTEMS NOMINAL"}
          </span>
        </div>
      </div>

      {/* 2×2 Grid — KEY: minHeight:0 + flex:1 + explicit gridTemplateRows */}
      <div style={{
        flex: 1, minHeight: 0,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: 10,
      }}>
        {SLOTS.map((key) => {
          const m = machines[key];
          return m ? (
            <MachineCard key={key} machineKey={key} data={m} />
          ) : (
            <div key={key} style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 8, border: "1px dashed #1e293b",
              background: "rgba(15,23,42,0.4)", color: "#334155",
              fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
            }}>
              NO SIGNAL — {key.toUpperCase()}
            </div>
          );
        })}
      </div>
    </div>
  );
}