FROM python:3.12-slim

WORKDIR /app

# Install Python deps first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source + frontend static (copied by build-and-deploy.sh)
COPY . .

EXPOSE 8000

# Cloud Run injects PORT env var; shell form so $PORT is expanded at runtime
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}
