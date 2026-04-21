FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY Backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY Backend/app.py /app/app.py

EXPOSE 8080

CMD ["streamlit", "run", "/app/app.py", "--server.port=8080", "--server.address=0.0.0.0", "--server.headless=true"]
