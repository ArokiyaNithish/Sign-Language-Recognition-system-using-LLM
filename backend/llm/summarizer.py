from typing import List, Dict
from llm.gemini_client import model
import json

async def generate_meeting_summary(transcript: List[Dict]) -> dict:
    """
    Takes a list of transcript objects: {timestamp, speaker, text}
    and returns a structured dict summarizing the meeting.
    """
    if not transcript:
        return {
            "summary": "No meeting transcript available.",
            "key_points": [],
            "action_items": [],
            "sign_user_contributions": [],
        }

    # 1. Format transcript
    formatted_transcript = ""
    for entry in transcript:
        # Assuming entries have 'speaker' and 'text'. If it's a Pydantic model it behaves a bit differently,
        # so we handle both dict and object access.
        speaker = entry.get('speaker', 'Unknown') if isinstance(entry, dict) else entry.speaker
        text = entry.get('text', '') if isinstance(entry, dict) else entry.text
        
        speaker_display = "Sign User" if speaker == "sign_user" else "Voice User"
        formatted_transcript += f"[{speaker_display}]: {text}\n"

    # 2. Build prompt
    prompt = f"""You are an executive assistant analyzing a Google Meet transcript involving both spoken English 
and translated Sign Language.

Please analyze the following transcript and provide a structured JSON response with exactly these keys:
- "summary": A well-written 2-3 paragraph summary of the entire meeting.
- "key_points": A list of 3-5 main discussion points (strings).
- "action_items": A list of actionable tasks agreed upon, or [] if none (strings).
- "sign_user_contributions": A paragraph summarizing what the Sign User contributed to the conversation.

Transcript:
{formatted_transcript}

Return ONLY valid JSON. Do not use markdown blocks like ```json.
"""

    # 3. Call Gemini
    try:
        response = model.generate_content(prompt)
        text_response = response.text.strip()
        
        # Clean up if Gemini accidentally includes markdown code blocks
        if text_response.startswith('```json'):
            text_response = text_response[7:]
        if text_response.startswith('```'):
            text_response = text_response[3:]
        if text_response.endswith('```'):
            text_response = text_response[:-3]
            
        parsed_data = json.loads(text_response.strip())
        return parsed_data
        
    except json.JSONDecodeError as e:
        print(f"[Summarizer] Failed to parse Gemini response as JSON: {e}\nRaw: {response.text}")
        # Fallback dictionary
        return {
            "summary": "Error parsing the LLM summary response.",
            "key_points": ["Error accessing points"],
            "action_items": [],
            "sign_user_contributions": "Error accessing contributions"
        }
    except Exception as e:
        print(f"[Summarizer] Error calling Gemini: {e}")
        return {
            "summary": "AI Summarization service currently unavailable.",
            "key_points": [],
            "action_items": [],
            "sign_user_contributions": ""
        }
