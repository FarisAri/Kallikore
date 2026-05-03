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
# from openai import OpenAI
import anthropic
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
from datetime import datetime, timedelta
from typing import TypedDict

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv()

WORLD_NEWS_API_KEY  = os.environ["WORLD_NEWS_API_KEY"]
# OPENROUTER_API_KEY  = os.environ["OPENROUTER_API_KEY"]
ANTHROPIC_API_KEY   = os.environ.get("ANTHROPIC_API_KEY")

# NEMOTRON_MODEL      = "nvidia/nemotron-3-super-120b-a12b:free"
EMBED_MODEL         = "paraphrase-multilingual-MiniLM-L12-v2"

SEARCH_CACHE_FILE   = "search_cache.json"   # caches World News API results by query
PROFILE_CACHE_FILE  = "profile.json"        # caches profile + embedding

RESULTS_PER_QUERY   = 100    # articles fetched per search call
TOP_N               = 40   # articles shown at the end
SOURCE_COUNTRY      = "us" # ISO 3166 — change to "gb", "de", etc. or "" for global
DAYS_BACK           = 14   # only surface articles from the past N days

# ── Setup ─────────────────────────────────────────────────────────────────────

print("Loading embedding model...")
embedder = SentenceTransformer(EMBED_MODEL)

# client = OpenAI(
#     base_url="https://openrouter.ai/api/v1",
#     api_key=OPENROUTER_API_KEY,
# )

anthropic_client = anthropic.Anthropic(
    api_key=ANTHROPIC_API_KEY
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
    if country == "":
        country = SOURCE_COUNTRY

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

        print(f"[fetch] {country!r} + date={current_day}")
        resp = requests.get(
            "https://api.worldnewsapi.com/top-news",
            params=params,
            timeout=10,
        )
        resp.raise_for_status()

        current_results = [
            {
                "title":       a.get("title", ""),
                "text":        a.get("text", "")[:300],
                "image":       a.get("image", ""),
                "url":         a.get("url", ""),
                "date":        a.get("publish_date", ""),
            }
            for a in resp.json().get("top_news", [])
            for a in a.get("news", [])
            if a.get("title") and a.get("url") and a.get("image") and a.get("publish_date") and a.get("text")
        ]

        results.extend(current_results)

        search_cache[key] = current_results

    
    save_search_cache(search_cache)

    return results

def search_articles_by_keywords(keywords: list[str], country: str = SOURCE_COUNTRY, days_back: int = DAYS_BACK) -> list[dict]:
    if not keywords:
        return get_top_country_news(country, days_back)
        
    if country == "":
        country = SOURCE_COUNTRY

            
    query_text = " OR ".join(keywords)

    if len(query_text) > 100:
        while len(" OR ".join(keywords)) > 100 and keywords:
            keywords.pop()
        query_text = " OR ".join(keywords)

    earliest_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")

    params = {
        "text":                   query_text,
        "language":               "en",
        "api-key":                WORLD_NEWS_API_KEY,
        "source-country":         country,
        "earliest-publish-date":  earliest_date,
        "number":                 RESULTS_PER_QUERY
    }

    print(params)

    key = query_key("search_" + query_text + country + earliest_date)
    if key in search_cache:
        print(f"[cache search] query={query_text!r}")
        return search_cache[key]

    print(f"[fetch search] query={query_text!r}")
    resp = requests.get(
        "https://api.worldnewsapi.com/search-news",
        params=params,
        timeout=10,
    )
    print(resp.url)
    if not resp.ok:
        print("Search API error:", resp.text)
        return []

    current_results = [
        {
            "title":       a.get("title", ""),
            "text":        a.get("text", "")[:300],
            "image":       a.get("image", ""),
            "url":         a.get("url", ""),
            "date":        a.get("publish_date", ""),
        }
        for a in resp.json().get("news", [])
        if a.get("title") and a.get("url") and a.get("image") and a.get("publish_date") and a.get("text")
    ]

    search_cache[key] = current_results
    save_search_cache(search_cache)

    return current_results


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
    texts = [f"{a['title']}. {a['text']}" for a in articles]
    vecs  = embedder.encode(texts, show_progress_bar=False)
    for article, vec in zip(articles, vecs):
        article["score"] = cosine_sim(profile_vec, vec)
    return sorted(articles, key=lambda x: x["score"], reverse=True)

# ── Main ──────────────────────────────────────────────────────────────────────


class User(TypedDict):
    name: str
    age: int
    ethnicity: str
    occupation: str
    locations: list[str]
    hobbies: list[str]
    interests: list[str]
    countries_of_interest: list[str]
    extra: str


def profile_to_text(profile: User) -> str:
    """Convert structured profile data into a single text blob for embedding."""
    
    parts = []
    if profile.get("name"):
        parts.append(f"My name is {profile['name']}.")
    if profile.get("age"):
        parts.append(f"I am {profile['age']} years old.")
    if profile.get("ethnicity"):
        parts.append(f"My ethnicity is {profile['ethnicity']}.")
    if profile.get("occupation"):
        parts.append(f"My occupation is {profile['occupation']}.")
    if profile.get("locations"):
        locs = ", ".join(profile["locations"])
        parts.append(f"I have lived in {locs}.")
    if profile.get("hobbies"):
        hobbies = ", ".join(profile["hobbies"])
        parts.append(f"My hobbies include {hobbies}.")
    if profile.get("interests"):
        interests = ", ".join(profile["interests"])
        parts.append(f"My interests include {interests}.")
    if profile.get("countries_of_interest"):
        countries = ", ".join(profile["countries_of_interest"])
        parts.append(f"I'm particularly interested in news from {countries}.")
    if profile.get("extra"):
        parts.append(f"Additional info: {profile['extra']}")
    return " ".join(parts)


if __name__ == "__main__":
    demo_profile: User = {
        "name": "Aisha Khan",
        "age":28,
        "ethnicity": "Pakistani",
        "occupation": "Data Scientist at a FinTech Startup",
        "locations": ["Karachi, Pakistan", "London, UK"],
        "hobbies": ["Cooking", "Traveling", "Yoga", "Reading"],
        "interests": ["Finance", "Machine Learning", "Cryptocurrency", "Global Markets"],
        "countries_of_interest": ["United Kingdom", "United States", "Germany"],
        "extra": "I am deeply interested in how data science is transforming the financial industry and I want to stay informed about the latest trends in FinTech, cryptocurrency, and global economic developments."
    }

    profile_text = profile_to_text(demo_profile)
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