import React, { useState, useEffect } from "react";

// ... (Keep your STATUS_CFG and ACCENTS constants)

// ─── Animated Visualizers ──────────────────────────────────────────────────

/** CNC: Added transition to the moving bed */
function CNCViz({ position, color }) {
  const x = Math.min(100, Math.max(0, position?.x ?? 50));
  const bedOffset = -28 + (x / 100) * 56;
  return (
    <svg viewBox="0 0 120 68" width="100%" height="100%" style={{ display: "block" }}>
      <rect x="5" y="8" width="110" height="54" rx="3" fill="none" stroke="#1e3a5f" strokeWidth="1.2" />
      <rect x="53" y="12" width="14" height="18" rx="2" fill={color} opacity="0.82" />
      {/* Bed with smooth transition */}
      <g transform={`translate(${bedOffset},0)`} style={{ transition: "transform 0.4s ease-out" }}>
        <rect x="18" y="48" width="84" height="12" rx="2" fill="#0f2744" stroke={color} strokeWidth="0.8" />
        <rect x="40" y="45" width="40" height="8"  rx="1" fill="#162032" stroke={color} strokeWidth="0.6" strokeDasharray="3 2" />
      </g>
      <text x="60" y="67" textAnchor="middle" fontSize="6" fill="#475569" fontFamily="monospace">{`BED X:${Math.round(x)}`}</text>
    </svg>
  );
}

/** 3D Printer: Added transition to the extruder head */
function PrinterViz({ position, color }) {
  const x = Math.min(100, Math.max(0, position?.x ?? 50));
  const headX = 16 + (x / 100) * 86;
  return (
    <svg viewBox="0 0 120 68" width="100%" height="100%" style={{ display: "block" }}>
      <rect x="8" y="6" width="104" height="5" rx="1" fill="#1e3a5f" />
      {/* Extruder with transition */}
      <rect 
        x={headX - 8} y="14" width="16" height="13" rx="2" fill={color} opacity="0.82" 
        style={{ transition: "x 0.4s ease-out" }} 
      />
      <rect 
        x={headX - 2} y="27" width="4" height="7" rx="1" fill={color} 
        style={{ transition: "x 0.4s ease-out" }} 
      />
      <text x="60" y="67" textAnchor="middle" fontSize="6" fill="#475569" fontFamily="monospace">{`HEAD X:${Math.round(x)}`}</text>
    </svg>
  );
}

/** Robot Arm: Coordinates update automatically via the simulation loop */
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
      <line x1={bx} y1={by} x2={ex} y2={ey} stroke={color} strokeWidth="4" strokeLinecap="round" style={{ transition: "all 0.4s ease-out" }} />
      <line x1={ex} y1={ey} x2={wx} y2={wy} stroke={color} strokeWidth="2.8" strokeLinecap="round" style={{ transition: "all 0.4s ease-out" }} />
      <circle cx={ex} cy={ey} r="3.8" fill="#1e293b" stroke={color} strokeWidth="1.1" style={{ transition: "all 0.4s ease-out" }} />
      <text x="60" y="67" textAnchor="middle" fontSize="6" fill="#475569" fontFamily="monospace">{`X:${Math.round(x)} Y:${Math.round(y)}`}</text>
    </svg>
  );
}

// ... (Keep Chip and MachineCard components)

// ─── MachineGrid — Main Export with Simulation ──────────────────────────────
export default function MachineGrid({ telemetry }) {
  // Use local state to store telemetry so we can animate it
  const [liveData, setLiveData] = useState(telemetry || null);

  useEffect(() => {
    // If we have real telemetry from props, use that
    if (telemetry) {
      setLiveData(telemetry);
      return;
    }

    // Simulation Engine: Updates coordinates every 100ms
    const interval = setInterval(() => {
      const time = Date.now() / 1000;
      setLiveData({
        global_emergency: false,
        machines: {
          cnc_1: { type: "CNC", status: "active", temp_c: 45, power_w: 1200, vibration_hz: 12, 
                   position: { x: 50 + Math.sin(time) * 30, y: 50 } },
          printer_1: { type: "3D Printer", status: "active", temp_c: 210, power_w: 340, vibration_hz: 4, 
                       position: { x: 50 + Math.cos(time * 1.5) * 40, y: 70 } },
          lathe_1: { type: "Lathe", status: "active", temp_c: 78, power_w: 860, vibration_hz: 30, 
                     position: { x: 50 + Math.sin(time * 2) * 20, y: 50 } },
          robot_1: { type: "Robotic Arm", status: "active", temp_c: 99, power_w: 2400, vibration_hz: 55, 
                     position: { x: 50 + Math.sin(time) * 25, y: 50 + Math.cos(time) * 25 } },
        },
      });
    }, 100);

    return () => clearInterval(interval);
  }, [telemetry]);

  if (!liveData) return <div className="text-white p-10">Initializing Systems...</div>;

  const SLOTS = ["cnc_1", "printer_1", "lathe_1", "robot_1"];

  return (
    <div style={{ width: "100%", height: "100%", background: "#0f172a", fontFamily: "'Share Tech Mono',monospace", padding: 14 }}>
      {/* ... (Keep your Header and Emergency Logic) ... */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 10, flex: 1 }}>
        {SLOTS.map((key) => (
          <MachineCard key={key} machineKey={key} data={liveData.machines[key]} />
        ))}
      </div>
    </div>
  );
}