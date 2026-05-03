#!/usr/bin/env python3
"""JSON-in/JSON-out personalized news worker for Kallikore.

Input on stdin:
  {"profile": {...}, "top_n_per_focus": 5}

Output on stdout:
  {"mode": "live"|"mock", "articles": [...], "warnings": [...]}
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from datetime import datetime, timedelta
from typing import Any

import requests
try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*_args: Any, **_kwargs: Any) -> bool:
        return False


load_dotenv()
load_dotenv(".env.local", override=False)

HF_HOME = os.getenv("HF_HOME") or os.path.join(os.getcwd(), "data", "huggingface")
if not os.path.isabs(HF_HOME):
    HF_HOME = os.path.abspath(os.path.join(os.getcwd(), HF_HOME))
os.environ.setdefault("HF_HOME", HF_HOME)
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.makedirs(HF_HOME, exist_ok=True)

WORLD_NEWS_API_KEY = os.getenv("WORLD_NEWS_API_KEY", "").strip()
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "").strip()
NVIDIA_API_BASE_URL = os.getenv("NVIDIA_API_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
NVIDIA_ENRICH_MODEL = os.getenv(
    "NVIDIA_ENRICH_MODEL",
    os.getenv("NVIDIA_CHAT_MODEL", "moonshotai/kimi-k2-instruct"),
)

EMBED_MODEL = os.getenv("EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
DAYS_BACK = int(os.getenv("NEWS_DAYS_BACK", "1"))
RESULTS_PER_FOCUS = int(os.getenv("NEWS_RESULTS_PER_FOCUS", "60"))
NEWS_CACHE_DIR = os.getenv("NEWS_CACHE_DIR") or os.path.join(os.getcwd(), "data", "news-cache")
if not os.path.isabs(NEWS_CACHE_DIR):
    NEWS_CACHE_DIR = os.path.abspath(os.path.join(os.getcwd(), NEWS_CACHE_DIR))
NEWS_CACHE_MAX_AGE_DAYS = int(os.getenv("NEWS_CACHE_MAX_AGE_DAYS", "7"))
DEFAULT_IMAGE = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80"

COUNTRY_TO_CODE = {
    "argentina": "ar", "australia": "au", "austria": "at", "belgium": "be",
    "brazil": "br", "canada": "ca", "chile": "cl", "china": "cn",
    "colombia": "co", "czech republic": "cz", "denmark": "dk", "egypt": "eg",
    "finland": "fi", "france": "fr", "germany": "de", "greece": "gr",
    "hong kong": "hk", "hungary": "hu", "india": "in", "indonesia": "id",
    "ireland": "ie", "israel": "il", "italy": "it", "japan": "jp",
    "malaysia": "my", "mexico": "mx", "netherlands": "nl", "new zealand": "nz",
    "nigeria": "ng", "norway": "no", "philippines": "ph", "poland": "pl",
    "portugal": "pt", "russia": "ru", "saudi arabia": "sa", "singapore": "sg",
    "south africa": "za", "south korea": "kr", "spain": "es", "sweden": "se",
    "switzerland": "ch", "taiwan": "tw", "thailand": "th", "turkey": "tr",
    "ukraine": "ua", "united arab emirates": "ae", "united kingdom": "gb",
    "uk": "gb", "united states": "us", "usa": "us", "us": "us", "vietnam": "vn",
}

LOCATION_COORDS = {
    "argentina": [-58.3816, -34.6037], "australia": [151.2093, -33.8688],
    "brazil": [-47.8825, -15.7942], "canada": [-75.6972, 45.4215],
    "china": [116.4074, 39.9042], "eu": [4.3517, 50.8503],
    "europe": [10.4515, 51.1657], "france": [2.3522, 48.8566],
    "germany": [13.4050, 52.5200], "india": [77.2090, 28.6139],
    "indonesia": [106.8456, -6.2088], "japan": [139.6917, 35.6895],
    "malaysia": [101.6869, 3.1390], "mexico": [-99.1332, 19.4326],
    "nigeria": [7.4951, 9.0579], "philippines": [120.9842, 14.5995],
    "singapore": [103.8198, 1.3521], "south africa": [28.0473, -26.2041],
    "south korea": [126.9780, 37.5665], "thailand": [100.5018, 13.7563],
    "united kingdom": [-0.1276, 51.5072], "uk": [-0.1276, 51.5072],
    "united states": [-77.0369, 38.9072], "usa": [-77.0369, 38.9072],
    "us": [-77.0369, 38.9072], "vietnam": [105.8342, 21.0278],
    "west africa": [-1.0232, 7.9465], "east africa": [36.8219, -1.2921],
    "middle east": [35.2137, 31.7683], "latin america": [-74.0721, 4.7110],
}


def eprint(*args: Any) -> None:
    print(*args, file=sys.stderr)


def normalize_focus(focus: str) -> str:
    return " ".join(focus.strip().lower().split())


def model_cache_exists(model_name: str) -> bool:
    safe_name = model_name
    if "/" not in safe_name and safe_name == "all-MiniLM-L6-v2":
        safe_name = "sentence-transformers/all-MiniLM-L6-v2"
    repo_dir = "models--" + safe_name.replace("/", "--")
    snapshots = os.path.join(HF_HOME, "hub", repo_dir, "snapshots")
    return os.path.isdir(snapshots) and any(os.scandir(snapshots))


def stable_id(*parts: str) -> str:
    raw = "|".join(parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def cache_date_key(offset_days: int = 0) -> str:
    return (datetime.utcnow() - timedelta(days=offset_days)).strftime("%Y-%m-%d")


def cache_path(kind: str, focus: str, params: dict[str, Any], date_key: str | None = None) -> str:
    date_key = date_key or cache_date_key()
    safe = stable_id(
        kind,
        normalize_focus(focus),
        str(DAYS_BACK),
        str(RESULTS_PER_FOCUS),
        json.dumps(params, sort_keys=True, ensure_ascii=False),
    )
    return os.path.join(NEWS_CACHE_DIR, date_key, f"{safe}.json")


def load_cached_articles(kind: str, focus: str, params: dict[str, Any]) -> list[dict[str, Any]] | None:
    for age_days in range(max(NEWS_CACHE_MAX_AGE_DAYS, 0) + 1):
        date_key = cache_date_key(age_days)
        path = cache_path(kind, focus, params, date_key)
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            articles = data.get("articles")
            if isinstance(articles, list):
                if len(articles) == 0:
                    eprint(f"step 2: ignoring empty cache for {focus!r} ({kind}) from {date_key}")
                    continue
                eprint(
                    f"step 2: cache hit for {focus!r} ({kind}); "
                    f"{len(articles)} raw articles from {date_key} ({age_days}d old)"
                )
                return [a for a in articles if isinstance(a, dict)]
        except Exception as exc:
            eprint(f"step 2: cache read failed for {focus!r} ({kind}) from {date_key}: {exc}")
    return None


def save_cached_articles(kind: str, focus: str, params: dict[str, Any], articles: list[dict[str, Any]]) -> None:
    path = cache_path(kind, focus, params)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "cached_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                    "date_key": cache_date_key(),
                    "kind": kind,
                    "focus": focus,
                    "days_back": DAYS_BACK,
                    "results_per_focus": RESULTS_PER_FOCUS,
                    "params": params,
                    "articles": articles,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
        eprint(f"step 2: cached {len(articles)} raw articles for {focus!r} ({kind})")
    except Exception as exc:
        eprint(f"step 2: cache write failed for {focus!r} ({kind}): {exc}")


def profile_to_text(profile: dict[str, Any], focus: str | None = None) -> str:
    parts: list[str] = []
    if profile.get("user_location"):
        parts.append(f"User location: {profile['user_location']}.")
    if profile.get("age"):
        parts.append(f"Age: {profile['age']}.")
    if profile.get("ethnicity"):
        parts.append(f"Ethnicity or community context: {profile['ethnicity']}.")
    if profile.get("native_language"):
        parts.append(f"Native language: {profile['native_language']}.")
    if profile.get("occupation"):
        parts.append(f"Occupation: {profile['occupation']}.")
    for key, label in [
        ("hobbies", "Hobbies"),
        ("news_topics", "News topics"),
        ("international_news_focus", "International news focus"),
    ]:
        values = profile.get(key)
        if isinstance(values, list) and values:
            parts.append(f"{label}: {', '.join(str(v) for v in values)}.")
    etc = profile.get("etc")
    if isinstance(etc, dict) and etc:
        parts.append(f"Other context: {json.dumps(etc, ensure_ascii=False)}.")
    if focus:
        parts.append(f"Rank articles for this focus area: {focus}.")
    return " ".join(parts) or "General world news interests."


def article_text(article: dict[str, Any]) -> str:
    return ". ".join(
        str(article.get(k, "") or "")
        for k in ["title", "summary", "description", "text"]
        if article.get(k)
    )


def cosine_sim(a: Any, b: Any) -> float:
    import numpy as np

    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-10
    return float(np.dot(a, b) / denom)


def worldnews_get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    params = {k: v for k, v in params.items() if v not in (None, "", [])}
    params["api-key"] = WORLD_NEWS_API_KEY
    response = requests.get(
        f"https://api.worldnewsapi.com/{path}",
        params=params,
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def request_error_summary(exc: Exception) -> str:
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        return f"HTTP {exc.response.status_code}"
    if isinstance(exc, requests.Timeout):
        return "timeout"
    if isinstance(exc, requests.ConnectionError):
        return "connection error"
    return exc.__class__.__name__


def search_news(params: dict[str, Any], cache_focus: str) -> list[dict[str, Any]]:
    params = {
        "number": RESULTS_PER_FOCUS,
        "sort": "publish-time",
        "sort-direction": "DESC",
        **params,
    }
    cached = load_cached_articles("search-news", cache_focus, params)
    if cached is not None:
        return cached

    data = worldnews_get("search-news", params)
    articles = data.get("news", [])
    articles = [a for a in articles if isinstance(a, dict)]
    save_cached_articles("search-news", cache_focus, params, articles)
    return articles


def search_news_by_text(text: str) -> list[dict[str, Any]]:
    params = {
        "text": text,
    }
    return search_news(params, text)


def search_news_by_country(focus: str, country_code: str) -> list[dict[str, Any]]:
    params = {
        "source-countries": country_code,
    }
    return search_news(params, focus)


def fetch_focus_articles(focus: str) -> tuple[list[dict[str, Any]], str]:
    key = normalize_focus(focus)
    country_code = COUNTRY_TO_CODE.get(key)

    if country_code:
        eprint(f"step 2: fetching country search-news for {focus!r} ({country_code}, no language)")
        articles = search_news_by_country(focus, country_code)
        eprint(f"step 2: fetched {len(articles)} raw articles for {focus!r}")
        return articles[:RESULTS_PER_FOCUS], "country-search"

    eprint(f"step 2: fetching keyword search-news for {focus!r}")
    articles = search_news_by_text(focus)
    eprint(f"step 2: fetched {len(articles)} raw articles for {focus!r}")
    return articles[:RESULTS_PER_FOCUS], "keyword"


def detect_language(article: dict[str, Any]) -> str:
    lang = article.get("language") or article.get("lang")
    return str(lang or "unknown").split("-")[0].lower()


def enrich_reason(article: dict[str, Any], profile: dict[str, Any], focus: str) -> str:
    if not NVIDIA_API_KEY:
        topics = profile.get("news_topics") or profile.get("hobbies") or [focus]
        return f"Relevant to your interest in {', '.join(str(t) for t in topics[:2])} and your focus on {focus}."

    prompt = (
        "Explain in one concise sentence why this article may be relevant to the user.\n\n"
        f"Profile JSON:\n{json.dumps(profile, ensure_ascii=False)}\n\n"
        f"Focus: {focus}\n"
        f"Article title: {article.get('title', '')}\n"
        f"Article summary: {article.get('summary') or article.get('description') or ''}"
    )
    try:
        res = requests.post(
            f"{NVIDIA_API_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {NVIDIA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": NVIDIA_ENRICH_MODEL,
                "temperature": 0.6,
                "max_tokens": 96,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        res.raise_for_status()
        text = res.json()["choices"][0]["message"]["content"].strip()
        return text or "Relevant to your profile and selected region."
    except Exception as exc:
        eprint(f"nvidia enrichment unavailable: {exc}")
        return "Relevant to your profile and selected region."


def coerce_article(article: dict[str, Any], focus: str, score: float, rank: int, profile: dict[str, Any]) -> dict[str, Any]:
    title = str(article.get("title") or "Untitled")
    summary = str(article.get("summary") or article.get("description") or "")[:900]
    content = str(article.get("text") or article.get("description") or summary or "Open the original source for the full story.")
    language = detect_language(article)
    date = str(article.get("publish_date") or article.get("publishedAt") or article.get("date") or "")
    url = str(article.get("url") or "#")
    location_key = normalize_focus(focus)
    lng_lat = LOCATION_COORDS.get(location_key, [0, 20])

    output = {
        "id": stable_id(focus, title, url, str(rank)),
        "title": title,
        "location": focus,
        "date": date[:10] or datetime.utcnow().strftime("%Y-%m-%d"),
        "lngLat": lng_lat,
        "imageUrl": article.get("image") or article.get("imageUrl") or DEFAULT_IMAGE,
        "summary": summary or "No summary provided.",
        "content": content or "Open the original source for the full story.",
        "url": url,
        "source": article.get("source") or article.get("source_country") or None,
        "score": round(score, 4),
        "ai_reason": enrich_reason(article, profile, focus),
        "language": language,
    }
    return output


def rank_for_focus(embedder: Any, profile: dict[str, Any], focus: str, top_n: int) -> tuple[list[dict[str, Any]], list[str], str]:
    warnings: list[str] = []
    eprint(f"step 1: starting focus {focus!r}")
    try:
        articles, query_mode = fetch_focus_articles(focus)
    except Exception as exc:
        return [], [f"{focus}: World News API request failed after fallback: {request_error_summary(exc)}"], "error"

    if not articles:
        return [], [f"{focus}: no articles returned"], "empty"

    avoid_terms = [
        str(term).lower()
        for term in profile.get("avoid_topics", [])
        if str(term).strip()
    ]
    filtered = [
        article
        for article in articles
        if not any(term in article_text(article).lower() for term in avoid_terms)
    ]
    if not filtered:
        filtered = articles
        warnings.append(f"{focus}: avoid-topic filtering removed all articles, so unfiltered articles were ranked")
    eprint(f"step 3: {focus!r} has {len(filtered)} candidate articles after avoid-topic filtering")

    eprint(f"step 4: embedding profile and {len(filtered)} articles for {focus!r}")
    profile_vec = embedder.encode([profile_to_text(profile, focus)], show_progress_bar=False)[0]
    texts = [article_text(article) or str(article.get("title", "")) for article in filtered]
    vecs = embedder.encode(texts, show_progress_bar=False)
    scored = [
        (article, cosine_sim(profile_vec, vec))
        for article, vec in zip(filtered, vecs)
        if not math.isnan(cosine_sim(profile_vec, vec))
    ]
    scored.sort(key=lambda item: item[1], reverse=True)
    eprint(f"step 5: ranked {len(scored)} articles for {focus!r}; keeping top {top_n}")
    ranked = [
        coerce_article(article, focus, score, idx + 1, profile)
        for idx, (article, score) in enumerate(scored[:top_n])
    ]
    return ranked, warnings, query_mode


def mock_articles(profile: dict[str, Any], top_n: int) -> list[dict[str, Any]]:
    focuses = profile.get("international_news_focus") or ["Global"]
    topics = profile.get("news_topics") or profile.get("hobbies") or ["world news"]
    out: list[dict[str, Any]] = []
    for focus in focuses:
        coords = LOCATION_COORDS.get(normalize_focus(str(focus)), [0, 20])
        for i in range(min(top_n, 2)):
            topic = topics[i % len(topics)]
            out.append({
                "id": stable_id(str(focus), str(topic), str(i)),
                "title": f"[Demo] {focus}: {topic} headlines",
                "location": str(focus),
                "date": datetime.utcnow().strftime("%Y-%m-%d"),
                "lngLat": coords,
                "imageUrl": DEFAULT_IMAGE,
                "summary": "Set WORLD_NEWS_API_KEY to fetch live globally ranked articles.",
                "content": "This placeholder confirms the profile-to-news flow without calling World News API.",
                "url": "https://example.com",
                "source": "mock",
                "score": 0.5,
                "ai_reason": f"Demo item based on your focus on {focus} and interest in {topic}.",
                "language": "unknown",
            })
    return out


def run(payload: dict[str, Any]) -> dict[str, Any]:
    profile = payload.get("profile")
    if not isinstance(profile, dict):
        raise ValueError("profile must be an object")

    top_n = int(payload.get("top_n_per_focus") or 5)
    focuses = [
        str(focus).strip()
        for focus in profile.get("international_news_focus", [])
        if str(focus).strip()
    ]
    if not focuses:
        focuses = ["Global"]
    debug_steps = [
        f"profile focuses: {', '.join(focuses)}",
        f"top_n_per_focus: {top_n}",
        f"candidate cap per focus: {RESULTS_PER_FOCUS}",
        "country query: one search-news request using source-countries, no language filter",
        "search-news date range: API default when no date params are provided",
    ]
    eprint(f"step 0: profile has {len(focuses)} focus entries: {focuses}")

    if not WORLD_NEWS_API_KEY:
        return {
            "mode": "mock",
            "message": "WORLD_NEWS_API_KEY is not set. Showing placeholder results.",
            "articles": mock_articles(profile, top_n),
            "warnings": ["WORLD_NEWS_API_KEY missing"],
            "debug_steps": [*debug_steps, "mock mode: WORLD_NEWS_API_KEY missing"],
        }

    if model_cache_exists(EMBED_MODEL):
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

    eprint(f"loading embedding model: {EMBED_MODEL}")
    from sentence_transformers import SentenceTransformer

    embedder = SentenceTransformer(EMBED_MODEL)
    eprint("step 0: embedding model loaded")
    all_articles: list[dict[str, Any]] = []
    warnings: list[str] = []
    query_modes: dict[str, str] = {}

    for focus in focuses:
        ranked, focus_warnings, mode = rank_for_focus(embedder, profile, focus, top_n)
        all_articles.extend(ranked)
        warnings.extend(focus_warnings)
        query_modes[focus] = mode
        debug_steps.append(f"{focus}: query_mode={mode}, returned={len(ranked)}")

    eprint(f"step 6: complete; returning {len(all_articles)} articles")
    return {
        "mode": "live",
        "articles": all_articles,
        "warnings": warnings,
        "debug_steps": debug_steps,
        "query_modes": query_modes,
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        print(json.dumps(run(payload), ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
