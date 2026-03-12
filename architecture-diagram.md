# Famoir — System Architecture

## Agent Architecture (for DevPost submission)

```mermaid
graph TB
    subgraph Frontend["Frontend (React + TypeScript + Vite)"]
        direction LR
        Login["Login<br/><i>Phone OTP</i>"]
        Setup["Setup<br/><i>Name + Photos + Mic</i>"]
        Session["Session<br/><i>Voice Interview UI</i>"]
        Generating["Generating<br/><i>Processing Status</i>"]
        Memoir["Memoir / BookPreview<br/><i>Chapter Viewer + PDF</i>"]
        Login --> Setup --> Session --> Generating --> Memoir
    end

    subgraph Orchestrator["FastAPI + WebSocket (server.py)"]
        REST["/api/* REST Endpoints"]
        WS["/chat WebSocket<br/><i>Bidirectional Audio Stream</i>"]
    end

    subgraph ADK["Google ADK — Multi-Agent Architecture"]
        direction TB

        subgraph Phase1["Phase 1: Pre-Session Pipeline"]
            direction LR
            PA["PhotoAnalyst<br/><i>LlmAgent (Vision)</i><br/>gemini-2.5-flash"]
            CB["ContextBuilder<br/><i>BaseAgent (Python)</i><br/>No LLM call"]
            PA -->|"PhotoAnalysis<br/>schema"| CB
        end

        subgraph Phase2["Phase 2: Live Interview"]
            INT["Interviewer<br/><i>LlmAgent (Audio)</i><br/>gemini-2.5-flash-native-audio-latest"]
        end

        subgraph Phase3["Phase 3: Post-Session Pipeline"]
            subgraph Loop["LoopAgent (max 2 iterations)"]
                direction LR
                NAR["Narrator<br/><i>LlmAgent</i><br/>gemini-2.5-flash"]
                QC["QualityChecker<br/><i>LlmAgent</i><br/>gemini-2.5-flash"]
                EC["EscalationChecker<br/><i>BaseAgent (Python)</i><br/>No LLM call"]
                NAR -->|"MemoirChapter<br/>schema"| QC
                QC -->|"QualityFeedback<br/>pass/fail"| EC
                EC -.->|"fail → revise"| NAR
            end
        end

        Phase1 -->|"photo_context"| Phase2
        Phase2 -->|"interview_transcript"| Phase3
    end

    subgraph Services["Google Cloud Services"]
        direction LR
        Gemini["Gemini APIs<br/><i>Vision + Text + Live Audio</i>"]
        Firestore["Cloud Firestore<br/><i>users → books →<br/>sessions → chapters</i>"]
        Auth["Firebase Auth<br/><i>Phone SMS OTP</i>"]
        Run["Cloud Run<br/><i>Single Container</i>"]
    end

    %% Connections
    Session -->|"Photos (base64)<br/>+ Audio PCM 16kHz"| WS
    WS --> ADK
    Memoir -->|"fetch chapters"| REST

    PA --> Gemini
    INT --> Gemini
    NAR --> Gemini
    QC --> Gemini

    Orchestrator --> Firestore
    Orchestrator --> Auth
    Run -->|"hosts"| Orchestrator

    ADK -->|"chapter JSON"| Orchestrator

    %% Styles
    classDef phase1 fill:#E8F5E9,stroke:#4CAF50,color:#1B5E20
    classDef phase2 fill:#E3F2FD,stroke:#2196F3,color:#0D47A1
    classDef phase3 fill:#FFF3E0,stroke:#FF9800,color:#E65100
    classDef google fill:#F3E5F5,stroke:#9C27B0,color:#4A148C
    classDef frontend fill:#FBF7F4,stroke:#C47D5A,color:#3D2C2E

    class PA,CB phase1
    class INT phase2
    class NAR,QC,EC phase3
    class Gemini,Firestore,Auth,Run google
```

## Data Flow Diagram

```mermaid
sequenceDiagram
    participant U as User (Mobile)
    participant FE as Frontend
    participant BE as FastAPI + WebSocket
    participant PA as PhotoAnalyst
    participant CB as ContextBuilder
    participant GL as Gemini Live API
    participant NR as Narrator
    participant QC as QualityChecker
    participant FS as Firestore

    Note over U,FS: Phase 1 — Pre-Session Setup

    U->>FE: Upload photos + enter name
    FE->>BE: WebSocket /chat (photos + name)
    BE->>PA: Analyze photos (Gemini Vision)
    PA-->>CB: PhotoAnalysis schema
    CB-->>BE: Formatted photo_context

    Note over U,FS: Phase 2 — Live Voice Interview

    BE->>GL: Start bidi audio stream + photo_context
    GL-->>BE: AI greeting (voice)
    BE-->>FE: Audio playback

    loop Interview (5-30 min)
        U->>FE: Speak naturally
        FE->>BE: Audio frames
        BE->>GL: Audio + context
        GL-->>BE: Response audio + text
        BE-->>FE: Stream response
    end

    U->>FE: End conversation

    Note over U,FS: Phase 3 — Chapter Generation

    BE->>NR: interview_transcript
    NR-->>QC: MemoirChapter (draft)

    alt Quality Check: Pass
        QC-->>BE: status: "pass"
    else Quality Check: Fail
        QC-->>NR: feedback for revision
        NR-->>QC: MemoirChapter (revised)
        QC-->>BE: status: "pass"
    end

    BE->>FS: Save chapter + photos
    BE-->>FE: Chapter ready (WebSocket)
    FE-->>U: View memoir + download PDF
```

## Agent Summary Table

| Agent | Type | Model | Role |
|-------|------|-------|------|
| **PhotoAnalyst** | LlmAgent (Vision) | gemini-2.5-flash | Analyze uploaded photos — people, era, setting, mood |
| **ContextBuilder** | BaseAgent (Python) | None | Format photo analysis into conversational cues |
| **Interviewer** | LlmAgent (Audio) | gemini-2.5-flash-native-audio-latest | Real-time voice interview via Gemini Live API |
| **Narrator** | LlmAgent (Text) | gemini-2.5-flash | Transform transcript into literary memoir chapter |
| **QualityChecker** | LlmAgent (Text) | gemini-2.5-flash | Evaluate chapter quality — pass/fail gate |
| **EscalationChecker** | BaseAgent (Python) | None | Deterministic loop control — break on pass |
| **PreSessionPipeline** | SequentialAgent | — | Orchestrates PhotoAnalyst → ContextBuilder |
| **PostSessionPipeline** | SequentialAgent | — | Wraps quality control LoopAgent |

## Tech Stack

- **Frontend:** React + TypeScript + Vite + Tailwind + shadcn/ui
- **Backend:** FastAPI + WebSocket + Google ADK
- **AI Models:** Gemini 2.5 Flash (Vision + Text + Native Audio)
- **Database:** Cloud Firestore (Native)
- **Auth:** Firebase Auth (Phone SMS OTP)
- **Deploy:** Cloud Run (single container)
- **Voice:** Gemini Live API (bidirectional audio streaming)
