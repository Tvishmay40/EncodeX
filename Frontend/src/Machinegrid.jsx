import React, { useEffect, useRef } from "react";

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  active:    { label: "ACTIVE",     dot: "bg-emerald-400", text: "text-emerald-400", glow: "shadow-[0_0_8px_#34d399]" },
  paused:    { label: "PAUSED",     dot: "bg-amber-400",   text: "text-amber-400",   glow: "shadow-[0_0_8px_#fbbf24]" },
  emergency: { label: "EMERGENCY",  dot: "bg-red-400",     text: "text-red-400",     glow: "shadow-[0_0_8px_#f87171]" },
};

const MACHINE_ICONS = {
  CNC:         "⚙",
  "3D Printer": "◈",
  Lathe:       "◎",
  "Robotic Arm": "⟁",
};

const NEON_ACCENTS = {
  cnc_1:     { border: "#00ffe5", label: "#00ffe5", shadow: "0 0 12px #00ffe580" },
  printer_1: { border: "#bf5fff", label: "#bf5fff", shadow: "0 0 12px #bf5fff80" },
  lathe_1:   { border: "#ffb800", label: "#ffb800", shadow: "0 0 12px #ffb80080" },
  robot_1:   { border: "#00aaff", label: "#00aaff", shadow: "0 0 12px #00aaff80" },
};

// ─── 2D Movement Visualizer ─────────────────────────────────────────────────

function PositionViz({ position, color, status }) {
  const { x = 0, y = 0 } = position || {};
  // Clamp 0-100 → fit within 6–94 px of a 100-unit viewBox
  const cx = 6 + (Math.min(100, Math.max(0, x)) / 100) * 88;
  const cy = 6 + (Math.min(100, Math.max(0, y)) / 100) * 88;
  const isEmergency = status === "emergency";

  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      style={{ background: "rgba(0,0,0,0.35)", borderRadius: "6px" }}
    >
      {/* Grid lines */}
      {[25, 50, 75].map((v) => (
        <React.Fragment key={v}>
          <line x1={v} y1={0} x2={v} y2={100} stroke="#ffffff0d" strokeWidth="0.5" />
          <line x1={0} y1={v} x2={100} y2={v} stroke="#ffffff0d" strokeWidth="0.5" />
        </React.Fragment>
      ))}
      {/* Crosshair at origin */}
      <line x1="50" y1="0" x2="50" y2="100" stroke="#ffffff14" strokeWidth="0.8" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="#ffffff14" strokeWidth="0.8" />

      {/* Trail ring */}
      <circle cx={cx} cy={cy} r="10" fill="none" stroke={color} strokeWidth="0.5" opacity="0.3" />

      {/* Glow halo */}
      <circle cx={cx} cy={cy} r="6" fill={color} opacity="0.15" />

      {/* Main position dot */}
      <circle
        cx={cx}
        cy={cy}
        r="4"
        fill={isEmergency ? "#f87171" : color}
        style={{ filter: `drop-shadow(0 0 4px ${isEmergency ? "#f87171" : color})` }}
      />

      {/* Coord labels */}
      <text x="3" y="97" fontSize="7" fill="#ffffff30" fontFamily="monospace">
        {`X:${Math.round(x)} Y:${Math.round(y)}`}
      </text>
    </svg>
  );
}

// ─── Stat Pill ───────────────────────────────────────────────────────────────

function StatPill({ icon, value, unit, color }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${color}40`,
        color: color,
      }}
    >
      <span className="opacity-60">{icon}</span>
      <span className="font-bold">{value}</span>
      <span className="opacity-50 text-[10px]">{unit}</span>
    </div>
  );
}

// ─── Machine Card ────────────────────────────────────────────────────────────

function MachineCard({ machineKey, data }) {
  const accent = NEON_ACCENTS[machineKey] || { border: "#00ffe5", label: "#00ffe5", shadow: "none" };
  const statusCfg = STATUS_CONFIG[data.status] || STATUS_CONFIG.paused;
  const isEmergency = data.status === "emergency";
  const icon = MACHINE_ICONS[data.type] || "◉";

  return (
    <div
      className={`relative flex flex-col gap-2 p-3 rounded-lg overflow-hidden transition-all duration-300 ${
        isEmergency ? "animate-pulse bg-red-900/40" : ""
      }`}
      style={{
        background: isEmergency
          ? undefined
          : "linear-gradient(145deg, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.7) 100%)",
        border: `1px solid ${isEmergency ? "#ef4444" : accent.border}`,
        boxShadow: isEmergency ? "0 0 20px #ef444480" : accent.shadow,
        minHeight: "0",
      }}
    >
      {/* Scanline overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 3px)",
          backgroundSize: "100% 3px",
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <span
            className="text-xl leading-none"
            style={{ color: accent.label, filter: `drop-shadow(0 0 4px ${accent.border})` }}
          >
            {icon}
          </span>
          <div>
            <div
              className="text-xs font-bold tracking-[0.2em] uppercase font-mono"
              style={{ color: accent.label }}
            >
              {data.type}
            </div>
            <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
              {machineKey}
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest font-mono ${statusCfg.text}`}
          style={{ background: "rgba(0,0,0,0.4)", border: `1px solid currentColor` }}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${
              isEmergency ? "animate-ping" : "animate-pulse"
            }`}
          />
          {statusCfg.label}
        </div>
      </div>

      {/* Position visualizer */}
      <div className="z-10 flex-1" style={{ minHeight: "80px", maxHeight: "120px" }}>
        <PositionViz position={data.position} color={accent.border} status={data.status} />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-1.5 z-10">
        <StatPill icon="🌡" value={data.temp_c ?? "—"} unit="°C" color="#ff6b6b" />
        <StatPill icon="⚡" value={data.power_w ?? "—"} unit="W" color="#ffd93d" />
        <StatPill icon="〜" value={data.vibration_hz ?? "—"} unit="Hz" color="#6bcb77" />
      </div>
    </div>
  );
}

// ─── MachineGrid (main export) ───────────────────────────────────────────────

export default function MachineGrid({ telemetry }) {
  // Fallback demo data so the component is never blank during dev
  const data = telemetry || {
    global_emergency: false,
    machines: {
      cnc_1:     { type: "CNC",         status: "active",    temp_c: 45,  power_w: 1200, vibration_hz: 12, position: { x: 10, y: 25 } },
      printer_1: { type: "3D Printer",  status: "paused",    temp_c: 210, power_w: 340,  vibration_hz: 4,  position: { x: 60, y: 70 } },
      lathe_1:   { type: "Lathe",       status: "active",    temp_c: 78,  power_w: 860,  vibration_hz: 30, position: { x: 85, y: 15 } },
      robot_1:   { type: "Robotic Arm", status: "emergency", temp_c: 99,  power_w: 2400, vibration_hz: 55, position: { x: 45, y: 90 } },
    },
  };

  const machines = data.machines || {};
  const globalEmergency = data.global_emergency;

  // Enforce a stable 4-slot order; fill missing slots with null
  const SLOTS = ["cnc_1", "printer_1", "lathe_1", "robot_1"];
  const entries = SLOTS.map((key) => [key, machines[key] || null]);

  return (
    <div
      className="relative w-full h-full p-4"
      style={{ background: "#0f172a", fontFamily: "'Share Tech Mono', 'Courier New', monospace" }}
    >
      {/* Google Font (Share Tech Mono) injected once */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');`}</style>

      {/* Global emergency border */}
      {globalEmergency && (
        <div className="pointer-events-none absolute inset-0 z-20 animate-pulse rounded-lg"
          style={{ border: "3px solid #ef4444", boxShadow: "0 0 30px #ef444460, inset 0 0 30px #ef444420" }}
        />
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs tracking-[0.4em] uppercase text-slate-500 font-mono">
            Industrial Control System
          </div>
          <div
            className="text-lg font-bold tracking-[0.15em] uppercase"
            style={{ color: "#00ffe5", textShadow: "0 0 10px #00ffe580" }}
          >
            Machine Grid — Floor A
          </div>
        </div>
        <div className="flex items-center gap-2">
          {globalEmergency ? (
            <span className="flex items-center gap-1.5 text-red-400 text-xs font-mono animate-pulse">
              <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-ping" />
              GLOBAL EMERGENCY
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              ALL SYSTEMS NOMINAL
            </span>
          )}
        </div>
      </div>

      {/* 2×2 Grid */}
      <div className="grid grid-cols-2 grid-rows-2 gap-3 h-[calc(100%-56px)]">
        {entries.map(([key, machine]) =>
          machine ? (
            <MachineCard key={key} machineKey={key} data={machine} />
          ) : (
            <div
              key={key}
              className="flex items-center justify-center rounded-lg text-slate-700 text-xs font-mono tracking-widest"
              style={{ border: "1px dashed #1e293b", background: "rgba(15,23,42,0.5)" }}
            >
              NO SIGNAL — {key.toUpperCase()}
            </div>
          )
        )}
      </div>
    </div>
  );
}