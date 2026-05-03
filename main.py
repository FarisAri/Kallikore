#!/usr/bin/env python3
"""
Signal — Personalized News
Nemotron reads your profile, decides what to search for, and calls
World News API as a tool. Results are ranked by embedding similarity.
"""

import os
import json
import hashlib
import numpy as np
import requests
from openai import OpenAI
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
from datetime import datetime, timedelta

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv()

WORLD_NEWS_API_KEY  = os.environ["WORLD_NEWS_API_KEY"]
OPENROUTER_API_KEY  = os.environ["OPENROUTER_API_KEY"]

NEMOTRON_MODEL      = "nvidia/nemotron-3-super-120b-a12b:free"
EMBED_MODEL         = "all-MiniLM-L6-v2"

SEARCH_CACHE_FILE   = "search_cache.json"   # caches World News API results by query
PROFILE_CACHE_FILE  = "profile.json"        # caches profile + embedding

RESULTS_PER_QUERY   = 100    # articles fetched per search call
TOP_N               = 20   # articles shown at the end
SOURCE_COUNTRY      = "us" # ISO 3166 — change to "gb", "de", etc. or "" for global
DAYS_BACK           = 1    # only surface articles from the past N days

# ── Hardcoded profile — edit this ─────────────────────────────────────────────

PROFILE = """

"""

# ── Setup ─────────────────────────────────────────────────────────────────────

print("Loading embedding model...")
embedder = SentenceTransformer(EMBED_MODEL)

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

# ── Search cache ──────────────────────────────────────────────────────────────

def load_search_cache() -> dict:
    if os.path.exists(SEARCH_CACHE_FILE):
        with open(SEARCH_CACHE_FILE) as f:
            return json.load(f)
    return {}

def save_search_cache(cache: dict):
    with open(SEARCH_CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

def query_key(query: str) -> str:
    """Stable cache key — includes country and date window so stale results aren't reused."""
    raw = f"{query.lower().strip()}"
    return hashlib.md5(raw.encode()).hexdigest()

# ── World News API tool ───────────────────────────────────────────────────────

search_cache = load_search_cache()

def get_top_country_news(country: str = SOURCE_COUNTRY, days_back: int = DAYS_BACK) -> list[dict]:
    """
    Get top news articles from specific country.
    - Limits results to the past DAYS_BACK days.
    - Filters by country (default SOURCE_COUNTRY, pass "" for global).
    - Caches results so the same query never hits the API twice.
    """
    params = {
        "language":               "en",
        "api-key":                WORLD_NEWS_API_KEY,
        "source-country":         country
    }

    results = []

    for day in range(DAYS_BACK + 1):
        current_day = (datetime.now() - timedelta(days=day)).strftime("%Y-%m-%d")

        key = query_key(country + current_day)

        if key in search_cache:
            print(f"[cache] {country!r} + date={current_day}")
            results.extend(search_cache[key])
            continue

        params["date"] = current_day

        print(f"  [fetch] {country!r} + date={current_day}")
        resp = requests.get(
            "https://api.worldnewsapi.com/top-news",
            params=params,
            timeout=10,
        )
        resp.raise_for_status()
        articles = [obj for item in resp.json() for obj in item.get("news", [])]

        current_results = [
            {
                "title":       a.get("title", ""),
                "summary":     a.get("summary", "")[:300],
                "image":       a.get("image", ""),
                "url":         a.get("url", ""),
                "date":        a.get("published", ""),
            }
            for a in articles
            if a.get("title") and a.get("url") and a.get("image") and a.get("published")
        ]

        results.extend(current_results)

        search_cache[key] = current_results

    
    save_search_cache(search_cache)

    return results


# ── Profile embedding ─────────────────────────────────────────────────────────

def build_profile_embedding(profile_text: str) -> np.ndarray:
    if os.path.exists(PROFILE_CACHE_FILE):
        with open(PROFILE_CACHE_FILE) as f:
            data = json.load(f)
        if data.get("text", "").strip() == profile_text.strip():
            print("Loaded profile embedding from cache.")
            return np.array(data["embedding"])

    print("Building profile embedding...")
    vec = embedder.encode([profile_text])[0]
    with open(PROFILE_CACHE_FILE, "w") as f:
        json.dump({"text": profile_text, "embedding": vec.tolist()}, f)
    return vec

# ── Scoring ───────────────────────────────────────────────────────────────────

def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))

def rank_articles(profile_vec: np.ndarray, articles: list[dict]) -> list[dict]:
    texts = [f"{a['title']}. {a['summary']}" for a in articles]
    vecs  = embedder.encode(texts, show_progress_bar=False)
    for article, vec in zip(articles, vecs):
        article["score"] = cosine_sim(profile_vec, vec)
    return sorted(articles, key=lambda x: x["score"], reverse=True)

# ── Main ──────────────────────────────────────────────────────────────────────


profile_text = PROFILE.strip()
profile_vec  = build_profile_embedding(profile_text)

articles     = get_top_country_news("us", DAYS_BACK)
ranked       = rank_articles(profile_vec, articles)
top          = ranked[:TOP_N]

print(f"\n{'═' * 60}")
print("  YOUR SIGNAL FEED")
print(f"{'═' * 60}\n")

for i, a in enumerate(top, 1):
    pub = a.get("published", "")[:10]
    print(f"  {i:>2}. {a['title']}")
    print(f"      Score: {a['score']:.3f}  |  Published: {pub}")
    print(f"      {a['url']}\n")

print(f"{'═' * 60}")
print(f"  {len(articles)} articles fetched · past {DAYS_BACK} days · country={SOURCE_COUNTRY or 'global'}")
print(f"  Cache: {SEARCH_CACHE_FILE}")
print(f"{'═' * 60}\n")