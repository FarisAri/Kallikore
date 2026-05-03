import json

# ==========================================
# Simulated Translation Pipeline (without API)
# ==========================================
# For demonstration, using pre-translated content
# In production, use Google Translate API

TRANSLATIONS = {
    2: "A pioneering Vietnamese company is creating a sustainable agriculture platform using organic techniques and IoT technologies for small farmers.",
    3: "A Singapore-based startup uses cultivation techniques to manufacture sustainable plant-based protein.",
    5: "A Thai company is transforming the aquaculture industry with innovative and sustainable methods that protect coral reefs.",
    7: "A Philippine company developed an offline-capable educational platform that brings learning access to students in rural areas.",
    8: "Malaysia and Thailand are collaborating to develop cross-border solar and wind energy projects."
}

def translate_articles(input_file, output_file):
    """Translate non-English article descriptions to English."""
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    translated_articles = []
    
    print(f"Processing {len(data['articles'])} articles...")
    print("-" * 60)
    
    for article in data['articles']:
        article_id = article.get('id')
        original_lang = article.get('language', 'en')
        
        translated_article = article.copy()
        
        # Translate if needed
        if original_lang != 'en' and article_id in TRANSLATIONS:
            translated_article['description_original'] = article['description']
            translated_article['description'] = TRANSLATIONS[article_id]
            print(f"✓ Article {article_id} ({original_lang} → en)")
        else:
            print(f"✓ Article {article_id} (en) - No translation needed")
        
        translated_articles.append(translated_article)
    
    print("-" * 60)
    
    output_data = {
        'articles': translated_articles,
        'metadata': {
            'total_articles': len(translated_articles),
            'target_language': 'en'
        }
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ Translation complete! Output saved to: {output_file}")
    return output_data

if __name__ == '__main__':
    result = translate_articles('c:\\GitHub\\articles.json', 'c:\\GitHub\\articles_translated.json')
    print(f"✓ Successfully translated {result['metadata']['total_articles']} articles")
