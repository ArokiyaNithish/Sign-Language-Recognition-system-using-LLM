import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# We need the user's API Key from the .env
GEMINI_API_KEY = os.getenv("AIzaSyCbr7PSOn7gy6jK0n7SQy6b7Bj29xzWLFs")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    print("[GeminiClient] Warning: GEMINI_API_KEY not found in .env")

# Initialize models
# gemini-1.5-pro is excellent for reasoning tasks like ASL translation formatting
model = genai.GenerativeModel('gemini-1.5-pro')

async def signs_to_sentence(sign_sequence: list[str]) -> str:
    """
    Converts a sequence of detected signs/letters into a natural English sentence.
    """
    if not sign_sequence:
        return ""
        
    prompt = f"""You are an ASL interpreter AI. Convert this sequence of detected signs/letters 
    into natural, fluent English. 
    
    Signs detected: {' '.join(sign_sequence)}
    
    Return ONLY the natural English sentence, nothing else. Fix any obvious typos caused by machine vision errors."""
    
    try:
        response = model.generate_content(prompt)
        return response.text.replace('\n', ' ').strip()
    except Exception as e:
        print(f"[GeminiClient] Error calling Gemini: {e}")
        return " ".join(sign_sequence)

async def predict_next_sign_context(recent_signs: list, context_topic: str = "general") -> str:
    """
    Context-aware sign prediction to handle ambiguous signs.
    """
    prompt = f"""Given the context topic "{context_topic}" and the recent signs: {', '.join(recent_signs)},
    predict the most likely intended word. Return ONLY that word."""
    
    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except:
        return ""
