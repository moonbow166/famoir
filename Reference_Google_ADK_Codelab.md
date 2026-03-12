# Google ADK Codelab Reference — Building a Multi-Agent System

> Source: https://codelabs.developers.google.com/codelabs/production-ready-ai-roadshow/1-building-a-multi-agent-system
> Saved: 2026-02-25 | Purpose: Architecture reference for Famoir hackathon

## Why This Matters for Famoir

This is Google's official codelab for multi-agent systems with ADK. It defines the patterns
and vocabulary that hackathon judges will expect to see. Use it to ensure Famoir's architecture
is "ADK-native" and speaks the judges' language.

---

## Project: Course Creation System (4 Agents)

```
SequentialAgent (root_agent = course_creation_pipeline)
  ├── LoopAgent (research_loop, max_iterations=3)
  │     ├── Researcher (LlmAgent + google_search tool)
  │     ├── Judge (LlmAgent + output_schema=JudgeFeedback)
  │     └── EscalationChecker (BaseAgent, pure Python logic)
  └── ContentBuilder (LlmAgent)
```

## Key ADK Patterns Demonstrated

### 1. Agent Types
| Type | What It Does | Codelab Example |
|---|---|---|
| `LlmAgent` (Agent) | LLM-powered, can have tools | Researcher, Judge, ContentBuilder |
| `SequentialAgent` | Runs sub-agents in order | course_creation_pipeline |
| `LoopAgent` | Repeats sub-agents until condition | research_loop |
| `BaseAgent` | Pure Python logic, no LLM | EscalationChecker |
| `RemoteA2aAgent` | Calls agents on other servers via HTTP | Orchestrator's remote refs |

### 2. Structured Output (output_schema)
```python
class JudgeFeedback(BaseModel):
    status: Literal["pass", "fail"] = Field(
        description="Whether the research is sufficient."
    )
    feedback: str = Field(
        description="Detailed feedback on what is missing."
    )

judge = Agent(
    name="judge",
    model=MODEL,
    output_schema=JudgeFeedback,  # ← Forces structured JSON output
    disallow_transfer_to_parent=True,
    disallow_transfer_to_peers=True,
)
```

### 3. Context Propagation via session.state
Agents read/write shared state. No explicit message passing needed.
```python
# Researcher writes:
session.state["research_findings"] = findings

# Judge reads:
findings = session.state.get("research_findings")

# ContentBuilder reads:
findings = session.state.get("research_findings")
```

### 4. Control Flow via Events (EscalationChecker)
```python
class EscalationChecker(BaseAgent):
    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        feedback = ctx.session.state.get("judge_feedback")
        is_pass = isinstance(feedback, dict) and feedback.get("status") == "pass"

        if is_pass:
            yield Event(author=self.name, actions=EventActions(escalate=True))
            # ↑ Tells parent LoopAgent to STOP
        else:
            yield Event(author=self.name)
            # ↑ Loop continues
```

### 5. after_agent_callback (saving output to state)
```python
researcher = RemoteA2aAgent(
    name="researcher",
    agent_card=researcher_url,
    after_agent_callback=create_save_output_callback("research_findings"),
    # ↑ Automatically saves output to session.state["research_findings"]
)
```

### 6. Agent Isolation
```python
judge = Agent(
    disallow_transfer_to_parent=True,  # Can't hand off to parent
    disallow_transfer_to_peers=True,   # Can't hand off to siblings
    # → Forces deterministic behavior: only returns structured output
)
```

## Agent Implementations

### Researcher
```python
researcher = Agent(
    name="researcher",
    model=MODEL,
    description="Gathers information on a topic using Google Search.",
    instruction="""
    You are an expert researcher. Your goal is to find comprehensive
    and accurate information on the user's topic.
    Use the `google_search` tool to find relevant information.
    Summarize your findings clearly.
    If you receive feedback that your research is insufficient,
    use the feedback to refine your next search.
    """,
    tools=[google_search],
)
```

### Judge
```python
judge = Agent(
    name="judge",
    model=MODEL,
    description="Evaluates research findings for completeness and accuracy.",
    instruction="""
    You are a strict editor.
    Evaluate the 'research_findings' against the user's original request.
    If the findings are missing key info, return status='fail'.
    If they are comprehensive, return status='pass'.
    """,
    output_schema=JudgeFeedback,
    disallow_transfer_to_parent=True,
    disallow_transfer_to_peers=True,
)
```

### ContentBuilder
```python
content_builder = Agent(
    name="content_builder",
    model=MODEL,
    description="Transforms research findings into a structured course.",
    instruction="""
    You are an expert course creator.
    Take the approved 'research_findings' and transform them into a
    well-structured, engaging course module.
    """,
)
```

### Orchestration Wiring
```python
# Feedback loop: Researcher → Judge → EscalationChecker (repeat until pass)
research_loop = LoopAgent(
    name="research_loop",
    sub_agents=[researcher, judge, escalation_checker],
    max_iterations=3,
)

# Full pipeline: Research Loop → Content Builder
root_agent = SequentialAgent(
    name="course_creation_pipeline",
    sub_agents=[research_loop, content_builder],
)
```

## Deployment Architecture

### Local (development)
Each agent runs on a separate port:
- Researcher: 8001
- Judge: 8002
- ContentBuilder: 8003
- Orchestrator: 8004

### Cloud Run (production)
Each agent = independent Cloud Run service. Orchestrator connects via env vars:
```bash
gcloud run deploy orchestrator \
  --set-env-vars RESEARCHER_AGENT_CARD_URL=$RESEARCHER_URL/a2a/agent/.well-known/agent-card.json \
  --set-env-vars JUDGE_AGENT_CARD_URL=$JUDGE_URL/a2a/agent/.well-known/agent-card.json \
  --set-env-vars CONTENT_BUILDER_AGENT_CARD_URL=$CONTENT_BUILDER_URL/a2a/agent/.well-known/agent-card.json
```

## Testing Commands
```bash
# Test individual agent
uv run adk run agents/researcher

# Test via curl
curl -X POST http://localhost:8001/a2a/agent \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "id": 1,
    "params": {
      "message": {
        "message_id": "test-1",
        "role": "user",
        "parts": [{"text": "What is the capital of France?", "kind": "text"}]
      }
    }
  }'
```

---

## Famoir vs Codelab — Architecture Comparison

| Dimension | Codelab (Course Creator) | Famoir (Memoir) |
|---|---|---|
| **Modalities** | Text only | Voice + Vision + Text |
| **Agent count** | 4 (Researcher, Judge, ContentBuilder, EscalationChecker) | 3 (PhotoAnalyst, Interviewer, Narrator) |
| **LlmAgents** | 3 | 3 |
| **Workflow Agents** | SequentialAgent + LoopAgent | SequentialAgent (pre + post) |
| **Custom BaseAgent** | EscalationChecker | (potential: ContextBuilder) |
| **Structured output** | JudgeFeedback (Pydantic) | PhotoAnalysis + MemoirChapter |
| **Tools** | google_search | (none after removing generate_image) |
| **Real-time streaming** | ❌ | ✅ Gemini Live API (bidi audio) |
| **session.state** | ✅ | ✅ |
| **A2A Protocol** | ✅ | ❌ (not needed for hackathon) |
| **Unique UX** | Text Q&A | Voice conversation + photo sharing |

### Famoir's Advantages Over Codelab
1. **3 modalities** vs 1 (voice + vision + text vs text only)
2. **Real-time bidi streaming** — most hackathon projects won't have this
3. **Emotional depth** — memories > course content for demo impact
4. **Dynamic mid-session agent collaboration** — Photo Analyst called during live conversation
