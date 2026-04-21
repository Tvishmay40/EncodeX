import React, { useState, useEffect, useCallback } from 'react';
import MachineGrid from './Machinegrid';
import ControlHub from './ControlHub';

export default function App() {
  const [telemetry, setTelemetry] = useState(null);
  const [aiLogs, setAiLogs] = useState([]);
  const [wsStatus, setWsStatus] = useState('Connecting...');
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // UPDATED: Ensure this matches your FastAPI deployment URL
    const ws = new WebSocket('wss://encodexbackend.onrender.com/ws');

    ws.onopen = () => setWsStatus('Connected');
    ws.onclose = () => setWsStatus('Disconnected');
    ws.onerror = () => setWsStatus('Error');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      /** * FIX 1: Routing Telemetry
       * Your backend broadcasts the state dictionary directly in simulation_loop.
       * We check if 'm_states' exists in the root of the message.
       */
      if (data.m_states) {
        setTelemetry(data);
      } 
      
      // Handle specific events sent by the backend logic
      if (data.event === 'agent_result') {
        setAiLogs(prev => [{
            action_taken: "AI Analysis Complete",
            reason: data.data.summary,
            severity: data.data.overallStatus
        }, ...prev].slice(0, 50));
      }
      
      if (data.event === 'approve_result') {
        setAiLogs(prev => [{
            action_taken: "Action Executed",
            reason: "Manual override approved by operator.",
            severity: "INFO"
        }, ...prev].slice(0, 50));
      }
    };

    setSocket(ws);
    return () => ws.close();
  }, []);

  const handleAction = useCallback((payload) => {
    /**
     * FIX 2: Communication Protocol
     * When MachineGrid calls onAction, it sends:
     * { event: "inject_failure", machine_id: "...", parameter: "...", target_value: ... }
     */
    if (socket && socket.readyState === WebSocket.OPEN) {
      // The backend 'app.py' looks for 'event' or 'action' == 'inject_failure'
      socket.send(JSON.stringify(payload));
    } else {
      // Fallback for UI feedback if backend is disconnected
      const fallbackLog = {
        machine_id: payload.machine_id || "SYSTEM",
        severity: "OFFLINE",
        action_taken: `Cached: ${payload.event}`,
        reason: "Waiting for WebSocket reconnection..."
      };
      setAiLogs(prev => [fallbackLog, ...prev].slice(0, 50));
    }
  }, [socket]);

  return (
    <div className="flex flex-col h-screen text-slate-100 overflow-hidden font-mono" style={{ background: "#050b14" }}>

      {/* Global Navigation / Status Bar */}
      <div className="h-10 border-b border-slate-800/80 flex items-center px-6 justify-between shrink-0" style={{ background: "#020617" }}>
        <div className="flex items-center gap-4">
          <span className="font-bold text-xs tracking-[0.2em] uppercase" style={{ color: "#00ffe5" }}>
            EncodeX // Central Command
          </span>
        </div>

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

      {/* Main Machine Grid */}
      <div className="flex-1 p-4 overflow-hidden relative">
        <MachineGrid
          telemetry={telemetry}
          onAction={handleAction}
        />
      </div>

      {/* Bottom Terminal & AI Logs */}
      <div className="shrink-0 w-full z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <ControlHub
          aiLogs={aiLogs}
          onAction={handleAction}
        />
      </div>

    </div>
  );
}