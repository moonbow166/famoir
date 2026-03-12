# Famoir - AI-Powered Digital Legacy Platform

> Google AI Agent Hackathon (Gemini Live Agent Challenge) | Deadline: March 16, 2026
> Live: https://famoir-ykfhl6546a-uc.a.run.app

Famoir transforms personal memories into literary-quality memoir chapters through AI-powered voice interviews. Users share photos and stories via real-time voice conversation, and the system automatically generates polished memoir chapters — preserving family legacies one story at a time.

## Architecture (5 Agents + 2 Workflow Agents)

```
server.py (orchestrator)
  │
  ├─ PreSessionPipeline (SequentialAgent)
  │    ├── PhotoAnalyst (LlmAgent, gemini-2.5-flash Vision)
  │    │     output_schema: PhotoAnalysis
  │    └── ContextBuilder (BaseAgent, pure Python)
  │
  ├─ Interviewer (LlmAgent, gemini-2.5-flash-native-audio-latest)
  │    ├── Gemini Live API — real-time bidirectional voice streaming
  │    ├── reads: session.state["photo_context"]
  │    └── mid-session: new photo → background PhotoAnalyst → inject
  │
  └─ PostSessionPipeline (SequentialAgent)
       └── memoir_quality_loop (LoopAgent, max_iterations=2)
             ├── Narrator (LlmAgent, output_schema: MemoirChapter)
             ├── QualityChecker (LlmAgent, output_schema: QualityFeedback)
             └── EscalationChecker (BaseAgent → pass/fail escalation)
```

### ADK Patterns Used
SequentialAgent · LoopAgent · LlmAgent · BaseAgent · output_schema (Pydantic) · session.state · run_live()

### Multimodal
Vision (photo analysis) · Audio (real-time voice) · Text (memoir generation)

### Tech Stack
- **Frontend:** React + TypeScript + Vite + shadcn/ui + Tailwind
- **Backend:** FastAPI + WebSocket + Gemini Live API + Google ADK
- **Database:** Cloud Firestore (users → books → sessions → chapters)
- **Auth:** Firebase Auth (Phone SMS OTP)
- **Deploy:** Cloud Run (single container: backend + static frontend)
- **AI Models:** gemini-2.5-flash (Vision + Text), gemini-2.5-flash-native-audio-latest (Voice)

---

## Folder Structure

```
Famoir/
├── README.md                            ← You are here
├── architecture-diagram.md              ← Mermaid architecture diagram
│
├── famoir-backend/                      ← Backend (FastAPI + Google ADK)
│   ├── server.py                        ← FastAPI + WebSocket + pipeline orchestration
│   ├── Dockerfile                       ← Cloud Run container
│   ├── build-and-deploy.sh              ← One-click deploy script
│   └── famoir/
│       ├── agent.py                     ← Agent definitions (5 agents + 2 workflows)
│       ├── prompts.py                   ← System prompts for all agents
│       ├── models.py                    ← Pydantic schemas
│       ├── config.py                    ← Model names, voice config
│       ├── firebase_config.py           ← Firebase Admin SDK init
│       ├── firestore_service.py         ← Firestore CRUD operations
│       ├── api_routes.py                ← REST API endpoints
│       ├── auth_middleware.py           ← Firebase ID token verification
│       ├── pdf_export.py                ← Branded PDF export
│       └── tools.py                     ← Agent tools
│
└── famoir-memory-keeper/                ← Frontend (React + TypeScript)
    ├── src/pages/                       ← Login, Setup, Session, Generating, Memoir, Dashboard, BookPreview
    ├── src/contexts/AuthContext.tsx      ← Auth state provider
    ├── src/components/                  ← Navbar, Footer, ProtectedRoute, UI components
    └── public/                          ← Static assets, AudioWorklet processors
```

## Current Status

| Phase | Status |
|-------|--------|
| **Phase 1: ADK Pipeline** | ✅ Done |
| **Phase 2: Firestore Persistence** | ✅ Done |
| **Phase 3: Multi-chapter Memoir** | ✅ Done |
| **Phase 4a: Firebase Auth (Phone OTP)** | ✅ Done |
| **Phase 4b: UI Polish + Mobile** | ✅ Done |
| **Phase 5: Cloud Run Deployment** | ✅ Live |
| **Phase 6: Demo + Submission** | ✅ Done |

### Key Features
- Real-time voice interviews powered by Gemini Live API
- Photo analysis with Gemini Vision for contextual storytelling
- AI narrator generates literary-quality memoir chapters
- Quality control loop ensures narrative excellence
- Book preview with table of contents and PDF export
- Ring buffer AudioWorklet for low-latency audio playback
- Mobile-optimized voice-first interview experience

## Local Development

```bash
# Terminal 1: Backend
cd famoir-backend && python3 server.py

# Terminal 2: Frontend
cd famoir-memory-keeper && npm run dev

# Open http://localhost:5173 (DEV_MODE=true, no auth required)
```

## Deployment

```bash
# Deploy to Cloud Run
cd famoir-backend && bash build-and-deploy.sh

# Check logs
gcloud run services logs read famoir --region us-central1 --limit 20
```
