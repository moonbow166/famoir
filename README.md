# Famoir - AI-Powered Digital Legacy Platform

> Last updated: 2026-02-26 | Maintainer: Moonbow166
> Google AI Agent Hackathon (Gemini Live Agent Challenge) | Deadline: March 16, 2026
> Live: https://famoir-ykfhl6546a-uc.a.run.app

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
  │    ├── Gemini Live API — real-time bidi voice streaming
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
- **Auth:** Firebase Auth (Email Magic Link / passwordless)
- **Deploy:** Cloud Run (single container: backend + static frontend)

---

## Folder Structure

```
Famoir/
│
├── README.md                                ← You are here
├── Famoir_Task_List.md                      ← Current sprint tasks (v7)
├── Famoir_Implementation_Plan.md            ← Execution roadmap (v4)
├── DEPLOY_GUIDE.md                          ← Cloud Run 部署指南 (从零开始)
├── Reference_Google_ADK_Codelab.md          ← ADK patterns reference
│
├── 📄 DOCUMENTS (design & planning)
│   ├── Famoir_Project_Plan.docx             ← Vision, market, competitive landscape
│   ├── Famoir_Roadmap.docx                  ← Sprint plan & priorities
│   ├── Famoir_UX_Design_Brief.docx          ← Screen flows, visual system
│   ├── Famoir_Mobile_Interview_Spec.docx    ← Mobile interaction design
│   ├── Famoir_Brand_Visual_Asset_Brief.docx ← Brand colors, fonts, logo
│   └── Famoir_MultiAgent_Architecture.docx  ← Agent design & evolution roadmap
│
├── 🐍 famoir-backend/                       ← BACKEND CODE
│   ├── server.py                            ← FastAPI + WebSocket + Gemini Live API
│   ├── Dockerfile                           ← Cloud Run container
│   ├── build-and-deploy.sh                  ← 一键部署脚本
│   ├── deploy.sh                            ← Backend-only 快速部署
│   └── famoir/
│       ├── agent.py                         ← Agent definitions (all 5 + 2 workflows)
│       ├── prompts.py                       ← System prompts
│       ├── models.py                        ← Pydantic schemas
│       ├── config.py                        ← Model names, voice config
│       ├── firebase_config.py               ← Firebase Admin SDK init
│       ├── firestore_service.py             ← Firestore CRUD
│       ├── api_routes.py                    ← REST API + auth middleware
│       ├── auth_middleware.py               ← Firebase ID token verification
│       └── tools.py                         ← Placeholder
│
├── ⚛️ famoir-memory-keeper/                  ← FRONTEND CODE (React + TypeScript)
│   ├── src/pages/                           ← Index, Login, Setup, Session, Generating, Memoir, Dashboard
│   ├── src/contexts/AuthContext.tsx          ← Auth state provider + DEV_MODE
│   ├── src/components/ProtectedRoute.tsx    ← Route guard
│   ├── src/lib/firebase.ts                  ← Firebase client SDK + Magic Link
│   └── ...
│
└── 🗂️ archive/                              ← Old document versions
```

## For AI Assistants

When starting work on this project, read files in this order:
1. **This README** — architecture overview
2. **`Famoir_Task_List.md`** — what's done, what to work on, known issues
3. **`Famoir_Implementation_Plan.md`** — how to build it
4. **`Reference_Google_ADK_Codelab.md`** — ADK patterns reference
5. **Code** — `famoir-backend/` and `famoir-memory-keeper/src/`

For deeper context:
- **Frontend work** → `UX_Design_Brief` + `Mobile_Interview_Spec`
- **Agent design** → `MultiAgent_Architecture.docx` Section 8
- **Brand/Design** → `Brand_Visual_Asset_Brief`
- **Deployment** → `DEPLOY_GUIDE.md`

## Current Status (2026-03-01)

| Phase | Status | Key Files Changed |
|-------|--------|-------------------|
| **Phase 1: ADK Pipeline** | ✅ Done | agent.py, models.py, prompts.py, server.py, Setup.tsx, Session.tsx |
| **Phase 2: Firestore** | ✅ Done | firebase_config.py, firestore_service.py, api_routes.py, Dashboard.tsx |
| **Phase 3: Multi-chapter** | ✅ Done | Memoir.tsx, Generating.tsx |
| **Phase 4a: Auth** | ✅ Done | firebase.ts, AuthContext.tsx, Login.tsx, ProtectedRoute.tsx, auth_middleware.py |
| **Phase 4b: UI Polish** | ✅ Done | index.css, Navbar.tsx, Footer.tsx, Index.tsx, favicon.svg |
| **Phase 5: Deploy** | ✅ Live | Dockerfile, build-and-deploy.sh, DEPLOY_GUIDE.md |
| **Phase 6: Demo** | 🔨 In Progress | pdf_export.py, Memoir.tsx, Dashboard.tsx, Session.tsx, Setup.tsx |

### Phase 6 Progress (3/1)
- ✅ **PDF Export** — reportlab-based branded PDF (cover → chapters → colophon), download from Memoir + Dashboard
- ✅ **Issue #3 Fix** — Photo analysis → Interviewer connection (prompt rewrite + hint injection)
- ✅ **Issue #2 Fix** — Client-side image compression (1600px max) + Session photo grid layout
- ✅ **Issue #1** — Camera viewfinder in Session (getUserMedia + custom shutter, mid-session photo)
- ⬜ Demo video (4 min), DevPost submission, GitHub cleanup, mobile testing

All Python files pass syntax check. All TypeScript compiles with zero errors.
