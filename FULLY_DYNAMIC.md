# Fully Dynamic Article Ranking Pipeline

## ✅ What's Now Dynamic

**Everything is controlled via `config.json`:**

### 1. **Relevance Keywords & Weights** ✓
```json
{
  "relevance_keywords": {
    "sustainable": 0.9,
    "agriculture": 0.95,
    "tech": 0.8,
    ...
  }
}
```
Change weights without touching Python code.

### 2. **Location Preferences** ✓
```json
{
  "location_preferences": {
    "Thailand": 1.0,
    "Vietnam": 1.0,
    "Singapore": 0.85,
    ...
  }
}
```
Adjust location priority scores dynamically.

### 3. **Interest Extraction Keywords** ✓
```json
{
  "interest_extraction_keywords": {
    "sustainable": true,
    "agriculture": true,
    "startup": true,
    ...
  }
}
```
Define what keywords to extract from user chat—automatically parsed from `user_chat.md`.

### 4. **Phrase Patterns (Multi-word Rules)** ✓
```json
{
  "phrase_patterns": [
    {
      "name": "sustainable_agriculture",
      "keywords": ["sustainable", "agriculture"],
      "require_all": true,
      "reason": "Sustainable agriculture focus"
    },
    {
      "name": "tech_for_farmers",
      "keywords": ["tech", "technology"],
      "any_of": ["farmer", "rural"],
      "reason": "Technology for rural communities"
    }
  ]
}
```
Define complex matching patterns without coding.

### 5. **Location Priority Labels** ✓
```json
{
  "location_priority_labels": {
    "1.0": "Top-priority location",
    "0.9": "Primary region",
    "0.85": "Preferred region",
    "0.8": "Key market",
    ...
  }
}
```
Customize labels based on location preference scores.

### 6. **Pipeline Phase Control** ✓
```json
{
  "pipeline_config": {
    "translate": true,
    "extract_interests": true,
    "score_relevance": true,
    "generate_reasons": true,
    "sort_results": true,
    "save_output": true
  }
}
```
Enable/disable any phase—run partial pipelines for testing.

---

## 🎯 How It Works

### Full Pipeline Flow
```
📂 Load config.json
   ↓
✓ All settings loaded (keywords, preferences, patterns)
   ↓
🔄 Check pipeline_config → enable/disable phases
   ↓
📝 PHASE 1: Translate (configurable)
   ↓
🎯 PHASE 2: Score relevance (keywords from config)
   ↓
🔍 Match phrase patterns (from config)
   ↓
📍 PHASE 3: Sort by location (preferences from config)
   ↓
💾 PHASE 4: Save output (if enabled in config)
```

---

## 🔧 Example Use Cases

### Use Case 1: Skip Translation
```json
{
  "pipeline_config": {
    "translate": false,
    "extract_interests": true,
    "score_relevance": true,
    "sort_results": true,
    "save_output": true
  }
}
```
Run: `python rank_articles_dynamic.py` → skips translation, tests scoring

### Use Case 2: Custom Keyword Weights
```json
{
  "relevance_keywords": {
    "sustainable": 0.95,  // increase weight
    "blockchain": 0.7,    // add new keyword
    "ai": 0.8,
    "climate": 0.9
  }
}
```
Run: `python rank_articles_dynamic.py` → uses new weights

### Use Case 3: Add New Location with Custom Label
```json
{
  "location_preferences": {
    "Thailand": 1.0,
    "CustomRegion": 0.6
  },
  "location_priority_labels": {
    "0.6": "Experimental region"
  }
}
```
Run: `python rank_articles_dynamic.py` → includes new location with custom label

### Use Case 4: Add Phrase Pattern
```json
{
  "phrase_patterns": [
    {
      "name": "blockchain_sustainability",
      "keywords": ["blockchain"],
      "any_of": ["carbon", "emissions", "green"],
      "reason": "Blockchain for climate action"
    }
  ]
}
```
Run: `python rank_articles_dynamic.py` → matches new pattern

### Use Case 5: Only Score, Don't Sort
```json
{
  "pipeline_config": {
    "translate": true,
    "extract_interests": true,
    "score_relevance": true,
    "sort_results": false,
    "save_output": true
  }
}
```
Run: `python rank_articles_dynamic.py` → scores articles but skips sorting

---

## 📊 Output Structure

The output `ranking_results.json` now includes:

```json
{
  "user_interests": ["agriculture", "technology", ...],
  "config_source": "config.json",
  "pipeline_status": "completed",
  "total_articles": 8,
  "locations_ranked": 7,
  "pipeline_config": {
    "translate": true,
    "extract_interests": true,
    ...
  },
  "ranking_results": {
    "Thailand": {
      "articles": [...],
      "preference_score": 1.0
    }
  }
}
```

---

## 🚀 Advanced: Pipeline as a Service

With the fully dynamic config, you can:

### 1. **Create Multiple Profiles**
```
config_aggressive.json    (high weights for popularity)
config_niche.json         (focus on specific topics)
config_multilang.json     (all languages)
config_english_only.json  (skip translation)
```

Then run with different configs:
```bash
python rank_articles_dynamic.py --config config_aggressive.json
```

### 2. **API Integration**
```python
def rank_with_custom_config(custom_config):
    with open('config.json', 'w') as f:
        json.dump(custom_config, f)
    return rank_articles_dynamic()
```

### 3. **A/B Testing**
Compare results from two different keyword weights:
```bash
python rank_articles_dynamic.py  # config_a.json
python rank_articles_dynamic.py  # config_b.json
# Compare ranking_results.json outputs
```

---

## ✓ What's No Longer Hardcoded

- ❌ TRANSLATIONS — Uses Google Translate API + fallback
- ❌ RELEVANCE KEYWORDS — Loaded from `config.json`
- ❌ LOCATION PREFERENCES — Loaded from `config.json`
- ❌ INTEREST EXTRACTION — Loaded from `config.json`
- ❌ USER INTERESTS — Extracted from `user_chat.md`
- ❌ PHRASE PATTERNS — Loaded from `config.json`
- ❌ LOCATION LABELS — Loaded from `config.json`
- ❌ PIPELINE PHASES — Controlled by `pipeline_config` in `config.json`

---

## 🔄 Running the Dynamic Pipeline

```bash
cd c:\GitHub\Kallikore
python rank_articles_dynamic.py
```

**Output:**
- Console: Phase-by-phase status
- File: `ranking_results.json` (with config used)

---

## 📝 Next Steps

1. **Add CLI arguments** to select different config files
2. **Create REST API** for on-demand ranking
3. **Add database** to store historical rankings
4. **Implement config versioning** to track changes
5. **Add monitoring** to track pipeline performance

All possible without changing Python code—just update `config.json`!
