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
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any

import numpy as np
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
NVIDIA_API_KEYS_RAW = os.getenv("NVIDIA_API_KEYS", "").strip()
NVIDIA_API_BASE_URL = os.getenv("NVIDIA_API_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
NVIDIA_ENRICH_MODEL = os.getenv(
    "NVIDIA_ENRICH_MODEL",
    os.getenv("NVIDIA_CHAT_MODEL", "moonshotai/kimi-k2-instruct"),
)
NVIDIA_REQUEST_DELAY_SECONDS = max(
    0.0,
    float(os.getenv("NVIDIA_REQUEST_DELAY_MS", "1200")) / 1000.0,
)
NVIDIA_429_BACKOFF_SECONDS = max(0.0, float(os.getenv("NVIDIA_429_BACKOFF_SECONDS", "5")))
NVIDIA_MAX_RETRIES = max(1, int(os.getenv("NVIDIA_MAX_RETRIES", "3")))
NVIDIA_ENRICH_CONCURRENCY = max(1, int(os.getenv("NVIDIA_ENRICH_CONCURRENCY", "1")))

EMBED_MODEL = os.getenv("EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
DAYS_BACK = int(os.getenv("NEWS_DAYS_BACK", "1"))
RESULTS_PER_FOCUS = int(os.getenv("NEWS_RESULTS_PER_FOCUS", "60"))
NEWS_CACHE_DIR = os.getenv("NEWS_CACHE_DIR") or os.path.join(os.getcwd(), "data", "news-cache")
if not os.path.isabs(NEWS_CACHE_DIR):
    NEWS_CACHE_DIR = os.path.abspath(os.path.join(os.getcwd(), NEWS_CACHE_DIR))
NEWS_CACHE_MAX_AGE_DAYS = int(os.getenv("NEWS_CACHE_MAX_AGE_DAYS", "7"))
# Sentence-vector cache: one JSON per hash(model + exact text passed to encode).
EMBEDDING_CACHE_DIR = os.getenv("NEWS_EMBEDDING_CACHE_DIR") or os.path.join(NEWS_CACHE_DIR, "_article_embeddings")
if not os.path.isabs(EMBEDDING_CACHE_DIR):
    EMBEDDING_CACHE_DIR = os.path.abspath(os.path.join(os.getcwd(), EMBEDDING_CACHE_DIR))
ENRICHMENT_CACHE_DIR = os.getenv("NVIDIA_ENRICH_CACHE_DIR") or os.path.join(NEWS_CACHE_DIR, "_nvidia_enrichment")
if not os.path.isabs(ENRICHMENT_CACHE_DIR):
    ENRICHMENT_CACHE_DIR = os.path.abspath(os.path.join(os.getcwd(), ENRICHMENT_CACHE_DIR))
DEFAULT_IMAGE = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80"
GENERAL_WORLD_FOCUS = "World"


def _split_api_keys(raw: str) -> list[str]:
    return [
        part.strip()
        for part in re.split(r"[\s,;]+", raw)
        if part.strip()
    ]


def _dedupe_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


NVIDIA_API_KEYS = _dedupe_preserving_order(
    [NVIDIA_API_KEY] + _split_api_keys(NVIDIA_API_KEYS_RAW)
)
_NVIDIA_LOCK = threading.Lock()
_NVIDIA_KEY_INDEX = 0
_NVIDIA_NEXT_AVAILABLE_AT_BY_KEY: dict[str, float] = {}

# In-process cache; Nominatim policy: at most ~1 req/s without an API key — we sleep on miss only.
_GEOCODE_CACHE: dict[str, list[float]] = {}
NOMINATIM_USER_AGENT = os.getenv(
    "NOMINATIM_USER_AGENT",
    "KallikoreNewsWorker/1.0 (personalized-news-demo; contact via repo maintainer)",
).strip()

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
    "world": [0, 20], "global": [0, 20],
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


def enrichment_cache_path(article: dict[str, Any], profile: dict[str, Any], focus: str) -> str:
    title = str(article.get("title") or "")
    url = str(article.get("url") or "")
    summary = str(article.get("summary") or article.get("description") or "")
    profile_bits = {
        "hobbies": profile.get("hobbies"),
        "news_topics": profile.get("news_topics"),
        "international_news_focus": profile.get("international_news_focus"),
        "occupation": profile.get("occupation"),
        "native_language": profile.get("native_language"),
        "etc": profile.get("etc"),
    }
    key = hashlib.sha256(
        json.dumps(
            {
                "model": NVIDIA_ENRICH_MODEL,
                "focus": focus,
                "title": title,
                "url": url,
                "summary": summary,
                "profile": profile_bits,
            },
            sort_keys=True,
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()
    return os.path.join(ENRICHMENT_CACHE_DIR, f"{key}.json")


def load_cached_enrichment(
    article: dict[str, Any], profile: dict[str, Any], focus: str
) -> tuple[str, list[float]] | None:
    path = enrichment_cache_path(article, profile, focus)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        relevance = data.get("relevance")
        lng_lat = data.get("lngLat")
        if (
            isinstance(relevance, str)
            and isinstance(lng_lat, list)
            and len(lng_lat) == 2
        ):
            return relevance, [float(lng_lat[0]), float(lng_lat[1])]
    except FileNotFoundError:
        return None
    except Exception as exc:
        eprint(f"nvidia enrichment cache read failed: {exc}")
    return None


def save_cached_enrichment(
    article: dict[str, Any],
    profile: dict[str, Any],
    focus: str,
    relevance: str,
    lng_lat: list[float],
) -> None:
    path = enrichment_cache_path(article, profile, focus)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "cached_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                    "model": NVIDIA_ENRICH_MODEL,
                    "focus": focus,
                    "relevance": relevance,
                    "lngLat": lng_lat,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
    except Exception as exc:
        eprint(f"nvidia enrichment cache write failed: {exc}")


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


def _embedding_text_fingerprint(text: str) -> str:
    """Stable filename fragment for the exact string passed to the embedder."""
    return hashlib.sha256(f"{EMBED_MODEL}\0{text}".encode("utf-8")).hexdigest()


def embedding_cache_path_for_text(text: str) -> str:
    return os.path.join(EMBEDDING_CACHE_DIR, f"{_embedding_text_fingerprint(text)}.json")


def load_cached_article_embedding(text: str) -> list[float] | None:
    if not text.strip():
        return None
    path = embedding_cache_path_for_text(text)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        eprint(f"step 4: embedding cache read failed ({path}): {exc}")
        return None
    if data.get("model") != EMBED_MODEL:
        return None
    vec = data.get("vector")
    if not isinstance(vec, list) or not vec:
        return None
    return [float(x) for x in vec]


def save_cached_article_embedding(text: str, vector: list[float]) -> None:
    if not text.strip():
        return
    path = embedding_cache_path_for_text(text)
    try:
        os.makedirs(EMBEDDING_CACHE_DIR, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "model": EMBED_MODEL,
                    "dims": len(vector),
                    "vector": vector,
                },
                f,
                ensure_ascii=False,
            )
    except Exception as exc:
        eprint(f"step 4: embedding cache write failed ({path}): {exc}")


def cosine_sim(a: Any, b: Any) -> float:
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


def general_world_publish_date_params() -> dict[str, str]:
    """World News API requires at least one filter (text, language, dates, etc.).

    With sort=publish-time, the docs require either ``text`` or both
    ``earliest-publish-date`` and ``latest-publish-date``. A bare search with only
    number/sort returned no ``news`` hits.
    """
    end = datetime.utcnow()
    days = max(DAYS_BACK, 1)
    start = end - timedelta(days=days)
    return {
        "earliest-publish-date": start.strftime("%Y-%m-%d"),
        "latest-publish-date": end.strftime("%Y-%m-%d"),
    }


def search_news_by_country(focus: str, country_code: str) -> list[dict[str, Any]]:
    params = {
        "source-countries": country_code,
    }
    return search_news(params, focus)


def fetch_focus_articles(focus: str) -> tuple[list[dict[str, Any]], str]:
    key = normalize_focus(focus)
    country_code = COUNTRY_TO_CODE.get(key)

    if key in {"world", "global", "general", "general world"}:
        date_params = general_world_publish_date_params()
        eprint(
            "step 2: fetching general world search-news "
            f"(publish-date {date_params['earliest-publish-date']} .. {date_params['latest-publish-date']}; "
            "no country/keyword/language)"
        )
        articles = search_news(date_params, GENERAL_WORLD_FOCUS)
        eprint(f"step 2: fetched {len(articles)} raw articles for {focus!r}")
        return articles[:RESULTS_PER_FOCUS], "general-world-search"

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


def _strip_json_fence(raw: str) -> str:
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def _parse_enrichment_json(raw: str) -> tuple[str | None, str | None]:
    """Returns (relevance_sentence, pin_location_plain) from model JSON, or (None, None) if invalid."""
    try:
        obj = json.loads(_strip_json_fence(raw))
    except json.JSONDecodeError:
        return None, None
    if not isinstance(obj, dict):
        return None, None
    rel = obj.get("relevance")
    pin = obj.get("pin_location")
    relevance = str(rel).strip() if rel is not None else ""
    pin_loc = str(pin).strip() if pin is not None else ""
    if not relevance:
        return None, pin_loc or None
    return relevance, pin_loc or None


def _geocode_query(pin_location: str | None, focus: str) -> str:
    """Build a single geocoder query: specific place + region when helpful."""
    pin = (pin_location or "").strip()
    focus_t = focus.strip()
    if not pin:
        return focus_t
    if focus_t and focus_t.lower() not in pin.lower():
        return f"{pin}, {focus_t}"
    return pin


def geocode_lng_lat(query: str, fallback: list[float]) -> list[float]:
    """Resolve query to [lng, lat] via Nominatim; on failure return fallback."""
    q = " ".join(query.split())
    if not q:
        return fallback
    key = q.casefold()
    if key in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[key]
    try:
        time.sleep(1.1)
        res = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": q, "format": "json", "limit": 1},
            headers={"User-Agent": NOMINATIM_USER_AGENT},
            timeout=15,
        )
        res.raise_for_status()
        data = res.json()
        if not isinstance(data, list) or not data:
            return fallback
        first = data[0]
        lng = float(first["lon"])
        lat = float(first["lat"])
        out = [lng, lat]
        _GEOCODE_CACHE[key] = out
        return out
    except Exception as exc:
        eprint(f"nominatim geocode failed for {q!r}: {exc}")
        return fallback


def _reserve_nvidia_key() -> tuple[str, int]:
    global _NVIDIA_KEY_INDEX

    if not NVIDIA_API_KEYS:
        raise RuntimeError("NVIDIA_API_KEY or NVIDIA_API_KEYS is not set")

    with _NVIDIA_LOCK:
        key_number = (_NVIDIA_KEY_INDEX % len(NVIDIA_API_KEYS)) + 1
        key = NVIDIA_API_KEYS[_NVIDIA_KEY_INDEX % len(NVIDIA_API_KEYS)]
        _NVIDIA_KEY_INDEX += 1
        now = time.monotonic()
        available_at = _NVIDIA_NEXT_AVAILABLE_AT_BY_KEY.get(key, now)
        wait = max(0.0, available_at - now)
        _NVIDIA_NEXT_AVAILABLE_AT_BY_KEY[key] = max(now, available_at) + NVIDIA_REQUEST_DELAY_SECONDS

    if wait > 0:
        time.sleep(wait)

    return key, key_number


def retry_after_seconds(response: requests.Response | None) -> float | None:
    if response is None:
        return None
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    raw = raw.strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        return None


def nvidia_chat_completion(messages: list[dict[str, str]], max_tokens: int) -> str:
    attempts = max(NVIDIA_MAX_RETRIES, len(NVIDIA_API_KEYS))
    last_exc: Exception | None = None

    for attempt in range(attempts):
        key, key_number = _reserve_nvidia_key()
        try:
            res = requests.post(
                f"{NVIDIA_API_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": NVIDIA_ENRICH_MODEL,
                    "temperature": 0.45,
                    "max_tokens": max_tokens,
                    "messages": messages,
                },
                timeout=45,
            )
            res.raise_for_status()
            return res.json()["choices"][0]["message"]["content"].strip()
        except requests.HTTPError as exc:
            last_exc = exc
            status = exc.response.status_code if exc.response is not None else None
            if status == 429 and attempt < attempts - 1:
                backoff = retry_after_seconds(exc.response)
                if backoff is None:
                    backoff = NVIDIA_429_BACKOFF_SECONDS * (attempt + 1)
                eprint(
                    "nvidia enrichment rate limited "
                    f"(key {key_number}/{len(NVIDIA_API_KEYS)}, attempt {attempt + 1}/{attempts}); "
                    f"waiting {backoff:.1f}s"
                )
                time.sleep(backoff)
                continue
            raise
        except Exception as exc:
            last_exc = exc
            if attempt < attempts - 1:
                time.sleep(min(2.0, NVIDIA_429_BACKOFF_SECONDS))
                continue
            raise

    if last_exc:
        raise last_exc
    raise RuntimeError("NVIDIA request failed")


def enrich_article_context(
    article: dict[str, Any], profile: dict[str, Any], focus: str
) -> tuple[str, list[float]]:
    """LLM relevance line + map coordinates. Coordinates fall back to LOCATION_COORDS for this focus."""
    location_key = normalize_focus(focus)
    fallback_lng_lat = LOCATION_COORDS.get(location_key, [0, 20])

    cached = load_cached_enrichment(article, profile, focus)
    if cached is not None:
        return cached

    if not NVIDIA_API_KEYS:
        topics = profile.get("news_topics") or profile.get("hobbies") or [focus]
        reason = (
            f"Relevant to your interest in {', '.join(str(t) for t in topics[:2])} "
            f"and your focus on {focus}."
        )
        return reason, fallback_lng_lat

    title = str(article.get("title") or "")
    summary = str(article.get("summary") or article.get("description") or "")
    prompt = (
        "You annotate news for a personalized map.\n\n"
        "Return ONE JSON object only (no markdown fences, no text before or after). Keys:\n"
        '- "relevance": one concise sentence — why this article may matter to this user.\n'
        '- "pin_location": the most specific real-world place the article is mainly about '
        "(city, district, or well-known landmark), including country or region for disambiguation. "
        "Plain place name(s) only — no labels like \"City:\", no extra sentences, no quotes inside the value. "
        f'If the story is only about "{focus}" as a whole with no clearer sub-place, use an empty string "".\n\n'
        f"Profile JSON:\n{json.dumps(profile, ensure_ascii=False)}\n\n"
        f"Focus region: {focus}\n"
        f"Article title: {title}\n"
        f"Article summary: {summary}"
    )
    try:
        raw = nvidia_chat_completion(
            [{"role": "user", "content": prompt}],
            max_tokens=220,
        )
        relevance, pin_loc = _parse_enrichment_json(raw)
        if not relevance:
            eprint(f"nvidia enrichment: could not parse JSON, raw={raw[:200]!r}")
            relevance = "Relevant to your profile and selected region."
        geo_q = _geocode_query(pin_loc, focus)
        lng_lat = geocode_lng_lat(geo_q, fallback_lng_lat)
        save_cached_enrichment(article, profile, focus, relevance, lng_lat)
        return relevance, lng_lat
    except Exception as exc:
        eprint(f"nvidia enrichment unavailable: {exc}")
        return "Relevant to your profile and selected region.", fallback_lng_lat


def coerce_article(article: dict[str, Any], focus: str, score: float, rank: int, profile: dict[str, Any]) -> dict[str, Any]:
    title = str(article.get("title") or "Untitled")
    summary = str(article.get("summary") or article.get("description") or "")[:900]
    content = str(article.get("text") or article.get("description") or summary or "Open the original source for the full story.")
    language = detect_language(article)
    date = str(article.get("publish_date") or article.get("publishedAt") or article.get("date") or "")
    url = str(article.get("url") or "#")
    ai_reason, lng_lat = enrich_article_context(article, profile, focus)

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
        "ai_reason": ai_reason,
        "language": language,
    }
    return output


def rank_for_focus(
    embedder: Any, profile: dict[str, Any], focus: str, top_n: int
) -> tuple[list[dict[str, Any]], list[str], str, tuple[bool, int, int]]:
    """Returns (ranked, warnings, mode, (profile_vec_from_cache, article_emb_hits, article_emb_total))."""
    emb_stats: tuple[bool, int, int] = (False, 0, 0)
    warnings: list[str] = []
    eprint(f"step 1: starting focus {focus!r}")
    try:
        articles, query_mode = fetch_focus_articles(focus)
    except Exception as exc:
        return [], [f"{focus}: World News API request failed after fallback: {request_error_summary(exc)}"], "error", emb_stats

    if not articles:
        return [], [f"{focus}: no articles returned"], "empty", emb_stats

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
    profile_text = profile_to_text(profile, focus)
    cached_profile = load_cached_article_embedding(profile_text)
    if cached_profile is not None:
        profile_vec = np.asarray(cached_profile, dtype=np.float32)
        eprint("step 4: profile embedding cache hit")
    else:
        profile_vec = embedder.encode([profile_text], show_progress_bar=False)[0]
        save_cached_article_embedding(profile_text, np.asarray(profile_vec, dtype=np.float32).tolist())

    texts = [article_text(article) or str(article.get("title", "")) for article in filtered]
    vecs: list[Any] = [None] * len(texts)
    pending: list[tuple[int, str]] = []
    emb_hits = 0
    for i, t in enumerate(texts):
        cached_vec = load_cached_article_embedding(t)
        if cached_vec is not None:
            vecs[i] = np.asarray(cached_vec, dtype=np.float32)
            emb_hits += 1
        else:
            pending.append((i, t))
    if pending:
        new_vecs = embedder.encode([p[1] for p in pending], show_progress_bar=False)
        for row, (idx, t) in enumerate(pending):
            vec = new_vecs[row]
            vecs[idx] = vec
            save_cached_article_embedding(t, np.asarray(vec, dtype=np.float32).tolist())
    eprint(
        f"step 4: article embedding cache — {emb_hits}/{len(texts)} hits, "
        f"{len(pending)} computed (stored under _article_embeddings)"
    )
    profile_from_cache = cached_profile is not None
    emb_stats = (profile_from_cache, emb_hits, len(texts))
    scored = [
        (article, cosine_sim(profile_vec, vec))
        for article, vec in zip(filtered, vecs)
        if not math.isnan(cosine_sim(profile_vec, vec))
    ]
    scored.sort(key=lambda item: item[1], reverse=True)
    eprint(f"step 5: ranked {len(scored)} articles for {focus!r}; keeping top {top_n}")
    top_scored = scored[:top_n]
    if NVIDIA_ENRICH_CONCURRENCY > 1 and len(top_scored) > 1:
        workers = min(NVIDIA_ENRICH_CONCURRENCY, len(top_scored))
        eprint(f"step 5: enriching top articles with {workers} worker(s)")
        with ThreadPoolExecutor(max_workers=workers) as pool:
            ranked = list(
                pool.map(
                    lambda item: coerce_article(item[1][0], focus, item[1][1], item[0] + 1, profile),
                    enumerate(top_scored),
                )
            )
    else:
        ranked = [
            coerce_article(article, focus, score, idx + 1, profile)
            for idx, (article, score) in enumerate(top_scored)
        ]
    return ranked, warnings, query_mode, emb_stats


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
    using_general_world = False
    if not focuses:
        focuses = [GENERAL_WORLD_FOCUS]
        using_general_world = True
    debug_steps = [
        f"profile focuses: {', '.join(focuses)}",
        f"top_n_per_focus: {top_n}",
        f"candidate cap per focus: {RESULTS_PER_FOCUS}",
        (
            "query mode: general search-news with publish-date window (no country/keyword/language)"
            if using_general_world
            else "country query: one search-news request using source-countries, no language filter"
        ),
        (
            f"search-news date range: world/global/general use last {max(DAYS_BACK, 1)} day(s) "
            "(required by World News API for sort=publish-time); country/keyword use API default"
        ),
        (
            "nvidia enrichment: "
            f"{len(NVIDIA_API_KEYS)} key(s), "
            f"{NVIDIA_REQUEST_DELAY_SECONDS:.1f}s min delay per key, "
            f"concurrency {NVIDIA_ENRICH_CONCURRENCY}, "
            f"cache {os.path.basename(ENRICHMENT_CACHE_DIR)}"
        ),
    ]
    if using_general_world:
        debug_steps.append("no international_news_focus found; using general world news fallback")
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
    profile_emb_hits = 0
    article_emb_hits_total = 0
    article_emb_slots_total = 0

    for focus in focuses:
        ranked, focus_warnings, mode, emb_stats = rank_for_focus(embedder, profile, focus, top_n)
        all_articles.extend(ranked)
        warnings.extend(focus_warnings)
        query_modes[focus] = mode
        debug_steps.append(f"{focus}: query_mode={mode}, returned={len(ranked)}")
        p_hit, a_hits, a_total = emb_stats
        if p_hit:
            profile_emb_hits += 1
        article_emb_hits_total += a_hits
        article_emb_slots_total += a_total

    debug_steps.append(
        f"embedding cache: {profile_emb_hits}/{len(focuses)} profile vector(s) from disk; "
        f"{article_emb_hits_total}/{article_emb_slots_total} article vector(s) from disk"
    )

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
