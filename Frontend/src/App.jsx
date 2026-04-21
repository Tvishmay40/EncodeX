import React, { useState, useEffect, useCallback } from 'react';
import MachineGrid from './Machinegrid';
import ControlHub from './ControlHub';

export default function App() {
  const [telemetry, setTelemetry] = useState(null);
  const [aiLogs, setAiLogs] = useState([]);
  const [wsStatus, setWsStatus] = useState('Connecting...');
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Replace with your actual Render or local FastAPI URL
    const ws = new WebSocket('wss://encodexbackend.onrender.com/ws');

    ws.onopen = () => setWsStatus('Connected');
    ws.onclose = () => setWsStatus('Disconnected');
    ws.onerror = () => setWsStatus('Error');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === 'telemetry_update') setTelemetry(data);
      if (data.event === 'ai_intervention') {
        setAiLogs(prev => [data, ...prev].slice(0, 50));
      }
    };

    setSocket(ws);
    return () => ws.close();
  }, []);

  const handleAction = useCallback((payload) => {
    // 1. Send to Backend if connected
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    } else {
      // 2. Hackathon Fallback: If backend is offline, simulate a log so the UI doesn't look broken
      const fallbackLog = {
        machine_id: payload.machine_id || "SYSTEM",
        severity: "HIGH",
        action_taken: `Intercepted: ${payload.event} for ${payload.parameter || 'system'}`,
        reason: "OFFLINE_MODE_ACTIVE"
      };
      setAiLogs(prev => [fallbackLog, ...prev].slice(0, 50));
    }
  }, [socket]);

  return (
    <div className="flex flex-col h-screen text-slate-100 overflow-hidden font-mono" style={{ background: "#050b14" }}>

      {/* 1. Global Navigation / Status Bar */}
      <div className="h-10 border-b border-slate-800/80 flex items-center px-6 justify-between shrink-0" style={{ background: "#020617" }}>
        <div className="flex items-center gap-4">
          <span className="font-bold text-xs tracking-[0.2em] uppercase" style={{ color: "#00ffe5" }}>
            EncodeX // Central Command
          </span>
        </div>

        {/* Connection Status Indicator */}
        <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase font-bold">
          <span className="text-slate-500">Uplink:</span>
          {wsStatus === 'Connected' ? (
            <span className="text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> ONLINE
            </span>
          ) : (
            <span className="text-red-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500"></span> {wsStatus}
            </span>
          )}
        </div>
      </div>

      {/* 2. Main Machine Grid (Takes up available top space) */}
      <div className="flex-1 p-4 overflow-hidden relative">
        <MachineGrid
          telemetry={telemetry}
          onAction={handleAction}
        />
      </div>

      {/* 3. Bottom Terminal & AI Logs (Docks to the bottom) */}
      <div className="shrink-0 w-full z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <ControlHub
          aiLogs={aiLogs}
          onAction={handleAction}
        />
      </div>

    </div>
  );
}