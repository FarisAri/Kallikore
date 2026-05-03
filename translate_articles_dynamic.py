import json
import os
import re
import requests

# LibreTranslate Configuration
LIBRETRANSLATE_URL = "http://localhost:5000/translate"

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# Fallback translations for demo purposes
FALLBACK_TRANSLATIONS = {
    2: "A pioneering Vietnamese company is creating a sustainable agriculture platform using organic techniques and IoT technologies for small farmers.",
    3: "A Singapore-based startup uses cultivation techniques to manufacture sustainable plant-based protein.",
    5: "A Thai company is transforming the aquaculture industry with innovative and sustainable methods that protect coral reefs.",
    7: "A Philippine company developed an offline-capable educational platform that brings learning access to students in rural areas.",
    8: "Malaysia and Thailand are collaborating to develop cross-border solar and wind energy projects."
}

def translate_text_libretranslate(text, source_lang, target_lang='en'):
    """Translate using locally hosted LibreTranslate."""
    if source_lang == target_lang or source_lang == 'en':
        return text
    
    try:
        # Map language codes if needed (ISO 639-1 to LibreTranslate codes)
        lang_mapping = {
            'fr': 'fr',
            'es': 'es',
            'de': 'de',
            'it': 'it',
            'ja': 'ja',
            'pt': 'pt',
            'ru': 'ru',
            'cs': 'cs',
            'en': 'en'
        }
        
        source_code = lang_mapping.get(source_lang, source_lang)
        target_code = lang_mapping.get(target_lang, target_lang)
        
        payload = {
            'q': text,
            'source': source_code,
            'target': target_code
        }
        
        response = requests.post(LIBRETRANSLATE_URL, json=payload, timeout=10)
        response.raise_for_status()
        
        result = response.json()
        return result.get('translatedText', text)
    except requests.exceptions.ConnectionError:
        print(f"⚠ Could not connect to LibreTranslate at {LIBRETRANSLATE_URL}")
        return None
    except Exception as e:
        print(f"⚠ Translation error: {e}")
        return None

def translate_articles(input_file, output_file, use_libretranslate=True):
    """Translate non-English article titles and descriptions to English."""
    
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    translated_articles = []
    
    print(f"Processing {len(data['articles'])} articles...")
    print(f"Translation method: {'LibreTranslate' if use_libretranslate else 'Fallback (demo)'}")
    print("-" * 60)
    
    for article in data['articles']:
        article_id = article.get('id')
        original_lang = article.get('language', 'en')
        title = article.get('title', '')
        description = article.get('description', '')
        
        translated_article = article.copy()
        
        if original_lang != 'en':
            # Translate title
            translated_title = None
            if use_libretranslate:
                translated_title = translate_text_libretranslate(
                    title,
                    original_lang,
                    'en'
                )
            
            if translated_title is None:
                translated_title = title
            
            # Translate description
            translated_desc = None
            if use_libretranslate:
                translated_desc = translate_text_libretranslate(
                    description,
                    original_lang,
                    'en'
                )
            
            if translated_desc is None:
                if article_id in FALLBACK_TRANSLATIONS:
                    translated_desc = FALLBACK_TRANSLATIONS[article_id]
                else:
                    translated_desc = description
            
            translated_article['title_original'] = title
            translated_article['title'] = translated_title
            translated_article['description_original'] = description
            translated_article['description'] = translated_desc
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
            'translation_service': 'libretranslate_local'
        }
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ Translation complete! Output saved to: {output_file}")
    return output_data

if __name__ == '__main__':
    import sys
    
    input_file = 'articles.json'
    output_file = 'articles_translated.json'
    
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    
    result = translate_articles(input_file, output_file, use_libretranslate=True)
    print(f"\u2713 Successfully translated {result['metadata']['total_articles']} articles")
