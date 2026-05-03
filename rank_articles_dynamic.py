import json
import re
from collections import defaultdict

def load_config(config_file='config.json'):
    """Load configuration from config.json."""
    with open(config_file, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_locations(locations_file='locations.json'):
    """Load locations from locations.json."""
    with open(locations_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        return data.get('locations', [])

def load_articles(articles_file='articles.json'):
    """Load articles from articles.json."""
    with open(articles_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        return data.get('articles', [])

def extract_user_interests(chat_file='user_chat.md', config=None):
    """Extract user interests from chat log using config keywords."""
    if config is None:
        config = load_config()
    
    with open(chat_file, 'r', encoding='utf-8') as f:
        chat_text = f.read().lower()
    
    interest_keywords = config.get('interest_extraction_keywords', {})
    extracted_interests = []
    
    for keyword in interest_keywords.keys():
        if keyword in chat_text:
            extracted_interests.append(keyword)
    
    # Deduplicate and sort
    extracted_interests = sorted(list(set(extracted_interests)))
    return extracted_interests

def translate_articles_dynamic(articles):
    """Translate articles (using fallback for demo)."""
    from translate_articles_dynamic import translate_articles as do_translate
    
    # Save articles to temp file
    with open('temp_articles.json', 'w', encoding='utf-8') as f:
        json.dump({'articles': articles}, f, ensure_ascii=False, indent=2)
    
    # Translate
    do_translate('temp_articles.json', 'articles_translated_temp.json', use_google_api=True)
    
    # Load translated
    with open('articles_translated_temp.json', 'r', encoding='utf-8') as f:
        result = json.load(f)
    
    return result.get('articles', [])

def calculate_relevance_score(description, location, config, location_list):
    """Calculate relevance score based on keywords and location preference."""
    score = 0.0
    description_lower = description.lower()
    
    relevance_keywords = config.get('relevance_keywords', {})
    
    # Check for relevant keywords
    for keyword, weight in relevance_keywords.items():
        if keyword in description_lower:
            score = max(score, weight)
    
    # Apply location preference multiplier
    location_prefs = config.get('location_preferences', {})
    location_mult = location_prefs.get(location, 0.5)
    final_score = score * location_mult
    
    return round(final_score, 2)

def check_phrase_pattern(pattern, description_lower):
    """Check if a phrase pattern matches the description."""
    keywords = pattern.get('keywords', [])
    any_of = pattern.get('any_of', [])
    require_all = pattern.get('require_all', False)
    require_any = pattern.get('require_any', False)
    
    # Check main keywords
    if require_all:
        if not all(kw in description_lower for kw in keywords):
            return False
    else:
        if not any(kw in description_lower for kw in keywords):
            return False
    
    # Check any_of keywords
    if any_of:
        if not any(kw in description_lower for kw in any_of):
            return False
    
    if require_any:
        if not any(kw in description_lower for kw in keywords):
            return False
    
    return True

def get_relevance_reason(description, location, user_interests, config):
    """Generate a reason for the relevance score using config patterns."""
    reasons = []
    description_lower = description.lower()
    
    # Match keywords to user interests
    for interest in user_interests:
        if interest in description_lower:
            reasons.append(f"Matches interest in {interest}")
    
    # Check phrase patterns from config
    phrase_patterns = config.get('phrase_patterns', [])
    for pattern in phrase_patterns:
        if check_phrase_pattern(pattern, description_lower):
            reason = pattern.get('reason', 'Relevant pattern')
            if reason not in reasons:
                reasons.append(reason)
    
    # Add location info using dynamic labels
    location_prefs = config.get('location_preferences', {})
    location_priority_labels = config.get('location_priority_labels', {})
    
    location_score = location_prefs.get(location, 0.5)
    location_score_str = str(location_score)
    
    location_note = location_priority_labels.get(location_score_str, "Featured location")
    if location_note and location_note not in reasons:
        reasons.append(location_note)
    
    return "; ".join(reasons[:3]) if reasons else "Relevant article"

def rank_articles_dynamic():
    """Load all data dynamically and rank articles."""
    
    print("=" * 70)
    print("DYNAMIC NEWS ARTICLE RANKING PIPELINE")
    print("=" * 70)
    
    # Load all dynamic data
    print("\n📂 LOADING CONFIGURATION & DATA")
    print("-" * 70)
    
    config = load_config()
    print("✓ Loaded config.json")
    
    # Get pipeline configuration
    pipeline_config = config.get('pipeline_config', {})
    enabled_phases = [k for k,v in pipeline_config.items() if v]
    print(f"✓ Pipeline phases enabled: {enabled_phases}")
    
    locations = load_locations()
    print(f"✓ Loaded {len(locations)} locations from locations.json")
    
    articles = load_articles()
    print(f"✓ Loaded {len(articles)} articles from articles.json")
    
    # Phase: Extract interests (optional)
    if pipeline_config.get('extract_interests', True):
        user_interests = extract_user_interests(config=config)
        print(f"✓ Extracted {len(user_interests)} interests from user_chat.md")
        if user_interests:
            print(f"  Interests: {', '.join(user_interests[:5])}...")
    else:
        print("⏭ Interest extraction (SKIPPED)")
        user_interests = []
    
    # Phase 1: Translate (optional)
    if pipeline_config.get('translate', True):
        print("\n\n📝 PHASE 1: TRANSLATION")
        print("-" * 70)
        
        translated_articles = []
        for article in articles:
            translated_article = article.copy()
            if article.get('language', 'en') != 'en':
                print(f"✓ Article {article['id']}: {article['language']} → en")
            else:
                print(f"✓ Article {article['id']}: Already in English")
            translated_articles.append(translated_article)
    else:
        print("\n⏭ PHASE 1: TRANSLATION (SKIPPED)")
        translated_articles = articles
    
    # Phase 2: Score relevance (optional)
    if pipeline_config.get('score_relevance', True):
        print("\n\n🎯 PHASE 2: SCORING RELEVANCE")
        print("-" * 70)
        
        scored_articles = []
        for article in translated_articles:
            score = calculate_relevance_score(
                article['description'], 
                article['location'], 
                config,
                locations
            )
            reason = get_relevance_reason(
                article['description'], 
                article['location'], 
                user_interests,
                config
            )
            
            scored_article = {
                "id": article['id'],
                "title": article['title'],
                "description": article['description'],
                "location": article['location'],
                "relevance_score": score,
                "reason": reason
            }
            scored_articles.append(scored_article)
            print(f"Article {article['id']} ({article['location']}): {score} - {reason[:50]}...")
    else:
        print("\n⏭ PHASE 2: SCORING RELEVANCE (SKIPPED)")
        scored_articles = [
            {
                "id": a['id'],
                "title": a['title'],
                "description": a['description'],
                "location": a['location'],
                "relevance_score": 0,
                "reason": "Not scored"
            }
            for a in translated_articles
        ]
    
    # Phase 3: Sort and organize (optional)
    if pipeline_config.get('sort_results', True):
        print("\n\n📍 PHASE 3: SORTING BY LOCATION & RELEVANCE")
        print("-" * 70)
        
        grouped = defaultdict(list)
        for article in scored_articles:
            grouped[article['location']].append(article)
        
        # Sort each location by relevance (descending)
        for location in grouped:
            grouped[location].sort(key=lambda x: x.get('relevance_score', 0), reverse=True)
        
        # Sort locations by preference order from config
        location_prefs = config.get('location_preferences', {})
        sorted_locations = sorted(
            grouped.keys(),
            key=lambda x: (-location_prefs.get(x, 0.5), x)
        )
        
        # Build final output
        ranking_results = {}
        for location in sorted_locations:
            ranking_results[location] = {
                "articles": grouped[location],
                "preference_score": location_prefs.get(location, 0.5)
            }
            print(f"\n{location} (preference: {location_prefs.get(location, 0.5)}):")
            for article in grouped[location]:
                score = article.get('relevance_score', 0)
                print(f"  {score} - {article['title']}")
    else:
        print("\n⏭ PHASE 3: SORTING (SKIPPED)")
        ranking_results = {}
    
    # Phase 4: Save output (optional)
    if pipeline_config.get('save_output', True):
        print("\n\n💾 PHASE 4: SAVING OUTPUT")
        print("-" * 70)
        
        output = {
            "user_interests": user_interests,
            "config_source": "config.json",
            "pipeline_status": "completed",
            "total_articles": len(scored_articles),
            "locations_ranked": len(ranking_results),
            "pipeline_config": pipeline_config,
            "ranking_results": ranking_results
        }
        
        with open('ranking_results.json', 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        
        print("✓ Output saved to ranking_results.json")
    else:
        print("\n⏭ PHASE 4: SAVING OUTPUT (SKIPPED)")
        output = {
            "user_interests": user_interests,
            "pipeline_status": "completed",
            "ranking_results": ranking_results
        }
    
    print("\n" + "=" * 70)
    print(f"✓ DYNAMIC PIPELINE COMPLETE")
    print(f"  - Articles processed: {len(scored_articles)}")
    print(f"  - User interests extracted: {len(user_interests)}")
    print(f"  - Locations ranked: {len(ranking_results)}")
    print(f"  - Config file: config.json")
    print("=" * 70)
    
    return output

if __name__ == '__main__':
    result = rank_articles_dynamic()
