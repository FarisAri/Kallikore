from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import json
import logging

from main import (
    anthropic_client,
    build_profile_embedding,
    get_popular_movies,
    get_top_rated_movies_with_embeddings,
    search_movies_by_keywords,
    rank_movies,
    profile_to_text,
    TOP_N
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    profile_so_far: Optional[dict] = None

class ProfileRequest(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    favorite_genres: Optional[List[str]] = None
    favorite_movies: Optional[List[str]] = None
    favorite_directors: Optional[List[str]] = None
    favorite_actors: Optional[List[str]] = None
    extra: Optional[str] = None

@app.post("/api/chat")
def chat(req: ChatRequest):
    system_prompt = """
    You are an intelligent, friendly onboarding assistant for a personalized movie recommendation app.
    Your goal is to get to know the user so you can build a profile of their movie tastes, favorite genres, and preferences.
    Keep your questions natural, conversational, and brief. Ask 1-2 questions at a time.
    If a user doesn't know specific genres or director names, don't press them. Instead, ask them about their favorite movies or TV shows, from which you can infer other data points.
    Try your best to get information for all of the fields in the profile. If a user ignores a question, try asking it again in a different way, but dont force them to answer.
    If you feel you have enough information, output a JSON block summarizing the profile in the following format inside a markdown code block:
    ```json
    {
        "name": "...",
        "age": 28,
        "favorite_genres": ["...", "..."],
        "favorite_movies": ["...", "..."],
        "favorite_directors": ["...", "..."],
        "favorite_actors": ["...", "..."],
        "extra": "..."
    }
    ```
    Otherwise, just continue the conversation naturally.
    
    IMPORTANT: Do NOT output any internal thoughts, reasoning, or "thinking out loud". You must ONLY reply directly to the user with your next conversational question or statement.
    """
    
    if req.profile_so_far:
        system_prompt += f"\n\nThe user already has an existing profile:\n```json\n{json.dumps(req.profile_so_far, indent=2)}\n```\nAsk them what they would like to change or update about it."
    
    req_messages = [{"role": m.role, "content": m.content} for m in req.messages]
        
    try:
        response = anthropic_client.messages.create(
            model="claude-haiku-4-5",
            system=system_prompt,
            messages=req_messages,
            max_tokens=1000
        )
        return {"reply": response.content[0].text}
    except Exception as e:
        logging.error(f"Error calling LLM: {e}")
        return {"reply": "I'm sorry, I'm having trouble connecting to my brain right now. Can you try again?"}

@app.post("/api/movies")
def get_movies(profile: ProfileRequest):
    profile_dict = profile.model_dump(exclude_none=True)
    if not profile_dict:
        return {"movies": []}
        
    profile_text = profile_to_text(profile_dict)
    profile_vec = build_profile_embedding(profile_text)
    
    # prompt = f"Extract a few broad search keywords (4-10) or short phrases from this user profile to find relevant movies. Return ONLY the keywords separated by commas, no other text.\n\nProfile:\n{profile_text}"
    # try:
    #     kw_response = anthropic_client.messages.create(
    #         model="claude-haiku-4-5",
    #         messages=[{"role": "user", "content": prompt}],
    #         max_tokens=100
    #     )
    #     keywords_str = kw_response.content[0].text
    #     keywords = [k.strip() for k in keywords_str.split(",") if k.strip()]
    # except Exception as e:
    #     logging.error(f"Error extracting keywords: {e}")
    #     keywords = []
        
    # print("Extracted Keywords:", keywords)

    # movies = search_movies_by_keywords(keywords)
    # print("Extracted Movies:")
    # for m in movies:
    #     print(m['title'] + "|" + m['url'])

    movies = get_popular_movies()
    movies += get_top_rated_movies_with_embeddings()
        
    ranked = rank_movies(profile_vec, movies)
    
    seen = set()
    unique_ranked = []
    for m in ranked:
        if m['url'] not in seen:
            seen.add(m['url'])
            unique_ranked.append(m)
            
    top = unique_ranked[:TOP_N]
    
    return {"movies": top}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
