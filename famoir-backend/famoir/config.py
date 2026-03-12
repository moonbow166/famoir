import os
from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")
PORT = int(os.getenv("PORT", "8000"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Auth: set DEV_MODE=true to skip Firebase token verification (local testing)
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"

# Text model for agents (narrator, etc.)
MODEL_NAME = "gemini-2.5-flash"

# Live/Audio model for voice conversation (must support bidiGenerateContent)
LIVE_MODEL_NAME = "gemini-2.5-flash-native-audio-latest"

# Voice configuration
VOICE_NAME = "Kore"  # Warm, friendly voice
