import json
import os
import random
import time

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import requests
import streamlit as st

st.set_page_config(page_title="AIRA OS - Industrial AI", layout="wide", page_icon="🏭")

MACHINES = [
    {
        "id": "CNC-01",
        "name": "CNC Mill #1",
        "type": "CNC",
        "zone": "A",
        "b_temp": 74,
        "b_vib": 3.4,
        "b_pres": 43,
        "b_rpm": 3200,
        "b_kw": 45,
        "b_co2": 12,
        "degrading": True,
        "x": 20,
        "y": 70,
    },
    {
        "id": "CNC-02",
        "name": "CNC Mill #2",
        "type": "CNC",
        "zone": "A",
        "b_temp": 67,
        "b_vib": 2.7,
        "b_pres": 40,
        "b_rpm": 3100,
        "b_kw": 42,
        "b_co2": 11,
        "degrading": False,
        "x": 20,
        "y": 30,
    },
    {
        "id": "ROB-A",
        "name": "Robot Arm A",
        "type": "Robot",
        "zone": "B",
        "b_temp": 54,
        "b_vib": 1.1,
        "b_pres": 27,
        "b_rpm": 900,
        "b_kw": 14,
        "b_co2": 3,
        "degrading": False,
        "x": 50,
        "y": 70,
    },
    {
        "id": "ROB-B",
        "name": "Robot Arm B",
        "type": "Robot",
        "zone": "B",
        "b_temp": 59,
        "b_vib": 4.2,
        "b_pres": 31,
        "b_rpm": 960,
        "b_kw": 18,
        "b_co2": 4,
        "degrading": True,
        "x": 50,
        "y": 30,
    },
    {
        "id": "CONV-1",
        "name": "Conveyor Belt",
        "type": "Conveyor",
        "zone": "C",
        "b_temp": 44,
        "b_vib": 0.9,
        "b_pres": 14,
        "b_rpm": 445,
        "b_kw": 35,
        "b_co2": 8,
        "degrading": False,
        "x": 80,
        "y": 50,
    },
    {
        "id": "HYDR-1",
        "name": "Hydraulic Press",
        "type": "Hydraulic",
        "zone": "D",
        "b_temp": 88,
        "b_vib": 5.8,
        "b_pres": 192,
        "b_rpm": 175,
        "b_kw": 75,
        "b_co2": 24,
        "degrading": True,
        "x": 80,
        "y": 15,
    },
]

THRESHOLDS = {
    "CNC": {"temp": (80, 92), "vib": (5, 7), "pres": (48, 56), "rpm": (2600, 3700)},
    "Robot": {"temp": (65, 78), "vib": (2.5, 4), "pres": (35, 45), "rpm": (700, 1200)},
    "Conveyor": {"temp": (55, 68), "vib": (1.5, 2.5), "pres": (18, 24), "rpm": (380, 560)},
    "Hydraulic": {"temp": (95, 110), "vib": (6, 9), "pres": (210, 240), "rpm": (130, 260)},
}

ROUTES = [
    {"id": "R-01", "from": "Warehouse A", "to": "Factory Floor", "distance": 2.3, "vehicles": 4, "base_eff": 91},
    {"id": "R-02", "from": "Port B", "to": "Warehouse A", "distance": 45, "vehicles": 2, "base_eff": 78},
    {"id": "R-03", "from": "Factory", "to": "Distribution C", "distance": 12, "vehicles": 6, "base_eff": 85},
]


def noise(base, spread):
    return base + (random.random() - 0.5) * spread


def score_metric(value, warn, critical):
    if value <= warn:
        return 100
    if value >= critical:
        return 0
    return max(0, int(100 - ((value - warn) / (critical - warn)) * 100))


def ensure_state():
    if "initialized" in st.session_state:
        return

    st.session_state.initialized = True
    st.session_state.tick = 0
    st.session_state.sim_running = False
    st.session_state.auto_execute = False
    st.session_state.refresh_seconds = 2.5
    st.session_state.machine_states = {}
    st.session_state.route_states = {}
    st.session_state.inventory = {
        "Bearing-702": 4,
        "HydraulicFluid-L": 12,
        "SensorMount": 0,
        "DriveBelt": 2,
    }
    st.session_state.maintenance_set = set()
    st.session_state.alerts = []
    st.session_state.execution_events = []
    st.session_state.tickets = []
    st.session_state.savings_usd = 0
    st.session_state.fleet_trend = []
    st.session_state.route_trend = []
    st.session_state.health_history = {machine["id"]: [] for machine in MACHINES}
    st.session_state.mas_result = None
    st.session_state.mas_logs = []


def machine_by_id(machine_id):
    return next((m for m in MACHINES if m["id"] == machine_id), None)


def simulate_tick():
    tick = st.session_state.tick
    new_states = {}

    for machine in MACHINES:
        machine_id = machine["id"]
        if machine_id in st.session_state.maintenance_set:
            state = {
                "temp": round(noise(machine["b_temp"] - 3, 0.5), 1),
                "vib": round(max(0.1, machine["b_vib"] * 0.3), 2),
                "pres": round(noise(machine["b_pres"], 1.0), 1),
                "rpm": 0,
                "kw": 0.6,
                "co2": 0.0,
                "health": 100,
                "status": "MAINTENANCE",
            }
        else:
            degradation = tick if machine["degrading"] else 0
            limits = THRESHOLDS[machine["type"]]

            temp = round(max(machine["b_temp"] - 5, machine["b_temp"] + 0.35 * degradation + noise(0, 2.5)), 1)
            vib = round(max(0.1, machine["b_vib"] + 0.14 * degradation + noise(0, 0.5)), 2)
            pres = round(noise(machine["b_pres"], 6 if machine["type"] == "Hydraulic" else 2), 1)
            rpm = round(noise(machine["b_rpm"], machine["b_rpm"] * 0.04), 0)
            kw = round(noise(machine["b_kw"] + degradation * 0.08, 1.7), 1)
            co2 = round(noise(machine["b_co2"] + degradation * 0.02, 0.6), 2)

            temp_score = score_metric(temp, limits["temp"][0], limits["temp"][1])
            vib_score = score_metric(vib, limits["vib"][0], limits["vib"][1])
            pres_score = score_metric(pres, limits["pres"][0], limits["pres"][1])
            rpm_score = score_metric(rpm, limits["rpm"][0], limits["rpm"][1])
            health = int(temp_score * 0.30 + vib_score * 0.35 + pres_score * 0.20 + rpm_score * 0.15)

            if health < 50:
                status = "CRITICAL"
            elif health < 75:
                status = "WARNING"
            else:
                status = "NORMAL"

            state = {
                "temp": temp,
                "vib": vib,
                "pres": pres,
                "rpm": rpm,
                "kw": kw,
                "co2": co2,
                "health": health,
                "status": status,
            }

        old_status = st.session_state.machine_states.get(machine_id, {}).get("status", "NORMAL")
        if state["status"] != "NORMAL" and state["status"] != old_status:
            st.session_state.alerts.insert(
                0,
                f"[{time.strftime('%H:%M:%S')}] {machine_id} changed to {state['status']} ({state['health']}% health)",
            )

        new_states[machine_id] = state
        st.session_state.health_history[machine_id].append({"tick": tick, "health": state["health"]})
        st.session_state.health_history[machine_id] = st.session_state.health_history[machine_id][-40:]

    route_states = {}
    for route in ROUTES:
        route_states[route["id"]] = {
            "efficiency": round(max(35, min(99, route["base_eff"] + noise(0, 8))), 1),
            "delay_min": round(max(0, noise(11, 16)), 1),
        }

    st.session_state.machine_states = new_states
    st.session_state.route_states = route_states

    values = list(new_states.values())
    avg_health = round(sum(v["health"] for v in values) / len(values), 2)
    avg_route_eff = round(sum(v["efficiency"] for v in route_states.values()) / len(route_states), 2)

    st.session_state.fleet_trend.append({"tick": tick, "avg_health": avg_health})
    st.session_state.fleet_trend = st.session_state.fleet_trend[-30:]

    st.session_state.route_trend.append({"tick": tick, "avg_efficiency": avg_route_eff})
    st.session_state.route_trend = st.session_state.route_trend[-30:]


def call_anthropic_or_fallback(prompt):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None, "No ANTHROPIC_API_KEY found. Used local MAS simulation."

    try:
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-3-5-sonnet-latest",
                "max_tokens": 700,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        text_blocks = payload.get("content", [])
        raw_text = "\n".join(block.get("text", "") for block in text_blocks if block.get("type") == "text")
        return raw_text.strip(), "Anthropic API response received."
    except Exception as exc:
        return None, f"Anthropic API call failed ({exc}). Used local MAS simulation."


def fallback_agent_plan(machine_id, low_part):
    actions = []
    if machine_id:
        actions.append(
            {
                "id": f"ACT-{int(time.time())}",
                "type": "MAINTENANCE",
                "target": machine_id,
                "title": "Autonomous Repair Protocol",
                "reason": "Thermal and vibration anomaly indicates spindle degradation.",
                "confidence": 0.92,
                "impact": "+15% OEE, avoids $24k downtime.",
                "log": [
                    "Diagnostic Agent: Confirmed spike in vibration harmonics and thermal drift.",
                    "Logistics Agent: Spare spindle and engineer are available in maintenance bay.",
                    "Orchestrator Agent: Confidence > 0.85. Recommend immediate intervention.",
                ],
            }
        )

    if low_part:
        actions.append(
            {
                "id": f"ACT-{int(time.time()) + 1}",
                "type": "ORDER_PARTS",
                "target": low_part,
                "title": "Expedite Replenishment",
                "reason": f"Stockout risk detected for {low_part}.",
                "confidence": 0.88,
                "impact": "Restores inventory buffer and route reliability.",
                "log": [
                    "Logistics Agent: WMS shows low inventory and demand growth on critical route.",
                    "Orchestrator Agent: Dispatching fast supplier route for replenishment.",
                ],
            }
        )

    status = "CRITICAL" if machine_id else "WARNING"
    summary = (
        f"Consensus completed. Diagnostics focused on {machine_id or 'fleet stability'}, "
        "and Logistics validated inventory and route constraints."
    )
    return {"status": status, "summary": summary, "actions": actions}


def run_multi_agent_analysis(user_prompt=""):
    machine_states = st.session_state.machine_states
    critical_ids = [mid for mid, state in machine_states.items() if state["status"] == "CRITICAL"]
    warning_ids = [mid for mid, state in machine_states.items() if state["status"] == "WARNING"]
    low_parts = [name for name, qty in st.session_state.inventory.items() if qty <= 2]

    target_machine = critical_ids[0] if critical_ids else (warning_ids[0] if warning_ids else None)
    low_part = low_parts[0] if low_parts else None

    llm_prompt = (
        "You are an industrial multi-agent orchestrator with three agents: Diagnostic, Logistics, Orchestrator.\n"
        "Given this state, propose a JSON object with fields: summary, status, actions[] where each action has "
        "id, type, target, title, reason, confidence, impact, log[].\n"
        f"Machine states: {json.dumps(machine_states)}\n"
        f"Inventory: {json.dumps(st.session_state.inventory)}\n"
        f"Route states: {json.dumps(st.session_state.route_states)}\n"
        f"User request: {user_prompt or 'Optimize OEE and avoid downtime'}\n"
        "Return valid JSON only."
    )

    llm_text, llm_status = call_anthropic_or_fallback(llm_prompt)
    if llm_text:
        try:
            parsed = json.loads(llm_text)
            plan = {
                "status": parsed.get("status", "WARNING"),
                "summary": parsed.get("summary", "Agent consensus completed."),
                "actions": parsed.get("actions", []),
            }
        except Exception:
            plan = fallback_agent_plan(target_machine, low_part)
            llm_status = "Anthropic output was not valid JSON. Used local MAS simulation."
    else:
        plan = fallback_agent_plan(target_machine, low_part)

    st.session_state.mas_result = plan
    st.session_state.mas_logs.append({
        "timestamp": time.strftime("%H:%M:%S"),
        "llm_status": llm_status,
        "summary": plan["summary"],
    })


def execute_action(action):
    action_id = action.get("id", f"ACT-{int(time.time())}")
    action_type = action.get("type")
    target = action.get("target")

    if action_type == "MAINTENANCE" and target:
        st.session_state.maintenance_set.add(target)
        st.session_state.savings_usd += 24000
        st.session_state.tickets.append(
            {
                "ticket": f"T-{int(time.time())}",
                "type": "MAINTENANCE",
                "target": target,
                "status": "OPEN",
                "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
        )

    if action_type == "ORDER_PARTS" and target:
        st.session_state.inventory[target] = st.session_state.inventory.get(target, 0) + 10
        st.session_state.tickets.append(
            {
                "ticket": f"T-{int(time.time())}",
                "type": "SUPPLY",
                "target": target,
                "status": "ORDERED",
                "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
        )

    st.session_state.execution_events.append(f"{action_id}: Executed {action.get('title', action_type)}")


ensure_state()
if st.session_state.tick == 0:
    simulate_tick()


with st.sidebar:
    st.header("Simulation Controls")
    tick_col, auto_col = st.columns(2)
    if tick_col.button("Tick Forward"):
        st.session_state.tick += 1
        simulate_tick()

    auto = auto_col.toggle("Auto Refresh", value=st.session_state.sim_running)
    if auto != st.session_state.sim_running:
        st.session_state.sim_running = auto
        st.rerun()

    st.session_state.refresh_seconds = st.slider(
        "Refresh (seconds)",
        min_value=1.0,
        max_value=6.0,
        value=float(st.session_state.refresh_seconds),
        step=0.5,
    )

    st.subheader("Agent Controls")
    st.session_state.auto_execute = st.toggle("Auto Execute High Confidence", value=st.session_state.auto_execute)
    prompt_text = st.text_area("MAS Prompt", value="Prioritize safety, uptime, and route efficiency.", height=90)

    if st.button("Run MAS Analysis", type="primary"):
        run_multi_agent_analysis(prompt_text)

    if st.button("Clear Activity"):
        st.session_state.alerts = []
        st.session_state.execution_events = []
        st.session_state.mas_logs = []
        st.rerun()

st.title("AIRA OS - Python Streamlit Edition")
st.caption("Industrial digital twin, live simulation, and multi-agent operations in a pure Python stack.")

all_states = list(st.session_state.machine_states.values())
critical_count = sum(1 for state in all_states if state["status"] == "CRITICAL")
warning_count = sum(1 for state in all_states if state["status"] == "WARNING")
maintenance_count = sum(1 for state in all_states if state["status"] == "MAINTENANCE")

avg_health = round(sum(state["health"] for state in all_states) / len(all_states), 2) if all_states else 100
total_kw = round(sum(state.get("kw", 0.0) for state in all_states), 2)
total_co2 = round(sum(state.get("co2", 0.0) for state in all_states), 2)
avg_route_eff = (
    round(sum(route["efficiency"] for route in st.session_state.route_states.values()) / len(st.session_state.route_states), 2)
    if st.session_state.route_states
    else 100
)

available_ratio = (len(MACHINES) - maintenance_count - critical_count) / len(MACHINES)
oee = int(max(0, available_ratio * (avg_health / 100.0) * (avg_route_eff / 100.0) * 100))

k1, k2, k3, k4 = st.columns(4)
k1.metric("OEE", f"{oee}%", f"{critical_count} critical")
k2.metric("Energy Draw", f"{total_kw} kW", f"CO2 {total_co2} kg/h", delta_color="inverse")
k3.metric("Logistics Efficiency", f"{avg_route_eff}%", f"{warning_count} warning machines")
k4.metric("Autonomy Savings", f"${st.session_state.savings_usd:,}", f"{len(st.session_state.execution_events)} events")

tab_overview, tab_twin, tab_logistics, tab_mas = st.tabs(
    ["Overview & KPIs", "Digital Twin", "Logistics & Tickets", "Multi-Agent System"]
)

with tab_overview:
    left_col, right_col = st.columns([2, 1])

    with left_col:
        st.subheader("Fleet Health Trend")
        fleet_df = pd.DataFrame(st.session_state.fleet_trend)
        if not fleet_df.empty:
            health_fig = px.area(
                fleet_df,
                x="tick",
                y="avg_health",
                title="Average Fleet Health",
                color_discrete_sequence=["#0ea5e9"],
            )
            health_fig.update_layout(height=300, margin=dict(l=10, r=10, t=40, b=10))
            st.plotly_chart(health_fig, use_container_width=True)

        st.subheader("Route Efficiency")
        route_df = pd.DataFrame(
            [
                {
                    "Route": route_id,
                    "Efficiency": values["efficiency"],
                    "Delay (min)": values["delay_min"],
                }
                for route_id, values in st.session_state.route_states.items()
            ]
        )
        route_fig = px.bar(route_df, x="Route", y="Efficiency", color="Delay (min)", title="Route Performance Snapshot")
        route_fig.update_layout(height=300, margin=dict(l=10, r=10, t=40, b=10))
        st.plotly_chart(route_fig, use_container_width=True)

    with right_col:
        st.subheader("Alerts")
        for alert in st.session_state.alerts[:7]:
            st.warning(alert)

        st.subheader("Execution Feed")
        for event in reversed(st.session_state.execution_events[-7:]):
            st.info(event)

with tab_twin:
    st.subheader("Factory Digital Twin")
    twin_points = []
    for machine in MACHINES:
        machine_id = machine["id"]
        state = st.session_state.machine_states[machine_id]
        twin_points.append(
            {
                "Machine": machine_id,
                "Name": machine["name"],
                "X": machine["x"],
                "Y": 100 - machine["y"],
                "Status": state["status"],
                "Health": state["health"],
                "kW": state["kw"],
                "Temp": state["temp"],
                "Vibration": state["vib"],
            }
        )
    twin_df = pd.DataFrame(twin_points)

    twin_fig = px.scatter(
        twin_df,
        x="X",
        y="Y",
        text="Machine",
        color="Status",
        size="Health",
        size_max=44,
        hover_data=["Name", "Health", "kW", "Temp", "Vibration"],
        color_discrete_map={
            "NORMAL": "#22c55e",
            "WARNING": "#f59e0b",
            "CRITICAL": "#ef4444",
            "MAINTENANCE": "#3b82f6",
        },
    )
    twin_fig.update_traces(textposition="top center")
    twin_fig.update_layout(
        height=560,
        margin=dict(l=0, r=0, t=20, b=0),
        xaxis=dict(range=[0, 100], showticklabels=False, title=""),
        yaxis=dict(range=[0, 100], showticklabels=False, title=""),
    )
    twin_fig.add_shape(type="rect", x0=45, y0=0, x1=55, y1=10, line=dict(color="#3b82f6", width=2))
    twin_fig.add_annotation(x=50, y=5, text="Maintenance Bay", showarrow=False, font=dict(color="#3b82f6"))
    st.plotly_chart(twin_fig, use_container_width=True)

    telemetry_df = pd.DataFrame(
        [
            {
                "Machine": machine["id"],
                "Zone": machine["zone"],
                "Status": st.session_state.machine_states[machine["id"]]["status"],
                "Health": st.session_state.machine_states[machine["id"]]["health"],
                "Temp": st.session_state.machine_states[machine["id"]]["temp"],
                "Vibration": st.session_state.machine_states[machine["id"]]["vib"],
                "Energy kW": st.session_state.machine_states[machine["id"]]["kw"],
                "CO2": st.session_state.machine_states[machine["id"]]["co2"],
            }
            for machine in MACHINES
        ]
    )
    st.dataframe(telemetry_df, use_container_width=True)

with tab_logistics:
    inv_col, route_col = st.columns(2)
    with inv_col:
        st.subheader("WMS Inventory")
        inv_df = pd.DataFrame(
            [
                {"Part": name, "Qty": qty, "Status": "CRITICAL" if qty <= 2 else "OK"}
                for name, qty in st.session_state.inventory.items()
            ]
        )
        st.dataframe(inv_df, use_container_width=True)

    with route_col:
        st.subheader("Supply Route Status")
        route_status_df = pd.DataFrame(
            [
                {
                    "Route": route["id"],
                    "From": route["from"],
                    "To": route["to"],
                    "Efficiency %": st.session_state.route_states[route["id"]]["efficiency"],
                    "Delay (min)": st.session_state.route_states[route["id"]]["delay_min"],
                }
                for route in ROUTES
            ]
        )
        st.dataframe(route_status_df, use_container_width=True)

    st.subheader("Ticketing")
    tickets_df = pd.DataFrame(st.session_state.tickets)
    if tickets_df.empty:
        st.info("No tickets yet. Run MAS analysis and approve an action to create tickets.")
    else:
        st.dataframe(tickets_df, use_container_width=True)

with tab_mas:
    st.subheader("Multi-Agent Negotiation")

    for log in st.session_state.mas_logs[-4:]:
        with st.chat_message("assistant"):
            st.write(f"{log['timestamp']} - {log['summary']}")
            st.caption(log["llm_status"])

    if st.session_state.mas_result:
        result = st.session_state.mas_result
        if result["status"] == "CRITICAL":
            st.error(result["summary"])
        else:
            st.warning(result["summary"])

        for action in result.get("actions", []):
            title = action.get("title", "Action")
            conf = float(action.get("confidence", 0)) * 100
            with st.expander(f"{title} ({conf:.1f}% confidence)", expanded=True):
                st.json(
                    {
                        "id": action.get("id"),
                        "type": action.get("type"),
                        "target": action.get("target"),
                        "reason": action.get("reason"),
                        "impact": action.get("impact"),
                    }
                )

                st.markdown("Agent Conversation")
                for line in action.get("log", []):
                    with st.chat_message("assistant"):
                        st.write(line)

                already_executed = any(
                    event.startswith(str(action.get("id", ""))) for event in st.session_state.execution_events
                )
                if already_executed:
                    st.success("Action already executed")
                elif st.button("Approve Execution", key=f"approve-{action.get('id', title)}"):
                    execute_action(action)
                    st.rerun()

        st.markdown("Final JSON Action Plan")
        st.code(json.dumps(result, indent=2), language="json")
    else:
        st.info("No MAS output yet. Use Run MAS Analysis in the sidebar.")


if st.session_state.auto_execute and st.session_state.mas_result:
    for action in st.session_state.mas_result.get("actions", []):
        if float(action.get("confidence", 0)) >= 0.90:
            is_executed = any(
                event.startswith(str(action.get("id", ""))) for event in st.session_state.execution_events
            )
            if not is_executed:
                execute_action(action)


if st.session_state.sim_running:
    time.sleep(st.session_state.refresh_seconds)
    st.session_state.tick += 1
    simulate_tick()
    if st.session_state.tick % 5 == 0:
        run_multi_agent_analysis("Background autonomous scan for safety and uptime.")
    st.rerun()
