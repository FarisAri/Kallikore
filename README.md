# Kallikore Personalized Global News

Kallikore is the integrated app for the Personalized News project.

---

## Inspiration

Most news apps give everyone the same feed. We wanted something that genuinely *knows* you — not through a settings form, but through a real conversation. The idea started with a frustration: if you live between cultures, follow politics in several countries, and care about topics that don't fit neatly into predefined categories, no existing reader serves you well. We were inspired to build a system where you simply talk about what matters to you and the app figures out the rest — translating that conversation into a structured interest profile and surfacing live, globally-sourced articles ranked specifically for you.

## What It Does

Kallikore is a conversational personalized news reader with three interconnected parts:

1. **Chat to build your profile** — An LLM-powered assistant (running on NVIDIA NIM) holds a natural conversation to learn your interests, preferred regions, topics, hobbies, reading language, and anything you want to avoid. Each reply silently updates a hidden structured JSON profile in real time.
2. **Live ranked news feed** — Once enough profile data exists, a Python worker queries the World News API for each country or region you care about, embeds every article using a local multilingual sentence-transformer model, ranks them by cosine similarity to your interests, and enriches the top results via an NVIDIA LLM (relevance reason + map coordinates).
3. **Interactive globe UI** — Ranked articles appear on a 3-D MapLibre globe, pinned to the locations they cover. Clicking a pin opens the article detail; a right-hand panel shows the full feed grouped by focus region. Article content can be translated on demand into the user's preferred language via the Google Translate API.

## How We Built It

- **Next.js + React** — App shell, API routes (`/api/chat`, `/api/news`, `/api/session`, `/api/translate`), and all UI components.
- **NVIDIA NIM (OpenAI-compatible SDK)** — Powers both the conversational chat replies and per-article enrichment (LLM-generated relevance reasons and geocoordinates). We use `moonshotai/kimi-k2-instruct` by default; any NIM-hosted model can be swapped in via `.env.local`.
- **World News API** — Live article retrieval, queried in parallel per `international_news_focus` entry from the user profile.
- **Python news worker** (`news_pipeline/worker.py`) — Handles the CPU-heavy work: parallel per-focus retrieval, local `sentence-transformers` embedding (`paraphrase-multilingual-MiniLM-L12-v2`), cosine-similarity ranking, multi-level caching (articles, embeddings, NVIDIA enrichment), and Nominatim geocoding for map pins.
- **MapLibre GL** — 3-D interactive globe with article pins, loaded client-side only to avoid SSR issues.
- **Session store** — Server-side JSON files in `data/sessions/` holding the conversation transcript, structured profile, and per-field update timestamps for reliable profile merging.
- **Google Cloud Translation API** — Optional on-demand translation so users can read articles in their native language.

The key design decision was to keep the LLM *out* of the ranking loop: the Python worker uses fast local embeddings for ranking and calls the NVIDIA API only for a final enrichment pass on the top articles, keeping latency and cost manageable.

## Challenges We Ran Into

- **Profile extraction from free conversation** — Getting an LLM to reliably update a strict JSON schema from a free-form chat transcript required a two-call architecture: one call produces the short user-visible reply (≤45 words) and a separate silent call re-reads the full transcript and outputs only JSON. Keeping the two in sync across multi-turn sessions was the hardest part.
- **Multilingual ranking** — Matching an English-language user profile to articles in Thai, French, Japanese, and other languages required a multilingual embedding model; cold-start model download time and memory footprint were real constraints in a hackathon environment.
- **NVIDIA NIM rate limits** — Free-tier keys have strict per-key limits. We built a key-rotation pool with per-key cooldown tracking and exponential back-off for 429 responses, and introduced an enrichment result cache so repeated queries don't re-hit the API.
- **Globe SSR** — MapLibre GL uses browser-only APIs that break during Next.js server-side rendering. Solving it with `dynamic(() => import(...), { ssr: false })` was straightforward, but coordinating the globe's render lifecycle with streaming article-pin data needed careful state management.
- **Profile deletion** — Users sometimes ask to remove a topic or country mid-conversation. We track a per-field `updatedAt` timestamp and include explicit deletion instructions in the extractor prompt so removals are honored rather than silently preserved by a "merge previous values" rule.

## Accomplishments That We Are Proud Of

- A truly conversational onboarding: no forms, no checkboxes — just natural back-and-forth that silently builds a machine-readable interest profile.
- End-to-end multilingual pipeline: a user can describe interests in English, receive articles from a dozen source languages, and read them translated into their preferred language — all in one session.
- The two-call LLM design (short user-facing reply + silent JSON extraction) keeps the UX snappy and the profile accurate simultaneously; the user never sees the structured data being built.
- A fully local ranking step (sentence-transformer cosine similarity) that is fast, free, and offline-capable once the model is downloaded, with the cloud API reserved for the value-adding enrichment layer.
- A working multi-key NVIDIA rate-limit pool that makes the free tier usable at hackathon demo scale.

## What We Learned

- Prompt design for structured extraction is significantly harder than conversational prompting: the JSON schema, merge rules, and deletion semantics all need to be explicit and unambiguous, or the model produces subtly wrong output over multi-turn sessions.
- Separating concerns between the LLM (understanding and enrichment) and a local model (ranking) dramatically improves cost, latency, and reliability — the LLM is a poor ranker but an excellent explainer.
- Caching at multiple levels (raw articles, embeddings, enrichment results) is essential when the same profile triggers many repeated API calls during development and live demos.
- Next.js API routes are a natural fit for multi-service orchestration: each route is a thin adapter that calls either the NVIDIA client or the Python subprocess, keeping the frontend completely decoupled from the backend services.

## What Is Next

- **Persistent accounts** — Replace file-based session storage with a database so users keep their profile and reading history across devices and sessions.
- **Streaming chat** — Stream LLM reply tokens so the assistant feels instant rather than waiting for a full completion.
- **Feedback loop** — Let users upvote or downvote articles and feed that signal back into the embedding ranking weights over time.
- **Richer geography** — Move beyond country-level focus to topic-region combinations (e.g., "EU climate policy", "Southeast Asian fintech") and improve geocoding accuracy for niche locations.
- **Mobile app** — The globe UI is compelling on desktop; a React Native version with push notifications for breaking news in your focus regions is a natural next step.
- **Self-hosted LLM option** — Allow teams to swap NVIDIA NIM for a locally-run model (Ollama, vLLM) so the entire pipeline runs offline or on-premise.

---

## Stack

- Next.js + React frontend with the MapLibre globe UI from `Kallikore-front-end`.
- Next API routes for sessions, chat, and news generation.
- NVIDIA NIM / Build API for all LLM calls through the OpenAI-compatible SDK.
- World News API for live article retrieval.
- Python news worker in `news_pipeline/worker.py` for per-region retrieval, local sentence-transformer embeddings, cosine ranking, and NVIDIA article reasoning.

## Data Flow

1. The user chats with the assistant.
2. `/api/chat` uses NVIDIA's OpenAI-compatible chat endpoint to reply and update the structured profile JSON.
3. The chat transcript stays in the session store for conversation continuity and profile extraction.
4. `/api/news` sends only the structured profile JSON to the Python worker.
5. The worker queries each `international_news_focus` independently, ranks top 5 per focus, enriches the articles, and returns a single combined feed.

The profile JSON and field timestamps are intentionally hidden from the UI for now.

## Setup

```bash
cp .env.example .env.local
npm install
pip install -r requirements.txt
npm run dev
```

Required for live results:

- `NVIDIA_API_KEY`
- `WORLD_NEWS_API_KEY`

Optional:

- `GOOGLE_TRANSLATE_API_KEY` — article list/detail translation via `/api/translate` (same key in `.env.local`).
- Set `PYTHON_BIN` if your Python command is not `python`.
