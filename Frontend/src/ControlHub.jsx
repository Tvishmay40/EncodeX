import React, { useState, useEffect, useRef } from 'react';

const ControlHub = ({ aiLogs = [], onAction }) => {
  const logEndRef = useRef(null);
  const [command, setCommand] = useState("");

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiLogs]);

  const handleCommandSubmit = (e) => {
    e.preventDefault();
    if (!command.trim()) return;
    onAction({ event: "manual_command", command: command.trim() });
    setCommand("");
  };

  return (
    <div
      className="flex flex-col w-full h-64 border-t shadow-2xl relative overflow-hidden"
      style={{
        background: "#050b14",
        borderColor: "#1e293b",
        fontFamily: "'Share Tech Mono', 'Courier New', monospace"
      }}
    >
      {/* 1. Terminal Logs Window */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-gradient-to-b from-transparent to-slate-900/50">
        {aiLogs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center opacity-40">
            <svg className="w-8 h-8 text-cyan-500 mb-2 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 9l3 3-3 3m5 0h3M4 15V9a2 2 0 012-2h12a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2z"></path></svg>
            <span className="text-cyan-500 text-xs tracking-[0.3em] uppercase">LLM Agent Idle // Awaiting Inputs</span>
          </div>
        ) : (
          aiLogs.map((log, idx) => {
            const isHigh = log.severity?.toLowerCase() === 'high';
            return (
              <div key={idx} className="flex gap-3 text-xs tracking-wide items-start">
                <span className="text-slate-500 mt-0.5">[{new Date().toLocaleTimeString()}]</span>
                <span className={`font-bold ${isHigh ? 'text-red-500' : 'text-cyan-400'}`}>
                  {log.machine_id ? `<${log.machine_id}>` : '<SYSTEM>'}
                </span>
                <span className={isHigh ? 'text-red-300' : 'text-slate-300'}>
                  {log.action_taken} {log.reason && <span className="text-slate-500 opacity-80">// {log.reason}</span>}
                </span>
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>

      {/* 2. The LLM Input Console */}
      <div className="h-14 shrink-0 relative z-10 border-t border-slate-800/80 bg-[#0a0f1c]">
        <form onSubmit={handleCommandSubmit} className="flex h-full items-center px-4 transition-all">
          <div className="flex items-center gap-2 mr-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="font-bold text-xs tracking-[0.2em]" style={{ color: "#00ffe5", textShadow: "0 0 8px rgba(0,255,229,0.5)" }}>
              root@agent:~#
            </span>
          </div>

          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="TYPE INSTRUCTION FOR AI AGENT..."
            className="flex-1 bg-transparent border-none outline-none text-cyan-100 placeholder-slate-700 text-sm w-full font-bold tracking-widest uppercase"
            autoComplete="off"
            spellCheck="false"
          />

          <button
            type="submit"
            disabled={!command.trim()}
            className="ml-4 px-4 py-1.5 bg-cyan-900/30 text-cyan-400 border border-cyan-800/50 hover:bg-cyan-800/50 hover:text-cyan-200 transition-colors rounded text-xs font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Transmit
          </button>
        </form>
      </div>
    </div>
  );
};

export default ControlHub;