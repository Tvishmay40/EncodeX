import React, { useState, useEffect, useRef } from 'react';

const ControlHub = ({ aiLogs = [], onAction }) => {
  const logEndRef = useRef(null);
  const [command, setCommand] = useState("");

  // Local state for the 4 machines' failure injection values
  const [machines, setMachines] = useState([
    { id: 'M-101', temp_c: 50, vibration: 10 },
    { id: 'M-102', temp_c: 50, vibration: 10 },
    { id: 'M-103', temp_c: 50, vibration: 10 },
    { id: 'M-104', temp_c: 50, vibration: 10 },
  ]);

  // Auto-scroll to the bottom whenever aiLogs updates
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiLogs]);

  const handleSlider = (id, param, val) => {
    setMachines(prev => 
      prev.map(m => m.id === id ? { ...m, [param]: Number(val) } : m)
    );
  };

  const handleTrigger = (id) => {
    const machine = machines.find(m => m.id === id);
    
    // Dispatch Temperature Spike
    onAction({
      event: "inject_failure",
      machine_id: id,
      parameter: "temp_c",
      target_value: machine.temp_c
    });

    // Dispatch Vibration Spike
    onAction({
      event: "inject_failure",
      machine_id: id,
      parameter: "vibration",
      target_value: machine.vibration
    });
  };

  const handleCommandSubmit = (e) => {
    e.preventDefault();
    if (!command.trim()) return;
    
    onAction({
      event: "manual_command",
      command: command.trim()
    });
    setCommand("");
  };

  return (
    <div className="flex flex-col h-full w-96 bg-[#0a0a0a] border-l border-gray-800 text-gray-300 font-mono text-sm selection:bg-cyan-900">
      
      {/* 1. AI Action Log */}
      <div className="flex-1 overflow-hidden flex flex-col border-b border-gray-800">
        <div className="p-3 bg-[#111] border-b border-gray-800 font-bold text-xs uppercase tracking-widest text-gray-500">
          SYSTEM_LOGS // AI_AGENT
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {aiLogs.length === 0 ? (
            <div className="text-gray-600 italic text-xs">Waiting for agent telemetry...</div>
          ) : (
            aiLogs.map((log, idx) => {
              const isHighSeverity = log.severity?.toLowerCase() === 'high';
              return (
                <div 
                  key={idx} 
                  className={p-2 rounded-sm border-l-2 ${isHighSeverity ? 'border-orange-500 bg-orange-500/10' : 'border-gray-600 bg-gray-900/50'}}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-cyan-500">[{log.machine_id}]</span>
                    <span className="text-[10px] uppercase text-gray-500">{log.severity}</span>
                  </div>
                  <div className={text-sm ${isHighSeverity ? 'text-orange-500 font-bold' : 'text-gray-300'}}>
                    &gt; {log.action_taken}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-start gap-1">
                    <span>Reason:</span>
                    <span>{log.reason}</span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* 2. Failure Injection Panel */}
      <div className="h-2/5 min-h-[300px] overflow-y-auto bg-[#0f0f0f] p-4 flex flex-col border-b border-gray-800">
        <div className="font-bold text-xs uppercase tracking-widest text-gray-500 mb-4">
          MANUAL_OVERRIDE // INJECT_FAILURE
        </div>
        <div className="space-y-6">
          {machines.map((machine) => (
            <div key={machine.id} className="bg-[#1a1a1a] p-3 rounded border border-gray-800">
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-cyan-600">{machine.id}</span>
                <button
                  onClick={() => handleTrigger(machine.id)}
                  className="bg-red-900/30 text-red-500 hover:bg-red-800/50 hover:text-red-300 transition-colors px-3 py-1 text-xs font-bold rounded border border-red-900/50 uppercase active:scale-95"
                >
                  Trigger
                </button>
              </div>
              
              <div className="space-y-3 text-xs">
                {/* Temperature Slider */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-gray-400">
                    <span>Temp (°C)</span>
                    <span className="text-orange-400">{machine.temp_c}°</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="500"
                    value={machine.temp_c}
                    onChange={(e) => handleSlider(machine.id, 'temp_c', e.target.value)}
                    className="w-full accent-orange-500"
                  />
                </div>

                {/* Vibration Slider */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-gray-400">
                    <span>Vibration (Hz)</span>
                    <span className="text-cyan-400">{machine.vibration}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={machine.vibration}
                    onChange={(e) => handleSlider(machine.id, 'vibration', e.target.value)}
                    className="w-full accent-cyan-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Terminal Emulator */}
      <div className="h-16 bg-black p-2 shrink-0">
        <form onSubmit={handleCommandSubmit} className="flex h-full items-center px-2 bg-[#111] border border-gray-800 rounded focus-within:border-cyan-800 transition-colors">
          <span className="text-green-500 mr-2 font-bold">root@hub:~#</span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Type manual command..."
            className="flex-1 bg-transparent border-none outline-none text-gray-300 placeholder-gray-700 text-xs w-full"
            autoComplete="off"
            spellCheck="false"
          />
        </form>
      </div>

    </div>
  );
};

export default ControlHub;