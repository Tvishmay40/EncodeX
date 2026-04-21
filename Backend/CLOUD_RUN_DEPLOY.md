# Industrial AI Platform Deployment

## 1) Environment Variables

Set these before running locally or in Cloud Run:

- GOOGLE_API_KEY: Gemini API key
- FIREBASE_TELEMETRY_URL: Realtime DB read endpoint (example: https://<project>.firebaseio.com/telemetry.json)

## 2) Local Run

From repository root:

1. pip install -r Backend/requirements.txt
2. set GOOGLE_API_KEY=<your_key>
3. set FIREBASE_TELEMETRY_URL=<firebase_read_endpoint>
4. streamlit run Backend/app.py

## 3) Build Container

From repository root:

1. docker build -f Backend/Dockerfile -t industrial-ai-platform:latest .
2. docker run -p 8080:8080 -e GOOGLE_API_KEY=<your_key> -e FIREBASE_TELEMETRY_URL=<firebase_read_endpoint> industrial-ai-platform:latest

## 4) Deploy to Google Cloud Run

1. gcloud auth login
2. gcloud config set project <your-project-id>
3. gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
4. gcloud artifacts repositories create industrial-ai --repository-format=docker --location=us-central1
5. gcloud builds submit --tag us-central1-docker.pkg.dev/<your-project-id>/industrial-ai/platform:latest .
6. gcloud run deploy industrial-ai-platform --image us-central1-docker.pkg.dev/<your-project-id>/industrial-ai/platform:latest --region us-central1 --allow-unauthenticated --set-env-vars GOOGLE_API_KEY=<your_key>,FIREBASE_TELEMETRY_URL=<firebase_read_endpoint>

After deploy, Cloud Run returns a public HTTPS URL for demo.
