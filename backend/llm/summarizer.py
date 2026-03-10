# ════════════════════════════════════════════
# SignBridge — llm/summarizer.py
# Bridge between websocket_server and gemini_client
# ════════════════════════════════════════════

from llm.gemini_client import summarize_meeting


async def summarize_transcript(
    transcript: list[dict],
    duration_seconds: int,
    meeting_id: str
) -> dict:
    """
    Public entry-point called by main.py's summarize endpoint.
    Delegates to gemini_client.summarize_meeting.
    """
    return await summarize_meeting(
        transcript=transcript,
        duration_seconds=duration_seconds,
        meeting_id=meeting_id
    )
