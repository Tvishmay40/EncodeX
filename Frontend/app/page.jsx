"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Factory, ShieldAlert, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

function apiUrl(path) {
  if (API_BASE) {
    return `${API_BASE}${path}`;
  }
  return path;
}

function severityClass(status) {
  if (status === "CRITICAL") return "text-accent-red";
  if (status === "WARNING") return "text-accent-amber";
  if (status === "MAINTENANCE") return "text-cyan-300";
  return "text-accent-lime";
}

async function postJSON(path, body = {}) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

export default function Page() {
  const [snapshot, setSnapshot] = useState({ machines: {}, inventory: {}, events: [], tick: 0 });
  const [decision, setDecision] = useState(null);

  const machineList = useMemo(() => Object.entries(snapshot.machines), [snapshot]);

  const kpis = useMemo(() => {
    const values = Object.values(snapshot.machines);
    if (!values.length) return { critical: 0, warning: 0, avgHealth: 100 };
    const critical = values.filter((m) => m.status === "CRITICAL").length;
    const warning = values.filter((m) => m.status === "WARNING").length;
    const avgHealth = Math.round(values.reduce((acc, m) => acc + (m.health || 0), 0) / values.length);
    return { critical, warning, avgHealth };
  }, [snapshot]);

  useEffect(() => {
    let live = true;

    async function fetchSnapshot() {
      try {
        const res = await fetch(apiUrl("/api/machines"));
        const data = await res.json();
        if (live) setSnapshot(data);
      } catch {
        // Ignore transient connection issues during local startup
      }
    }

    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 2200);

    const wsBase = API_BASE
      ? API_BASE.replace("http", "ws")
      : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
    const ws = new WebSocket(`${wsBase}/ws/telemetry`);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.event === "agent_decision") {
        setDecision(msg.payload);
      }
      fetchSnapshot();
    };

    return () => {
      live = false;
      clearInterval(interval);
      ws.close();
    };
  }, []);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-cyan-100">Industrial Agentic Command Center</h1>
          <p className="mt-1 text-sm text-slate-300">FastAPI + Next.js + Tailwind + Motion</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => postJSON("/api/agent/evaluate").then(setDecision)}>
            Trigger Agent Evaluation
          </Button>
        </div>
      </motion.header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="kpi">
          <p className="text-xs uppercase tracking-wide text-slate-400">Average Health</p>
          <p className="mt-2 text-2xl font-bold text-cyan-200">{kpis.avgHealth}%</p>
        </div>
        <div className="kpi">
          <p className="text-xs uppercase tracking-wide text-slate-400">Critical Machines</p>
          <p className="mt-2 text-2xl font-bold text-accent-red">{kpis.critical}</p>
        </div>
        <div className="kpi">
          <p className="text-xs uppercase tracking-wide text-slate-400">Warnings</p>
          <p className="mt-2 text-2xl font-bold text-accent-amber">{kpis.warning}</p>
        </div>
        <div className="kpi">
          <p className="text-xs uppercase tracking-wide text-slate-400">Tick</p>
          <p className="mt-2 text-2xl font-bold text-accent-lime">{snapshot.tick}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card title="Machine Fleet" subtitle="Predictive maintenance telemetry" className="lg:col-span-2">
          <div className="space-y-3">
            {machineList.map(([id, machine]) => (
              <div key={id} className="grid gap-2 rounded-xl border border-slate-700/80 bg-steel-800/60 p-3 md:grid-cols-6">
                <div className="col-span-2">
                  <p className="font-semibold text-cyan-100">{id}</p>
                  <p className="text-xs text-slate-400">{machine.name}</p>
                </div>
                <p className="text-sm">Temp: {machine.temp}</p>
                <p className="text-sm">Vib: {machine.vib}</p>
                <p className="text-sm">Health: {machine.health}</p>
                <p className={`text-sm font-semibold ${severityClass(machine.status)}`}>{machine.status}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Human-in-the-Loop" subtitle="Operator safety controls">
          <div className="space-y-3">
            <Button
              className="w-full border-red-300/60 bg-red-600/30 text-red-100 hover:bg-red-600/45"
              onClick={() => postJSON("/api/actions/halt_assembly_line", { machine_id: "CNC-01", reason: "Manual abort by operator" })}
            >
              <ShieldAlert className="mr-2 inline h-4 w-4" />
              Manual Abort CNC-01
            </Button>
            <Button
              className="w-full border-amber-300/60 bg-amber-600/30 text-amber-100 hover:bg-amber-600/45"
              onClick={() => postJSON("/api/actions/eco_mode", { machine_id: "CNC-01", duration_ticks: 5 })}
            >
              <Wrench className="mr-2 inline h-4 w-4" />
              Force ECO Mode
            </Button>
            <div className="rounded-xl border border-slate-700 bg-black/20 p-3 font-mono text-xs text-green-300">
              {snapshot.events.slice(-5).map((e, idx) => (
                <p key={idx}>{`> ${e.type} ${e.machine_id || ""} ${e.status || e.action || ""}`}</p>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card title="Agent Trace Engine" subtitle="Explainability timeline" className="lg:col-span-2">
          {decision?.trace?.length ? (
            <div className="space-y-3">
              {decision.trace.map((step, index) => (
                <div className="trace-line" key={`${step.stage}-${index}`}>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{step.stage}</p>
                  <p className="text-cyan-100">{step.agent}</p>
                  <p className="text-sm text-slate-200">{step.decision}</p>
                  <p className="text-xs text-slate-400">{step.evidence}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Run agent evaluation to generate explainability trace.</p>
          )}
        </Card>

        <Card title="Autonomous Actions" subtitle="Agentic output">
          {decision?.actions?.length ? (
            <div className="space-y-3">
              {decision.actions.map((a, idx) => (
                <div key={`${a.action}-${idx}`} className="rounded-xl border border-slate-700/80 bg-steel-800/60 p-3">
                  <p className="text-sm font-semibold text-cyan-100">{a.action}</p>
                  <p className="text-xs text-slate-300">{a.machine_id}</p>
                  <p className="mt-2 text-xs text-slate-300">{a.reason}</p>
                  <p className="mt-1 text-xs text-lime-300">Savings ${a.estimated_savings_usd}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No actions yet.</p>
          )}
        </Card>
      </section>

      <section className="panel grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-700/70 bg-steel-800/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Track Signal</p>
          <p className="mt-2 text-sm text-slate-200"><Factory className="mr-2 inline h-4 w-4" />Real-time manufacturing telemetry</p>
        </div>
        <div className="rounded-xl border border-slate-700/70 bg-steel-800/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Innovation Signal</p>
          <p className="mt-2 text-sm text-slate-200"><AlertTriangle className="mr-2 inline h-4 w-4" />Agent executes interventions autonomously</p>
        </div>
        <div className="rounded-xl border border-slate-700/70 bg-steel-800/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Explainability Signal</p>
          <p className="mt-2 text-sm text-slate-200"><ShieldAlert className="mr-2 inline h-4 w-4" />Trace maps anomaly to decision chain</p>
        </div>
      </section>
    </main>
  );
}
