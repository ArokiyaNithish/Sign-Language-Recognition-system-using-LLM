# ════════════════════════════════════════════
# SignBridge — llm/gemini_client.py
# Google Gemini API integration
# Signs → sentences, meeting summarizer,
# context-aware prediction
# ════════════════════════════════════════════

import os
import asyncio
from typing import Optional

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

_API_KEY = os.getenv("GEMINI_API_KEY", "")
if _API_KEY:
    genai.configure(api_key=_API_KEY)
else:
    print("[SignBridge Gemini] WARNING: GEMINI_API_KEY not set.")

_model = genai.GenerativeModel("gemini-1.5-pro") if _API_KEY else None


async def _generate(prompt: str, max_tokens: int = 512) -> str:
    """
    Non-blocking Gemini API call wrapped in asyncio executor.
    """
    if _model is None:
        return "[Gemini not configured]"

    loop = asyncio.get_event_loop()
    try:
        response = await loop.run_in_executor(
            None,
            lambda: _model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=max_tokens,
                    temperature=0.4,
                    top_p=0.9
                )
            )
        )
        return response.text.strip()
    except Exception as e:
        print(f"[SignBridge Gemini] API error: {e}")
        return ""


# ── 1. Signs → Natural Language ───────────────
async def signs_to_sentence(sign_sequence: list[str], context: str = "") -> str:
    """
    Convert a sequence of detected signs/letters into a fluent English sentence.

    Args:
        sign_sequence: List of detected signs, e.g. ['H','E','L','L','O']
        context:       Recent conversation context to help disambiguation

    Returns:
        Natural English sentence
    """
    if not sign_sequence:
        return ""

    joined = " ".join(sign_sequence)
    ctx_part = f"\nConversation context:\n{context}\n" if context else ""

    prompt = f"""You are an expert ASL interpreter AI assistant.
{ctx_part}
Convert this sequence of detected ASL signs/letters into a natural, fluent English sentence.
Sign sequence: {joined}

Rules:
- If the signs spell out letters, form the most likely word(s) they represent
- Use conversation context to resolve ambiguities
- Return ONLY the natural English sentence, no explanations
- Preserve the likely intent of the signer
- If signs represent a common phrase (e.g. HELLO, THANK YOU), use the full phrase

Natural English:"""

    result = await _generate(prompt, max_tokens=150)
    return result or " ".join(sign_sequence)


# ── 2. Meeting Summarizer ─────────────────────
async def summarize_meeting(transcript: list[dict], duration_seconds: int, meeting_id: str) -> dict:
    """
    Generate a structured meeting summary from a transcript.

    Returns:
        {
          summary:              str,
          key_points:           list[str],
          action_items:         list[str],
          sign_contributions:   list[str],
          duration_formatted:   str
        }
    """
    if not transcript:
        return {
            "summary": "No transcript available.",
            "key_points": [],
            "action_items": [],
            "sign_contributions": [],
            "duration_formatted": _fmt_duration(duration_seconds)
        }

    # Build transcript text
    lines = []
    for entry in transcript:
        speaker = "Sign Language User" if entry.get("speaker") == "sign_user" else "Voice Participant"
        ts      = entry.get("elapsed", 0)
        mins    = ts // 60
        secs    = ts % 60
        lines.append(f"[{mins:02d}:{secs:02d}] {speaker}: {entry.get('text', '')}")

    full_transcript = "\n".join(lines)
    duration_str    = _fmt_duration(duration_seconds)

    prompt = f"""You are an AI meeting analyst. Analyze this Google Meet meeting transcript and provide a structured summary.

Meeting Duration: {duration_str}
Meeting ID: {meeting_id}

TRANSCRIPT:
{full_transcript}

Provide a JSON response ONLY with this exact structure:
{{
  "summary": "2-3 paragraph summary of the entire meeting",
  "key_points": ["point 1", "point 2", "point 3", ...],
  "action_items": ["action 1", "action 2", ...],
  "sign_contributions": ["key contribution from sign language user 1", ...]
}}

Return ONLY valid JSON, no other text."""

    raw = await _generate(prompt, max_tokens=1500)

    import json
    try:
        # Strip markdown code blocks if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()

        data = json.loads(cleaned)
        data["duration_formatted"] = duration_str
        return data
    except (json.JSONDecodeError, ValueError) as e:
        print(f"[SignBridge Gemini] JSON parse error: {e}")
        return {
            "summary": raw or "Summary generation failed.",
            "key_points": [],
            "action_items": [],
            "sign_contributions": [],
            "duration_formatted": duration_str
        }


# ── 3. Context-Aware Sign Prediction ──────────
async def predict_next_sign_context(recent_signs: list[str], context: str) -> str:
    """
    Use conversation context to correct or complete ambiguous signs.
    Few-shot: guide the model to correct likely mis-detections.
    """
    if not recent_signs:
        return ""

    prompt = f"""You are an ASL assistant. Given recent detected signs and conversation context,
predict the most likely intended word or phrase.

Conversation context: {context}
Recent detected signs: {' '.join(recent_signs[-8:])}

Examples:
- Signs: H E L O → "Hello"
- Signs: T H A N K Y O U → "Thank you"
- Signs: H O W R U → "How are you"

Most likely intended phrase (respond with only the phrase):"""

    return await _generate(prompt, max_tokens=50)


# ── Utility ───────────────────────────────────
def _fmt_duration(seconds: int) -> str:
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h}h {m}m {s}s"
    return f"{m}m {s}s"
