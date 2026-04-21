import React, { useState, useEffect } from 'react';
import Machinegrid from './Machinegrid';
import ControlHub from './ControlHub';

export default function App() {
  const [telemetry, setTelemetry] = useState(null);
  const [aiLogs, setAiLogs] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const ws = new WebSocket('wss://your-backend-url.render.com/ws');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === 'telemetry_update') setTelemetry(data);
      if (data.event === 'ai_intervention') setAiLogs(prev => [data, ...prev].slice(0, 50));
    };
    setSocket(ws);
    return () => ws.close();
  }, []);

  const handleAction = (payload) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <div className="flex-1 p-6 border-r border-slate-800">
        <Machinegrid telemetry={telemetry} />
      </div>
      <div className="w-96 p-6">
        <ControlHub aiLogs={aiLogs} onAction={handleAction} />
      </div>
    </div>
  );
}