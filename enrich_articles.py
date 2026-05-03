"""
Article Enrichment Pipeline
- Uses existing translate_articles function for translation
- Generates AI-based reasons for relevance using OpenRouter
- Outputs enriched JSON with translated content and AI reasoning
"""

import json
import os
import requests
import re
from dotenv import load_dotenv
from translate_articles_dynamic import translate_articles

# Load environment variables
load_dotenv()

# Configuration
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', '')
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openrouter/auto"


def generate_ai_reason(article_title, article_description, article_location, user_context):
    """Generate AI-based reason for article relevance using OpenRouter with full user context."""
    
    if not OPENROUTER_API_KEY:
        return "LLM unavailable - API key not set"
    
    try:
        prompt = f"""You are analyzing a news article for relevance to a user. Here is the user's full background and interests:

USER CONTEXT:
{user_context}

Now evaluate this article:

ARTICLE TITLE: {article_title}
ARTICLE LOCATION: {article_location}
ARTICLE DESCRIPTION: {article_description}

Based on the user's interests and background above, provide a brief (1-2 sentence) explanation of why this article would be relevant to them. Focus on specific connections to their stated interests."""

        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "HTTP-Referer": "https://github.com/kallikore/article-enricher",
            "X-Title": "Article Enricher",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": OPENROUTER_MODEL,
            "temperature": 0.7,
            "max_tokens": 256,
            "messages": [{"role": "user", "content": prompt}]
        }
        
        response = requests.post(
            OPENROUTER_API_URL,
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            return f"API error: {response.status_code}"
        
        result = response.json()
        if 'choices' in result and len(result['choices']) > 0:
            content = result['choices'][0].get('message', {}).get('content', '')
            return content.strip()
        
        return "No response from LLM"
        
    except Exception as e:
        return f"Error generating reason: {str(e)}"


def enrich_articles(input_file, output_file, user_chat_file='user_chat.md'):
    """
    Enrich articles with translations and AI-generated reasons.
    
    Uses existing translate_articles function for translation.
    Generates AI reasons for each article using OpenRouter with full user context.
    
    Args:
        input_file: Path to input JSON file with articles
        output_file: Path to output enriched JSON file
        user_chat_file: Path to user chat/interests markdown file (for full context)
    """
    
    print("=" * 70)
    print("ARTICLE ENRICHMENT PIPELINE")
    print("=" * 70)
    
    # Load user context from chat file
    user_context = ""
    if os.path.exists(user_chat_file):
        print(f"\n📖 LOADING USER CONTEXT")
        print("-" * 70)
        try:
            with open(user_chat_file, 'r', encoding='utf-8') as f:
                user_context = f.read()
            print(f"✓ Loaded user context from {user_chat_file} ({len(user_context)} chars)")
        except Exception as e:
            print(f"⚠ Could not load user context: {e}")
    else:
        print(f"\n⚠ User context file not found: {user_chat_file}")
        print("  Using default context for AI reasoning")
        user_context = "User interested in technology, sustainability, agriculture, and innovation"
    
    # Phase 1: Translate articles using existing function
    print(f"\n📝 PHASE 1: TRANSLATING ARTICLES")
    print("-" * 70)
    
    temp_translated_file = '_temp_translated.json'
    translate_result = translate_articles(input_file, temp_translated_file, use_libretranslate=True)
    
    translated_articles = translate_result.get('articles', [])
    print(f"✓ Translation complete: {len(translated_articles)} articles translated")
    
    # Phase 2: Generate AI reasons
    print(f"\n🤖 PHASE 2: GENERATING AI REASONS")
    print("-" * 70)
    print(f"Using full user context for maximum relevance...")
    print()
    
    enriched_articles = []
    
    for i, article in enumerate(translated_articles, 1):
        title = article.get('title', '')
        description = article.get('description', '')
        location = article.get('location', 'Unknown')
        article_id = article.get('id', i)
        
        print(f"  Article {article_id}: Generating reason...", end='')
        reason = generate_ai_reason(title, description, location, user_context)
        
        article['ai_reason'] = reason
        enriched_articles.append(article)
        print(" ✓")
    
    # Phase 3: Save enriched articles
    print(f"\n💾 PHASE 3: SAVING ENRICHED ARTICLES")
    print("-" * 70)
    
    output_data = {
        'articles': enriched_articles,
        'metadata': {
            'total_articles': len(enriched_articles),
            'user_context_file': user_chat_file,
            'translation_service': 'libretranslate',
            'ai_service': 'openrouter',
            'pipeline_status': 'completed'
        }
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"✓ Enriched articles saved to: {output_file}")
    
    # Clean up temp file
    try:
        os.remove(temp_translated_file)
    except:
        pass
    
    print("\n" + "=" * 70)
    print(f"✓ ENRICHMENT COMPLETE")
    print(f"  - Articles processed: {len(enriched_articles)}")
    print(f"  - User context: {user_chat_file}")
    print("=" * 70)
    
    return output_data


if __name__ == '__main__':
    import sys
    
    input_file = 'articles.json'
    output_file = 'articles_enriched.json'
    user_chat_file = 'user_chat.md'
    
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    if len(sys.argv) > 3:
        user_chat_file = sys.argv[3]
    
    result = enrich_articles(input_file, output_file, user_chat_file)
