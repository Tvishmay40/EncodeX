# FastAPI + Next.js Execution Guide

## 1) Backend

From repository root:

1. c:/INDUSTRIAI/.venv/Scripts/python.exe -m pip install -r Backend/requirements-fastapi.txt
2. set GOOGLE_API_KEY=<your_google_key>
3. c:/INDUSTRIAI/.venv/Scripts/python.exe -m uvicorn Backend.main:app --host 0.0.0.0 --port 8000 --reload

Backend APIs:
- GET /api/health
- GET /api/machines
- POST /api/telemetry
- POST /api/agent/evaluate
- POST /api/actions/halt_assembly_line
- POST /api/actions/eco_mode
- WS /ws/telemetry

## 2) Frontend

From Frontend folder:

1. npm install
2. set NEXT_PUBLIC_API_BASE=http://localhost:8000
3. npm run dev

Open http://localhost:3000

## 3) Docker Compose

1. set GOOGLE_API_KEY=<your_google_key>
2. docker compose up --build

This starts backend on 8000 and frontend on 3000.
