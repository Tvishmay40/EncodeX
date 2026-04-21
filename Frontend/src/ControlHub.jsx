import React, { useState, useEffect, useRef } from 'react';

// Pre-configured shortcuts for the Judges to click
const QUICK_ACTIONS = [
  { label: "🚨 STOP CNC", action: { event: "emergency_stop", machine_id: "cnc_1" }, color: "bg-red-500/10 text-red-400 border-red-500/50 hover:bg-red-500/30" },
  { label: "⏸ PAUSE LATHE", action: { event: "pause", machine_id: "lathe_1" }, color: "bg-amber-500/10 text-amber-400 border-amber-500/50 hover:bg-amber-500/30" },
  { label: "🔍 DIAGNOSE PRINTER", action: { event: "manual_command", command: "DIAGNOSE printer_1" }, color: "bg-purple-500/10 text-purple-400 border-purple-500/50 hover:bg-purple-500/30" },
  { label: "⚡ RESET ROBOT", action: { event: "reset", machine_id: "robot_1" }, color: "bg-blue-500/10 text-blue-400 border-blue-500/50 hover:bg-blue-500/30" },
];

export default function ControlHub({ aiLogs = [], onAction }) {
  const logEndRef = useRef(null);
  const [command, setCommand] = useState("");
  const [localChat, setLocalChat] = useState([]);

  // Merge the external aiLogs with our local interactions to make a seamless chat history
  const combinedChat = [...aiLogs, ...localChat].sort((a, b) =>
    (a.timestamp || 0) - (b.timestamp || 0)
  );

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [combinedChat]);

  const handleCommandSubmit = (e) => {
    e.preventDefault();
    if (!command.trim()) return;

    // Add User Message to Chat visually
    setLocalChat(prev => [...prev, { role: "user", text: command.trim(), timestamp: Date.now() }]);

    // Fire Action
    onAction({ event: "manual_command", command: command.trim() });
    setCommand("");
  };

  const fireQuickAction = (actionObj, label) => {
    setLocalChat(prev => [...prev, { role: "user", text: `Executed Quick Action: ${label}`, timestamp: Date.now() }]);
    onAction(actionObj);
  };

  return (
    <div
      className="flex flex-col w-full h-[35vh] border-t shadow-[0_-10px_30px_rgba(0,0,0,0.5)] relative overflow-hidden"
      style={{ background: "#050b14", borderColor: "#1e293b", fontFamily: "'Share Tech Mono', 'Courier New', monospace" }}
    >
      {/* Top Banner */}
      <div className="px-6 py-2 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center">
        <span className="text-cyan-500 text-xs tracking-[0.2em] uppercase font-bold flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
          EncodeX Interactive Agent
        </span>
      </div>

      {/* 1. Chat History Window */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gradient-to-b from-transparent to-slate-900/30">
        {combinedChat.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center opacity-40">
            <span className="text-slate-400 text-xs tracking-[0.2em] uppercase">No recent communications. Agent standing by.</span>
          </div>
        ) : (
          combinedChat.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const isHigh = msg.severity?.toLowerCase() === 'high';

            return (
              <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-lg p-3 text-sm tracking-wide ${isUser
                      ? 'bg-cyan-900/40 border border-cyan-800/50 text-cyan-100'
                      : isHigh
                        ? 'bg-red-950/40 border border-red-900/50 text-red-200'
                        : 'bg-slate-800/50 border border-slate-700/50 text-slate-300'
                    }`}
                >
                  {!isUser && (
                    <div className={`text-[10px] uppercase font-bold mb-1 tracking-widest ${isHigh ? 'text-red-400' : 'text-slate-500'}`}>
                      {msg.machine_id ? `[SYSTEM: ${msg.machine_id}]` : '[AI AGENT]'}
                      {isHigh && ' // CRITICAL WARNING'}
                    </div>
                  )}

                  {/* Message Content */}
                  <div>
                    {isUser ? msg.text : (
                      <>
                        <span className={isHigh ? 'font-bold text-red-400 mr-2' : 'text-emerald-400 mr-2'}>&gt;</span>
                        {msg.action_taken}
                        {msg.reason && <div className="mt-1 text-[11px] text-slate-500 opacity-80 border-t border-slate-700/50 pt-1">Reason: {msg.reason}</div>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>

      {/* 2. Interactive Console Input Area */}
      <div className="shrink-0 bg-[#0a0f1c] border-t border-slate-800/80 p-4 pb-6">

        {/* Quick Action Shortcuts */}
        <div className="flex gap-3 mb-3 px-2 overflow-x-auto custom-scrollbar pb-1">
          {QUICK_ACTIONS.map((action, i) => (
            <button
              key={i}
              onClick={() => fireQuickAction(action.action, action.label)}
              className={`whitespace-nowrap px-3 py-1.5 rounded text-[10px] font-bold tracking-[0.1em] uppercase border transition-all active:scale-95 ${action.color}`}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Text Input Bar */}
        <form onSubmit={handleCommandSubmit} className="flex items-center gap-4 bg-[#050b14] border border-slate-700 p-2 rounded-lg focus-within:border-cyan-600 focus-within:shadow-[0_0_15px_rgba(8,145,178,0.2)] transition-all">
          <span className="pl-3 font-bold text-sm tracking-[0.1em]" style={{ color: "#00ffe5" }}>$&gt;</span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Type instructions, diagnose a machine, or ask for status..."
            className="flex-1 bg-transparent border-none outline-none text-slate-100 placeholder-slate-600 text-sm font-medium tracking-wide"
            autoComplete="off"
            spellCheck="false"
          />
          <button
            type="submit"
            disabled={!command.trim()}
            className="px-6 py-2 bg-cyan-600 text-black hover:bg-cyan-500 transition-colors rounded text-xs font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}