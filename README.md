# Kallikore
**Your news, ranked by what matters to you.**

Kallikore is a personalized news ranking pipeline that translates multilingual Southeast Asian news articles into English, scores each one against a user's interests and location preferences, and delivers a ranked, grouped feed — so you always see the stories most relevant to you, first.

---

## Inspiration

News today is abundant but rarely personal. Travelers, researchers, and global citizens who care deeply about specific regions and topics spend too much time sifting through irrelevant headlines. We were inspired by the experience of spending time in Southeast Asia and wanting a feed that actually reflects those interests — sustainable agriculture, rural tech, environmental conservation — without having to read through dozens of articles first. We wanted a system that *understands* you and surfaces what matters.

## What It Does

Kallikore is a three-phase news ranking pipeline:

1. **Translate** — Ingests news articles in any language (Thai, Vietnamese, Japanese, etc.) and translates them into English using the Google Translate API (with a fallback for demo mode).
2. **Score** — Extracts the user's interests from a free-form chat log, then scores each article against those interests using configurable keyword weights and location preferences.
3. **Rank** — Groups articles by location, sorts each group by relevance score, and outputs a clean `ranking_results.json` feed ordered by the locations the user cares about most.

All scoring rules, keyword weights, and location preferences are driven by `config.json`, so the pipeline adapts to any user or topic domain without touching code.

## How We Built It

- **Python** for the pipeline logic (`rank_articles_dynamic.py`, `translate_articles_dynamic.py`)
- **Google Cloud Translate API** for multilingual article translation, with a pre-translated fallback for offline/demo use
- **JSON configuration** (`config.json`, `locations.json`, `articles.json`) to make every scoring parameter externally tunable
- **Markdown chat log parsing** (`user_chat.md`) to extract user interests dynamically from natural-language text
- A modular, phase-based architecture so each step (translate → extract → score → sort) can be run or skipped independently via pipeline flags

## Challenges We Ran Into

- **Interest extraction from free text** — Turning a casual chat log into a structured interest profile without NLP libraries required careful keyword design and phrase-pattern matching in `config.json`.
- **Language-agnostic scoring** — Relevance scoring only works after translation, so we had to carefully sequence translation before scoring and handle the case where the API is unavailable.
- **Location disambiguation** — Article locations sometimes appear in different formats; normalizing these to match the preference map needed extra care.
- **Balancing keyword specificity vs. recall** — Weights that are too broad inflate scores; weights that are too narrow miss relevant articles. Tuning `config.json` to hit the right balance took several iterations.

## Accomplishments That We Are Proud Of

- A fully data-driven pipeline where changing a single JSON file completely reshapes the rankings — no code changes required.
- Automatic interest extraction: drop in a new `user_chat.md` and the system builds a fresh interest profile on its own.
- Clean, readable ranked output grouped by location with human-readable relevance reasons for every article.
- A working Google Translate integration with a graceful demo fallback so the pipeline runs end-to-end even without API credentials.

## What We Learned

- Designing for configurability from day one pays off enormously — moving hardcoded values to `config.json` made iteration dramatically faster.
- Simple keyword-weight scoring can be surprisingly effective when the domain is well-defined and the configuration is thoughtfully tuned.
- Structuring a pipeline with skippable phases makes debugging and testing much easier than a single monolithic script.
- Parsing user intent from natural language, even with basic keyword matching, produces genuinely useful personalization signals.

## What Is Next

- **REST API** — Wrap the pipeline in a FastAPI service so it can be called from a web or mobile front end.
- **UI dashboard** — A configuration interface to let users set their location preferences and interest keywords without editing JSON.
- **Advanced NLP** — Replace keyword matching with an embedding-based similarity model for richer, more accurate interest extraction and article scoring.
- **Database backend** — Store articles, user profiles, and ranking history in a database to support real-time feeds and historical comparisons.
- **Broader language and region support** — Extend beyond Southeast Asia to cover any region and any set of source languages.
