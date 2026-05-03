---
name: rank-articles-by-location
description: "Orchestrate the full news article ranking pipeline: translate articles from multiple languages, extract user interests from a chat log, rank articles by relevance, and output sorted results by location."
---

# Rank Articles by Location & Relevance

This prompt orchestrates the complete pipeline for ranking news articles by location and user interest relevance.

## Pipeline Overview

```
User Input (locations JSON, articles JSON, chat log)
    ↓
[Data Translator Agent] — Translate non-English articles
    ↓
[News Ranker Agent] — Extract user interests & score articles
    ↓
Output: Articles sorted by location → relevance
```

## How to Use

### Step 1: Prepare Your Inputs

Have ready:
- **locations.json** — List of possible locations (names, regions, etc.)
- **articles.json** — News articles with `location`, `description`, `language` fields
- **user_chat_log.txt** — User's conversation describing their interests/experiences

### Step 2: Run the Pipeline

#### Phase 1: Data Translation (@data-translator)

```
@data-translator
Here's my articles metadata. Translate all non-English descriptions to English using Google Translate API:

[Paste your articles.json here]

Output a new JSON with all descriptions in English, keeping the original language field for reference.
```

**Expected output:** Translated articles JSON with all descriptions in English.

---

#### Phase 2: Article Ranking (@news-ranker)

```
@news-ranker
Here's the user's chat log and translated articles. Extract their interests and rank the articles:

**User Chat Log:**
[Paste your user_chat_log.txt here]

**Available Locations:**
[Paste your locations.json here]

**Articles to Rank:**
[Paste the translated articles.json from Phase 1]

Output a JSON object with this structure:
{
  "location_name": {
    "articles": [
      {
        "title": "...",
        "description": "...",
        "relevance_score": 0.95,
        "reason": "..."
      }
    ]
  }
}

Sort by location alphabetically, then by relevance_score (highest first).
```

**Expected output:** Final ranked JSON sorted by location → relevance.

---

## Full-Pipeline Example

If you want to run the entire pipeline at once, you can structure it like this:

```
I have three inputs for my news ranking system:

**Locations:**
{"locations": ["Thailand", "Vietnam", "Singapore", "Japan"]}

**Raw Articles (may have multiple languages):**
[your articles.json with some French, Spanish, etc.]

**User Interests (from chat):**
[user chat log]

Please:
1. First, translate all non-English article descriptions to English
2. Then rank all articles by location and relevance to the user's interests
3. Output the final sorted JSON
```

The system will automatically invoke both agents in sequence.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Translation is inaccurate | Provide language hints in the article metadata; check API key has quota |
| Relevance scores seem off | Review the user chat log—is it clear enough? Provide more context to the ranker |
| Missing articles in output | Check article JSON for missing required fields (location, description, language) |
| Location sorting wrong | Ensure location names match between articles.json and locations.json |

---
