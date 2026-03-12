#!/bin/bash
# Famoir - Full Build & Deploy Script
# Builds frontend, copies to backend, deploys single container to Cloud Run
#
# Prerequisites:
#   1. gcloud CLI installed: https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login
#   3. gcloud config set project YOUR_PROJECT_ID
#   4. Node.js + npm installed
#   5. Enable APIs: gcloud services enable run.googleapis.com cloudbuild.googleapis.com
#
# Secrets (set these in your .env file):
#   GOOGLE_API_KEY - Gemini API key

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")/famoir-memory-keeper"
BACKEND_DIR="$SCRIPT_DIR"

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION="us-central1"
SERVICE_NAME="famoir"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "📦 Famoir Full Build & Deploy"
echo "   Project:  ${PROJECT_ID}"
echo "   Region:   ${REGION}"
echo "   Frontend: $FRONTEND_DIR"
echo "   Backend:  $BACKEND_DIR"
echo ""

# ─── Step 1: Build frontend ───────────────────────────────
echo "🔨 Building frontend..."
cd "$FRONTEND_DIR"

# Production env — same-origin + Firebase client config
# Firebase client keys are loaded from .env.production in the frontend directory.
# If .env.production doesn't exist, create it from .env.example and fill in values.
if [ ! -f .env.production ]; then
  echo "❌ Missing .env.production in frontend directory."
  echo "   Copy .env.example → .env.production and fill in Firebase values."
  exit 1
fi

npm ci --prefer-offline
npm run build

# ─── Step 2: Copy frontend dist to backend/static ─────────
echo "📋 Copying frontend build to backend/static..."
rm -rf "$BACKEND_DIR/static"
cp -r "$FRONTEND_DIR/dist" "$BACKEND_DIR/static"

# ─── Step 3: Build & push Docker image ────────────────────
echo "🐳 Building Docker image via Cloud Build..."
cd "$BACKEND_DIR"

gcloud builds submit --tag ${IMAGE_NAME} .

# ─── Step 4: Deploy to Cloud Run ──────────────────────────
echo "🚀 Deploying to Cloud Run..."

# Read API key from .env
GOOGLE_API_KEY=$(grep GOOGLE_API_KEY .env | cut -d= -f2)

gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --timeout 3600 \
  --concurrency 80 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars "GOOGLE_API_KEY=${GOOGLE_API_KEY}" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
  --set-env-vars "FRONTEND_URL=*" \
  --set-env-vars "DEV_MODE=false" \
  --port 8000

# ─── Step 5: Verify ──────────────────────────────────────
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')

echo ""
echo "✅ Famoir deployed successfully!"
echo "   URL:    ${SERVICE_URL}"
echo "   Health: ${SERVICE_URL}/health"
echo ""
echo "📝 Post-deploy checklist:"
echo "   1. Open ${SERVICE_URL} — landing page should load"
echo "   2. curl ${SERVICE_URL}/health — should return {\"status\":\"ok\"}"
echo "   3. Test login flow (magic link → dashboard)"
echo "   4. Test voice interview (WebSocket at wss://...)"
echo ""
echo "🔒 Firebase Auth note:"
echo "   Add ${SERVICE_URL} to Firebase Console → Authentication → Settings → Authorized domains"
