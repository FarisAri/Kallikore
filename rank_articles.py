import json
from collections import defaultdict

# ==========================================
# Article Ranking Pipeline
# ==========================================

TRANSLATIONS = {
    2: "A pioneering Vietnamese company is creating a sustainable agriculture platform using organic techniques and IoT technologies for small farmers.",
    3: "A Singapore-based startup uses cultivation techniques to manufacture sustainable plant-based protein.",
    5: "A Thai company is transforming the aquaculture industry with innovative and sustainable methods that protect coral reefs.",
    7: "A Philippine company developed an offline-capable educational platform that brings learning access to students in rural areas.",
    8: "Malaysia and Thailand are collaborating to develop cross-border solar and wind energy projects."
}

USER_INTERESTS = [
    "Southeast Asia travel",
    "sustainable agriculture",
    "agricultural technology",
    "aquaculture and fishing",
    "environmental conservation",
    "tech for rural communities",
    "e-commerce for artisans",
    "startup innovation",
    "technology hubs",
    "plant-based alternatives"
]

RELEVANCE_KEYWORDS = {
    "sustainable": 0.9,
    "agriculture": 0.95,
    "tech": 0.8,
    "startup": 0.85,
    "farmer": 0.9,
    "aquaculture": 0.95,
    "coral": 0.9,
    "artisan": 0.85,
    "e-commerce": 0.85,
    "innovation": 0.75,
    "platform": 0.7,
    "community": 0.8,
    "rural": 0.85,
    "education": 0.7,
    "renewable": 0.7
}

LOCATION_PREFERENCE = {
    "Thailand": 1.0,
    "Vietnam": 1.0,
    "Singapore": 0.85,
    "Indonesia": 0.8,
    "Philippines": 0.75,
    "Malaysia": 0.7,
    "Japan": 0.8
}

def calculate_relevance_score(description, location):
    """Calculate relevance score based on keywords and location preference."""
    score = 0.0
    description_lower = description.lower()
    
    # Check for relevant keywords
    for keyword, weight in RELEVANCE_KEYWORDS.items():
        if keyword in description_lower:
            score = max(score, weight)
    
    # Apply location preference multiplier
    location_mult = LOCATION_PREFERENCE.get(location, 0.5)
    final_score = score * location_mult
    
    return round(final_score, 2)

def get_relevance_reason(description, location):
    """Generate a reason for the relevance score."""
    reasons = []
    description_lower = description.lower()
    
    if "sustainable" in description_lower and "agriculture" in description_lower:
        reasons.append("Matches passion for sustainable agriculture")
    if "tech" in description_lower and ("farmer" in description_lower or "rural" in description_lower):
        reasons.append("Aligns with interest in technology for rural communities")
    if "aquaculture" in description_lower or "coral" in description_lower:
        reasons.append("Directly addresses environmental conservation interest")
    if "artisan" in description_lower or "e-commerce" in description_lower:
        reasons.append("Matches interest in e-commerce for artisans")
    if "startup" in description_lower or "innovation" in description_lower:
        reasons.append("Aligns with tech entrepreneurship interest")
    if "education" in description_lower and "rural" in description_lower:
        reasons.append("Matches interest in rural education technology")
    
    if location in ["Thailand", "Vietnam"]:
        reasons.append(f"Top-priority location: {location}")
    elif location in ["Singapore", "Indonesia", "Philippines"]:
        reasons.append(f"Preferred region: {location}")
    
    return "; ".join(reasons) if reasons else "Relevant to user interests"

def rank_articles():
    """Load articles, translate, and rank by location and relevance."""
    
    print("=" * 70)
    print("NEWS ARTICLE RANKING PIPELINE")
    print("=" * 70)
    
    # Load articles
    with open('articles.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    articles = data['articles']
    
    # Phase 1: Translate non-English articles
    print("\n📝 PHASE 1: TRANSLATION")
    print("-" * 70)
    
    translated_articles = []
    for article in articles:
        article_copy = article.copy()
        if article['id'] in TRANSLATIONS:
            article_copy['description'] = TRANSLATIONS[article['id']]
            print(f"✓ Article {article['id']}: Translated {article['language']} → en")
        else:
            print(f"✓ Article {article['id']}: Already in English")
        translated_articles.append(article_copy)
    
    # Phase 2: Calculate relevance scores
    print("\n\n🎯 PHASE 2: RANKING BY RELEVANCE")
    print("-" * 70)
    
    scored_articles = []
    for article in translated_articles:
        score = calculate_relevance_score(article['description'], article['location'])
        reason = get_relevance_reason(article['description'], article['location'])
        
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
    
    # Phase 3: Sort by location, then by relevance
    print("\n\n📍 PHASE 3: SORTING BY LOCATION & RELEVANCE")
    print("-" * 70)
    
    grouped = defaultdict(list)
    for article in scored_articles:
        grouped[article['location']].append(article)
    
    # Sort each location by relevance (descending)
    for location in grouped:
        grouped[location].sort(key=lambda x: x['relevance_score'], reverse=True)
    
    # Sort locations alphabetically
    sorted_locations = sorted(grouped.keys())
    
    # Build final output
    ranking_results = {}
    for location in sorted_locations:
        ranking_results[location] = {
            "articles": grouped[location]
        }
        print(f"\n{location}:")
        for article in grouped[location]:
            print(f"  {article['relevance_score']} - {article['title']}")
    
    # Save results
    output = {
        "user_interests": USER_INTERESTS,
        "pipeline_status": "completed",
        "total_articles": len(scored_articles),
        "ranking_results": ranking_results
    }
    
    with open('ranking_results.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print("\n" + "=" * 70)
    print(f"✓ PIPELINE COMPLETE")
    print(f"  - Articles processed: {len(scored_articles)}")
    print(f"  - Locations ranked: {len(sorted_locations)}")
    print(f"  - Output saved to: ranking_results.json")
    print("=" * 70)
    
    return output

if __name__ == '__main__':
    result = rank_articles()
