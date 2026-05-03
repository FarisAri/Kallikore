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

TMDB_API_KEY        = os.environ.get("TMDB_API_KEY", "")
# OPENROUTER_API_KEY  = os.environ["OPENROUTER_API_KEY"]
ANTHROPIC_API_KEY   = os.environ.get("ANTHROPIC_API_KEY")

# NEMOTRON_MODEL      = "nvidia/nemotron-3-super-120b-a12b:free"
EMBED_MODEL         = "paraphrase-multilingual-MiniLM-L12-v2"

SEARCH_CACHE_FILE   = "search_cache.json"   # caches API results by query
PROFILE_CACHE_FILE  = "profile.json"        # caches profile + embedding
TOP_RATED_CACHE_FILE = "top_rated_cache.json"

RESULTS_PER_QUERY   = 100    # movies fetched per search call
TOP_N               = 40   # movies shown at the end

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

def get_popular_movies() -> list[dict]:
    """
    Get popular movies from TMDB.
    - Caches results so the same query never hits the API twice.
    """
    if not TMDB_API_KEY:
        print("Warning: TMDB_API_KEY not set.")
        return []

    key = query_key("popular_movies_" + datetime.now().strftime("%Y-%m-%d"))

    if key in search_cache:
        print("[cache] popular movies")
        return search_cache[key]

    print("[fetch] popular movies")
    results = []
    for page in range(1, 11):
        params = {
            "api_key": TMDB_API_KEY,
            "language": "en-US",
            "page": page
        }
        resp = requests.get(
            "https://api.themoviedb.org/3/movie/popular",
            params=params,
            timeout=10,
        )
        if not resp.ok:
            print(f"TMDB API error on page {page}:", resp.text)
            break
            
        for m in resp.json().get("results", []):
            if m.get("title") and m.get("overview"):
                results.append({
                    "title": m["title"],
                    "text": m["overview"],
                    "image": f"https://image.tmdb.org/t/p/w500{m['poster_path']}" if m.get("poster_path") else "",
                    "url": f"https://www.themoviedb.org/movie/{m['id']}",
                    "date": m.get("release_date", ""),
                })

    search_cache[key] = results
    save_search_cache(search_cache)
    return results

def load_top_rated_cache() -> list[dict]:
    if os.path.exists(TOP_RATED_CACHE_FILE):
        with open(TOP_RATED_CACHE_FILE) as f:
            return json.load(f)
    return []

def save_top_rated_cache(cache: list[dict]):
    with open(TOP_RATED_CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

def get_top_rated_movies_with_embeddings() -> list[dict]:
    cached = load_top_rated_cache()
    if cached:
        print(f"[cache] loaded {len(cached)} top rated movies with embeddings")
        return cached

    if not TMDB_API_KEY:
        print("Warning: TMDB_API_KEY not set.")
        return []

    print("[fetch] top rated movies (550 pages)")
    results = []
    for page in range(1, 550):
        params = {
            "api_key": TMDB_API_KEY,
            "language": "en-US",
            "page": page
        }
        resp = requests.get(
            "https://api.themoviedb.org/3/movie/top_rated",
            params=params,
            timeout=10,
        )
        if not resp.ok:
            print(f"TMDB API error on page {page}:", resp.text)
            break
            
        for m in resp.json().get("results", []):
            if m.get("title") and m.get("overview"):
                results.append({
                    "title": m["title"],
                    "text": m["overview"],
                    "image": f"https://image.tmdb.org/t/p/w500{m['poster_path']}" if m.get("poster_path") else "",
                    "url": f"https://www.themoviedb.org/movie/{m['id']}",
                    "date": m.get("release_date", ""),
                })

    print(f"Computing embeddings for {len(results)} movies...")
    texts = [f"{m['title']}. {m['text']}" for m in results]
    if texts:
        vecs = embedder.encode(texts, show_progress_bar=True)
        for i, vec in enumerate(vecs):
            results[i]["embedding"] = vec.tolist()

    save_top_rated_cache(results)
    return results

def search_movies_by_keywords(keywords: list[str]) -> list[dict]:
    if not keywords:
        return get_popular_movies()
        
    if not TMDB_API_KEY:
        print("Warning: TMDB_API_KEY not set.")
        return []

    query_text = " ".join(keywords)

    params = {
        "api_key": TMDB_API_KEY,
        "query": query_text,
        "language": "en-US",
        "page": 1,
        "include_adult": "false"
    }

    key = query_key("search_movies_" + query_text)
    if key in search_cache:
        print(f"[cache search] query={query_text!r}")
        return search_cache[key]

    print(f"[fetch search] query={query_text!r}")
    resp = requests.get(
        "https://api.themoviedb.org/3/search/movie",
        params=params,
        timeout=10,
    )
    if not resp.ok:
        print("Search API error:", resp.text)
        return []

    results = []
    for m in resp.json().get("results", []):
        if m.get("title") and m.get("overview"):
            results.append({
                "title": m["title"],
                "text": m["overview"],
                "image": f"https://image.tmdb.org/t/p/w500{m['poster_path']}" if m.get("poster_path") else "",
                "url": f"https://www.themoviedb.org/movie/{m['id']}",
                "date": m.get("release_date", ""),
            })

    search_cache[key] = results
    save_search_cache(search_cache)
    return results


# ── Profile embedding ─────────────────────────────────────────────────────────

def build_profile_embedding(basic_profile_text: str) -> np.ndarray:
    if os.path.exists(PROFILE_CACHE_FILE):
        with open(PROFILE_CACHE_FILE) as f:
            data = json.load(f)
        if data.get("basic_text", "").strip() == basic_profile_text.strip():
            print("Loaded profile embedding from cache.")
            return np.array(data["embedding"])

    print("Building rich profile text...")
    prompt = f"""Given this user's basic movie preferences, write a highly detailed paragraph describing the specific cinematic themes, narrative styles, pacing, atmosphere, and visual elements they likely enjoy. Flesh out what makes their favorite movies good and unique. Focus entirely on the semantic qualities of the cinema they love. DO NOT reference the user's name or age.

Basic Profile:
{basic_profile_text}"""
    try:
        resp = anthropic_client.messages.create(
            model="claude-haiku-4-5",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300
        )
        rich_profile_text = resp.content[0].text
        print("Generated Rich Profile:", rich_profile_text)
    except Exception as e:
        print(f"Error generating rich profile text: {e}")
        rich_profile_text = basic_profile_text

    print("Building profile embedding...")
    vec = embedder.encode([rich_profile_text])[0]
    with open(PROFILE_CACHE_FILE, "w") as f:
        json.dump({
            "basic_text": basic_profile_text, 
            "rich_text": rich_profile_text, 
            "embedding": vec.tolist()
        }, f)
    return vec

# ── Scoring ───────────────────────────────────────────────────────────────────

def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))

def rank_movies(profile_vec: np.ndarray, movies: list[dict]) -> list[dict]:
    movies_to_embed = []
    indices_to_embed = []
    for i, m in enumerate(movies):
        if "embedding" not in m:
            movies_to_embed.append(f"{m['title']}. {m['text']}")
            indices_to_embed.append(i)

    if movies_to_embed:
        vecs = embedder.encode(movies_to_embed, show_progress_bar=False)
        for idx, vec in zip(indices_to_embed, vecs):
            movies[idx]["embedding"] = vec.tolist()

    for movie in movies:
        movie_vec = np.array(movie["embedding"])
        movie["score"] = cosine_sim(profile_vec, movie_vec)

    return sorted(movies, key=lambda x: x["score"], reverse=True)

# ── Main ──────────────────────────────────────────────────────────────────────


class User(TypedDict):
    name: str
    age: int
    favorite_genres: list[str]
    favorite_movies: list[str]
    favorite_directors: list[str]
    favorite_actors: list[str]
    extra: str


def profile_to_text(profile: User) -> str:
    """Convert structured profile data into a single text blob for embedding."""
    
    parts = []
    if profile.get("name"):
        parts.append(f"My name is {profile['name']}.")
    if profile.get("age"):
        parts.append(f"I am {profile['age']} years old.")
    if profile.get("favorite_genres"):
        genres = ", ".join(profile["favorite_genres"])
        parts.append(f"My favorite movie genres are {genres}.")
    if profile.get("favorite_movies"):
        movies = ", ".join(profile["favorite_movies"])
        parts.append(f"Some of my favorite movies include {movies}.")
    if profile.get("favorite_directors"):
        directors = ", ".join(profile["favorite_directors"])
        parts.append(f"I love movies directed by {directors}.")
    if profile.get("favorite_actors"):
        actors = ", ".join(profile["favorite_actors"])
        parts.append(f"My favorite actors are {actors}.")
    if profile.get("extra"):
        parts.append(f"Additional info: {profile['extra']}")
    return " ".join(parts)


if __name__ == "__main__":
    demo_profile: User = {
        "name": "Alex",
        "age": 30,
        "favorite_genres": ["Sci-Fi", "Thriller"],
        "favorite_movies": ["Inception", "Interstellar", "The Matrix"],
        "favorite_directors": ["Christopher Nolan"],
        "favorite_actors": ["Leonardo DiCaprio", "Matthew McConaughey"],
        "extra": "I love movies that make me think and have mind-bending plot twists."
    }

    profile_text = profile_to_text(demo_profile)
    profile_vec  = build_profile_embedding(profile_text)

    movies       = get_popular_movies()
    ranked       = rank_movies(profile_vec, movies)
    top          = ranked[:TOP_N]

    print(f"\n{'═' * 60}")
    print("  YOUR SIGNAL MOVIE FEED")
    print(f"{'═' * 60}\n")

    for i, m in enumerate(top, 1):
        pub = m.get("date", "")[:10]
        print(f"  {i:>2}. {m['title']}")
        print(f"      Score: {m['score']:.3f}  |  Released: {pub}")
        print(f"      {m['url']}\n")

    print(f"{'═' * 60}")
    print(f"  {len(movies)} movies fetched")
    print(f"  Cache: {SEARCH_CACHE_FILE}")
    print(f"{'═' * 60}\n")