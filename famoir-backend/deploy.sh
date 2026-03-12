#!/bin/bash
# Famoir Backend-Only Deploy (without frontend)
# Use build-and-deploy.sh for full-stack deploy
#
# Prerequisites:
#   gcloud CLI installed and authenticated
#   gcloud config set project YOUR_PROJECT_ID

set -e

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION="us-central1"
SERVICE_NAME="famoir"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

GOOGLE_API_KEY=$(grep GOOGLE_API_KEY .env | cut -d= -f2)

echo "🚀 Deploying Famoir Backend to Cloud Run..."
echo "   Project: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo ""

gcloud builds submit --tag ${IMAGE_NAME} .

gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars "GOOGLE_API_KEY=${GOOGLE_API_KEY}" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
  --set-env-vars "FRONTEND_URL=*" \
  --set-env-vars "DEV_MODE=false" \
  --port 8000

SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')

echo ""
echo "✅ Deployed: ${SERVICE_URL}"
echo "   Health:  ${SERVICE_URL}/health"
