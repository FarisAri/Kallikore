# Kallikore Personalized Global News

Kallikore is the integrated app for the Personalized News project.

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

- Set `PYTHON_BIN` if your Python command is not `python`.
