import streamlit as st
import time
import random
import json
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from typing import List, Optional

# --- GOOGLE GEN AI API ---
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

st.set_page_config(page_title="AIRA OS - Industrial AI", layout="wide", page_icon="🤖")

# ─── PYDANTIC SCHEMAS FOR GEMINI RESPONSES ───
class PrescriptiveRepair(BaseModel):
    rootCause: str = Field(description="The engineering root cause of the failure")
    partsNeeded: List[str] = Field(description="List of required parts from the WMS inventory")

class Action(BaseModel):
    id: str = Field(description="Unique ID for the action, like ACT-1")
    type: str = Field(description="One of: MAINTENANCE, ORDER_PARTS, ECO_MODE, SHUTDOWN")
    target: str = Field(description="The Machine ID or Inventory Part ID")
    title: str = Field(description="Short concise title of the action")
    reason: str = Field(description="Why this action is needed")
    confidence: float = Field(description="Confidence from 0.0 to 1.0. If >= 0.85, it is auto-eligible")
    impact: str = Field(description="What will happen after this is executed (e.g. saves $24k)")
    thoughtProcess: List[str] = Field(description="Logs from the multi-agent consensus. Start lines with 'Diagnostic Agent:', 'Logistics Agent:', or 'Orchestrator Agent:'")
    prescriptiveRepair: Optional[PrescriptiveRepair] = Field(None)

class MultiAgentOutput(BaseModel):
    summary: str = Field(description="Overall consensus summary")
    overallStatus: str = Field(description="One of: NORMAL, WARNING, CRITICAL")
    riskScore: int = Field(description="0 to 100")
    actions: List[Action]

# ─── CONFIGURATION & THRESHOLDS ───
MACHINES = [
    {"id": "CNC-01", "name": "CNC Mill #1", "type": "CNC", "zone": "A", "bTemp": 74, "bVib": 3.4, "bPres": 43, "bRPM": 3200, "bKW": 45, "bCO2": 12, "deg": True, "x": 20, "y": 70},
    {"id": "CNC-02", "name": "CNC Mill #2", "type": "CNC", "zone": "A", "bTemp": 67, "bVib": 2.7, "bPres": 40, "bRPM": 3100, "bKW": 42, "bCO2": 11, "deg": False, "x": 20, "y": 30},
    {"id": "ROB-A",  "name": "Robot Arm A", "type": "Robot", "zone": "B", "bTemp": 54, "bVib": 1.1, "bPres": 27, "bRPM": 900, "bKW": 14, "bCO2": 3, "deg": False, "x": 50, "y": 70},
    {"id": "ROB-B",  "name": "Robot Arm B", "type": "Robot", "zone": "B", "bTemp": 59, "bVib": 4.2, "bPres": 31, "bRPM": 960, "bKW": 18, "bCO2": 4, "deg": True, "x": 50, "y": 30},
    {"id": "CONV-1", "name": "Conveyor Belt", "type": "Conveyor", "zone": "C", "bTemp": 44, "bVib": 0.9, "bPres": 14, "bRPM": 445, "bKW": 35, "bCO2": 8, "deg": False, "x": 80, "y": 50},
    {"id": "HYDR-1", "name": "Hydraulic Press", "type": "Hydraulic", "zone": "D", "bTemp": 88, "bVib": 5.8, "bPres": 192, "bRPM": 175, "bKW": 75, "bCO2": 24, "deg": True, "x": 80, "y": 15},
]

THRESHOLDS = {
    "CNC": {"temp": [80,92], "vib": [5,7], "pres": [48,56], "rpm": [2600,3700]},
    "Robot": {"temp": [65,78], "vib": [2.5,4], "pres": [35,45], "rpm": [700,1200]},
    "Conveyor": {"temp": [55,68], "vib": [1.5,2.5], "pres": [18,24], "rpm": [380,560]},
    "Hydraulic": {"temp": [95,110], "vib": [6,9], "pres": [210,240], "rpm": [130,260]},
}

ROUTES = [
    {"id": "R-01", "from": "Warehouse A", "to": "Factory Floor", "dist": 2.3, "vehicles": 4, "bEff": 91},
    {"id": "R-02", "from": "Port B", "to": "Warehouse A", "dist": 45, "vehicles": 2, "bEff": 78},
    {"id": "R-03", "from": "Factory", "to": "Distribution C", "dist": 12, "vehicles": 6, "bEff": 85},
]

# ─── INIT SIMULATION STATE ───
if "tick" not in st.session_state:
    st.session_state.tick = 0
    st.session_state.sim_running = False
    st.session_state.auto_mode = False
    st.session_state.m_states = {}
    st.session_state.r_states = {}
    st.session_state.inventory = {"Bearing-702": 4, "HydraulicFluid-L": 12, "SensorMount": 0, "DriveBelt": 2}
    st.session_state.fleet_trend = [{"t": i, "Avg Health": 85.0 + (random.random() - 0.5)*10} for i in range(15)]
    st.session_state.history = {m["id"]: [] for m in MACHINES}
    st.session_state.maintenance = set()
    st.session_state.alerts = []
    st.session_state.events = []
    st.session_state.savings = 0
    st.session_state.agent_result = None

# ─── LOGIC FUNCTIONS ───
def noise(base, spread):
    return base + (random.random() - 0.5) * spread

def score_metric(val, warn, crit):
    if val <= warn: return 100
    if val >= crit: return 0
    return max(0, int(100 - ((val - warn) / (crit - warn)) * 100))

def simulate_machines():
    new_states = {}
    tick = st.session_state.tick
    
    for m in MACHINES:
        mid = m["id"]
        if mid in st.session_state.maintenance:
            new_states[mid] = {
                "temp": round(noise(m["bTemp"]-3, 0.5), 1),
                "vib": round(m["bVib"] * 0.3, 2),
                "pres": m["bPres"],
                "rpm": 0,
                "kw": 0.5,
                "co2": 0.0,
                "health": 100,
                "status": "MAINTENANCE"
            }
        else:
            deg = tick if m["deg"] else 0
            t = THRESHOLDS[m["type"]]
            temp = round(max(m["bTemp"] - 5, m["bTemp"] + 0.08 * deg * 0.04 * 100 + noise(0, 2.5)), 1)
            vib = round(max(0.1, m["bVib"] + 0.04 * deg * 0.04 * 100 + noise(0, 0.5)), 2)
            pres = round(noise(m["bPres"], 6 if m["type"]=="Hydraulic" else 2), 1)
            rpm = round(noise(m["bRPM"], m["bRPM"]*0.04), 0)
            kw = round(noise(m["bKW"] + (deg * 0.05), 1.5), 1)
            co2 = round(noise(m["bCO2"] + (deg * 0.01), 0.5), 2)
            
            ts = score_metric(temp, t["temp"][0], t["temp"][1])
            vs = score_metric(vib, t["vib"][0], t["vib"][1])
            ps = score_metric(pres, t["pres"][0], t["pres"][1])
            rs = score_metric(rpm, t["rpm"][0], t["rpm"][1])
            hlth = int(ts*0.3 + vs*0.35 + ps*0.2 + rs*0.15)
            
            st_val = "NORMAL"
            if hlth < 50: st_val = "CRITICAL"
            elif hlth < 75: st_val = "WARNING"
            
            new_states[mid] = {
                "temp": temp, "vib": vib, "pres": pres, "rpm": rpm, "kw": kw, "co2": co2, "health": hlth, "status": st_val
            }
            
            old_st = st.session_state.m_states.get(mid, {}).get("status", "NORMAL")
            if st_val != "NORMAL" and st_val != old_st and st_val != "MAINTENANCE":
                st.session_state.alerts.insert(0, f"[{time.strftime('%H:%M:%S')}] {mid} dropped to {st_val} ({hlth}% Health)")
    
    st.session_state.m_states = new_states
    
    for mid, state in new_states.items():
        st.session_state.history[mid].append({"t": tick, "health": state["health"]})
        if len(st.session_state.history[mid]) > 30:
            st.session_state.history[mid].pop(0)
            
    new_r = {}
    for r in ROUTES:
        new_r[r["id"]] = {
            "eff": max(30, min(99, r["bEff"] + noise(0, 8))),
            "delay": max(0, noise(12, 15))
        }
    st.session_state.r_states = new_r

def run_multi_agent(api_key):
    # Context Generation
    context = {
        "machines": st.session_state.m_states,
        "inventory": st.session_state.inventory,
        "routes": st.session_state.r_states
    }
    
    system_prompt = """You are the Orchestrator Agent of an Industrial AI System.
You oversee two sub-agents: Diagnostic Agent (analyzes sensor telemetry and power) and Logistics Agent (analyzes inventory and route delays).
Given the following real-time JSON context of the factory, generate a multi-agent prescriptive response. Include energy efficiency recommendations.
You MUST output strictly in the requested JSON schema."""

    user_prompt = f"Real-time Factory Context:\n{json.dumps(context)}"

    if not api_key:
        print("Using simulated fallback...")
        _run_simulated_agent()
        return

    try:
        # GOOGLE GEMINI INTEGRATION
        client = genai.Client(api_key=api_key)
        
        with st.spinner("🧠 Diagnostic & Logistics Agents forming consensus via Gemini 2.5..."):
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[system_prompt, user_prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=MultiAgentOutput,
                    temperature=0.2,
                ),
            )
            
        st.session_state.agent_result = json.loads(response.text)

    except Exception as e:
        print(f"Gemini API Error: {e}")
        st.error(f"Google Gemini Error: {e}")
        _run_simulated_agent()


def _run_simulated_agent():
    # Simulated Fallback Response
    critical_machine = None
    for mid, s in st.session_state.m_states.items():
        if s["status"] == "CRITICAL" or MACHINES[[m["id"] for m in MACHINES].index(mid)]["deg"]:
            critical_machine = mid; break
            
    low_part = None
    for k,v in st.session_state.inventory.items():
        if v <= 2: low_part = k; break
            
    st.session_state.agent_result = {
        "summary": f"MOCKED FALLBACK: Diagnostic confirmed anomalies on {critical_machine or 'fleet'}. Logistics analyzed WMS inventory.",
        "overallStatus": "CRITICAL" if critical_machine else "WARNING",
        "riskScore": 88 if critical_machine else 45,
        "actions": []
    }
    if critical_machine:
        st.session_state.agent_result["actions"].append({
            "id": f"ACT-{int(time.time())}",
            "type": "MAINTENANCE", "target": critical_machine, "title": "Autonomous Repair Protocol",
            "reason": "Vibration harmonics threshold exceeded.", "confidence": 0.92,
            "impact": "+15% OEE, saves $24k downtime.",
            "thoughtProcess": [
                "Diagnostic Agent: Thermal & Vibration anomalies localized to spindle.",
                "Orchestrator Agent: Confidence exceeds 0.85 Auto-Execute threshold. Initiating."
            ]
        })

# Initialize first tick
if st.session_state.tick == 0:
    simulate_machines()

# ─── SIDEBAR SIMULATION CONTROLS ───
with st.sidebar:
    st.header("🔑 API Configurations")
    api_key = st.text_input("Google AI Studio (Gemini) API Key", type="password", value="AIzaSyA9NXoxmUlb_9dGuB813ktxlZKqdtS9z1Y", placeholder="AIzaSy...")
    st.markdown("[Get API Key free](https://aistudio.google.com/app/apikey)")
    st.divider()

    st.header("⚙️ Simulation Controls")
    col1, col2 = st.columns(2)
    if col1.button("Tick 1 Step ⏩"):
        st.session_state.tick += 1
        simulate_machines()
    
    auto = col2.toggle("Auto-Simulate", value=st.session_state.sim_running)
    if auto != st.session_state.sim_running:
        st.session_state.sim_running = auto
        st.rerun()

    st.subheader("🤖 Agent Controls")
    st.session_state.auto_mode = st.toggle("MAS Auto-Execute Mode", value=st.session_state.auto_mode)
    
    if st.button("Trigger Google Gemini MAS"):
        run_multi_agent(api_key)
        
    if st.button("Clear History"):
        st.session_state.alerts = []
        st.session_state.events = []
        st.rerun()

# ─── TOP HEADER ───
st.title("AIRA OS [Google Gemini Edition]")
st.markdown("### Python Streamlit Digital Twin, Powered by `gemini-2.5-flash`")

# Calculated Metrics
all_states = list(st.session_state.m_states.values())
crit = sum(1 for s in all_states if s["status"] == "CRITICAL")
warn = sum(1 for s in all_states if s["status"] == "WARNING")
maint = sum(1 for s in all_states if s["status"] == "MAINTENANCE")

valid = [s["health"] for s in all_states if s["health"] >= 0]
avg_h = sum(valid)/len(valid) if valid else 100
tot_kw = sum(s.get("kw", 0) for s in all_states)
tot_co2 = sum(s.get("co2", 0) for s in all_states)

avg_rt = sum(r["eff"] for r in st.session_state.r_states.values()) / len(ROUTES) if ROUTES else 100
oee = int( ((len(MACHINES)-maint-crit)/len(MACHINES)) * (avg_h/100) * (avg_rt/100) * 100 )

if st.session_state.tick > 0:
    st.session_state.fleet_trend.append({"t": st.session_state.tick, "Avg Health": avg_h})
    if len(st.session_state.fleet_trend) > 20: st.session_state.fleet_trend.pop(0)

mc1, mc2, mc3, mc4 = st.columns(4)
mc1.metric("OEE Score", f"{oee}%", f"{crit} Critical Constraints", delta_color="inverse")
mc2.metric("Total Energy Draw", f"{round(tot_kw,1)} kW", f"{round(tot_co2,1)} kg/h CO2", delta_color="inverse")
mc3.metric("Logistics Sync", f"{round(avg_rt, 1)}%", "WMS Efficiency")
mc4.metric("Autonomy Savings", f"${st.session_state.savings}", f"{len(st.session_state.events)} events executed")

st.divider()

# ─── TABS ───
tab1, tab2, tab3, tab4 = st.tabs(["📊 Overview", "🏭 Digital Twin", "🚚 Logistics & WMS", "🧠 Multi-Agent System (Gemini)"])

with tab1:
    c1, c2 = st.columns([2, 1])
    with c1:
        st.subheader("Fleet Health Trend")
        df_trend = pd.DataFrame(st.session_state.fleet_trend)
        fig = px.area(df_trend, x="t", y="Avg Health", template="plotly_dark", color_discrete_sequence=["#3B82F6"])
        fig.update_layout(height=250, margin=dict(l=0, r=0, t=0, b=0))
        st.plotly_chart(fig, width="stretch")
        
    with c2:
        st.subheader("Activity Feed")
        for ev in reversed(st.session_state.events[-5:]):
            st.info(ev)
        for al in st.session_state.alerts[:5]:
            st.warning(al)

with tab2:
    st.subheader("Live Spatial Tracking")
    points, colors, texts = [], [], []
    for m in MACHINES:
        mid = m["id"]
        state = st.session_state.m_states.get(mid, {})
        st_val = state.get("status", "NORMAL")
        points.append({"x": m["x"], "y": 100 - m["y"]})
        
        if st_val == "CRITICAL": c = "red"
        elif st_val == "WARNING": c = "orange"
        elif st_val == "MAINTENANCE": c = "blue"
        else: c = "green"
        colors.append(c)
        
        txt = f"<b>{mid}</b><br>{state.get('health',100)}% Health<br>{state.get('kw',0)} kW"
        if st_val == "MAINTENANCE": txt += "<br>REPAIRING 👷‍♂️"
        texts.append(txt)

    df_map = pd.DataFrame(points)
    fig_map = go.Figure()
    fig_map.add_trace(go.Scatter(
        x=df_map["x"], y=df_map["y"], mode="markers+text",
        marker=dict(size=40, color=colors, line=dict(width=2, color="white")),
        text=[m["id"] for m in MACHINES], textposition="top center",
        hovertext=texts, hoverinfo="text"
    ))
    
    fig_map.update_layout(
        template="plotly_dark", height=500,
        xaxis=dict(range=[0, 100], showgrid=False, zeroline=False, showticklabels=False),
        yaxis=dict(range=[0, 100], showgrid=False, zeroline=False, showticklabels=False),
        margin=dict(l=0,r=0,t=0,b=0), plot_bgcolor="rgba(15, 23, 42, 0.5)"
    )
    
    fig_map.add_shape(type="rect", x0=45, y0=0, x1=55, y1=10, line=dict(color="blue", width=2), fillcolor="rgba(0,0,255,0.1)")
    fig_map.add_annotation(x=50, y=5, text="Maint. Bay", showarrow=False, font=dict(color="blue"))
    
    st.plotly_chart(fig_map, width="stretch")
    
    st.subheader("Telemetry Data")
    df_tel = []
    for m in MACHINES:
        s = st.session_state.m_states[m["id"]]
        df_tel.append({
            "Machine ID": m["id"], "Zone": m["zone"], "Status": s["status"], 
            "Health (%)": s["health"], "Temp (°C)": s["temp"], "Vibrations": s["vib"],
            "Energy (kW)": s["kw"], "Emissions (CO2)": s["co2"]
        })
    st.dataframe(pd.DataFrame(df_tel), width="stretch")

with tab3:
    col_wms, col_log = st.columns(2)
    with col_wms:
        st.subheader("WMS Inventory")
        inv_df = [{"Part": k, "Qty": v, "Status": "CRITICAL" if v<=2 else "OK"} for k,v in st.session_state.inventory.items()]
        st.dataframe(pd.DataFrame(inv_df), width="stretch")
        
    with col_log:
        st.subheader("Active Supply Routes")
        rout_df = [{"Route": r["id"], "Efficiency %": int(st.session_state.r_states[r["id"]]["eff"]), "Delay (min)": int(st.session_state.r_states[r["id"]]["delay"])} for r in ROUTES]
        st.dataframe(pd.DataFrame(rout_df), width="stretch")

with tab4:
    col_title, col_logo = st.columns([4,1])
    col_title.subheader("Swarm Intelligence (Powered by Gemini)")
    
    if st.session_state.agent_result:
        ares = st.session_state.agent_result
        overall = ares.get('overallStatus', 'WARNING')
        
        if overall == "CRITICAL":
            st.error(ares.get('summary', ''))
        else:
            st.warning(ares.get('summary', ''))
            
        for act in ares.get("actions", []):
            with st.expander(f"✨ {act.get('type', 'ACTION')}: {act.get('title', '')} (Confidence: {float(act.get('confidence',0))*100}%)", expanded=True):
                st.markdown(f"**Target:** {act.get('target', '')}  |  **Impact:** {act.get('impact', '')}")
                
                st.markdown("##### Agentic Negotiation Log")
                for th in act.get("thoughtProcess", []):
                    color = "blue" if "Diagnostic" in th else "green" if "Logistics" in th else "orange"
                    st.markdown(f"<span style='color:{color}; font-family: monospace;'>{th}</span>", unsafe_allow_html=True)
                    
                if act.get("prescriptiveRepair"):
                    st.info(f"**Root Cause Analysis:** {act['prescriptiveRepair'].get('rootCause', '')}\n\n**Parts Needed:** {', '.join(act['prescriptiveRepair'].get('partsNeeded', []))}")
                    
                st.divider()
                
                executed = act.get("id", "") in [e.split(":")[0] for e in st.session_state.events]
                if executed:
                    st.success("Action Executed Successfully")
                else:
                    if st.button("Approve Execution", key=act.get("id", str(random.random()))):
                        st.session_state.events.append(f"{act.get('id', '')}: MAS dispatched {act.get('title', '')}")
                        if act.get("type") in ["MAINTENANCE", "ECO_MODE"]:
                            st.session_state.maintenance.add(act.get("target"))
                            st.session_state.savings += 24000
                        elif act.get("type") == "ORDER_PARTS":
                            targ = act.get("target")
                            if targ in st.session_state.inventory:
                                st.session_state.inventory[targ] += 10
                            
                        st.rerun()
    else:
        st.info("System is monitoring. Enter your Gemini API Key in the sidebar and trigger an Analysis.")

# Auto-Loop 
if st.session_state.sim_running:
    time.sleep(2.5)
    st.session_state.tick += 1
    simulate_machines()
    
    if st.session_state.auto_mode and st.session_state.tick % 5 == 0:
        run_multi_agent(api_key)
        if st.session_state.agent_result:
            for act in st.session_state.agent_result.get("actions", []):
                if act.get("confidence", 0) >= 0.85:
                    if act.get("type") in ["MAINTENANCE", "ECO_MODE"]:
                        st.session_state.maintenance.add(act.get("target"))
                        st.session_state.savings += 24000
                    elif act.get("type") == "ORDER_PARTS":
                        targ = act.get("target")
                        if targ in st.session_state.inventory:
                            st.session_state.inventory[targ] += 10
                    st.session_state.events.append(f"🤖 AUTO-EXECUTED: {act.get('title')}")
    
    st.rerun()
