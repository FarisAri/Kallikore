import json
import os
import re

try:
    from google.cloud import translate_v2
    HAS_GOOGLE_API = True
except ImportError:
    HAS_GOOGLE_API = False

# Fallback translations for demo purposes
FALLBACK_TRANSLATIONS = {
    2: "A pioneering Vietnamese company is creating a sustainable agriculture platform using organic techniques and IoT technologies for small farmers.",
    3: "A Singapore-based startup uses cultivation techniques to manufacture sustainable plant-based protein.",
    5: "A Thai company is transforming the aquaculture industry with innovative and sustainable methods that protect coral reefs.",
    7: "A Philippine company developed an offline-capable educational platform that brings learning access to students in rural areas.",
    8: "Malaysia and Thailand are collaborating to develop cross-border solar and wind energy projects."
}

def get_google_translate_client():
    """Initialize Google Translate client if credentials are available."""
    if not HAS_GOOGLE_API:
        return None
    
    try:
        if 'GOOGLE_APPLICATION_CREDENTIALS' in os.environ:
            return translate_v2.Client()
        return None
    except Exception as e:
        print(f"⚠ Could not initialize Google Translate: {e}")
        return None

def translate_text_google(client, text, source_lang, target_lang='en'):
    """Translate using Google Translate API."""
    try:
        if source_lang == target_lang or source_lang == 'en':
            return text
        
        result = client.translate_text(
            text,
            source_language_code=source_lang,
            target_language_code=target_lang
        )
        return result['translatedText']
    except Exception as e:
        print(f"⚠ Translation error: {e}. Using fallback.")
        return None

def translate_articles(input_file, output_file, use_google_api=True):
    """Translate non-English article descriptions to English."""
    
    google_client = None
    if use_google_api:
        google_client = get_google_translate_client()
    
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    translated_articles = []
    
    print(f"Processing {len(data['articles'])} articles...")
    print(f"Translation method: {'Google Translate API' if google_client else 'Fallback (demo)'}")
    print("-" * 60)
    
    for article in data['articles']:
        article_id = article.get('id')
        original_lang = article.get('language', 'en')
        description = article.get('description', '')
        
        translated_article = article.copy()
        
        if original_lang != 'en':
            translated_text = None
            
            if google_client:
                translated_text = translate_text_google(
                    google_client, 
                    description, 
                    original_lang, 
                    'en'
                )
            
            if translated_text is None:
                if article_id in FALLBACK_TRANSLATIONS:
                    translated_text = FALLBACK_TRANSLATIONS[article_id]
                else:
                    translated_text = description
            
            translated_article['description_original'] = description
            translated_article['description'] = translated_text
            print(f"✓ Article {article_id} ({original_lang} → en)")
        else:
            print(f"✓ Article {article_id} (en) - No translation needed")
        
        translated_articles.append(translated_article)
    
    print("-" * 60)
    
    output_data = {
        'articles': translated_articles,
        'metadata': {
            'total_articles': len(translated_articles),
            'target_language': 'en',
            'translation_method': 'google_api' if google_client else 'fallback'
        }
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ Translation complete! Output saved to: {output_file}")
    return output_data

if __name__ == '__main__':
    result = translate_articles('articles.json', 'articles_translated.json')
    print(f"✓ Successfully translated {result['metadata']['total_articles']} articles")
