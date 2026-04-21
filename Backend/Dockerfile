FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend files (app.py, etc.)
COPY . .

# FastAPI typically runs on 8080 or 10000 on Render
EXPOSE 8080

# 'app:app' refers to filename (app.py) : FastAPI instance name (app = FastAPI())
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]