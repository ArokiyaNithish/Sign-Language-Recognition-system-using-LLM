# ════════════════════════════════════════════
# SignBridge — FastAPI Main Application
# Routes: auth, meeting, health
# WebSocket: sign recognition
# ════════════════════════════════════════════

import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv

from auth.auth import router as auth_router, get_current_user
from auth.database import engine, Base
from websocket_server import router as ws_router

load_dotenv()

# ── App Init ─────────────────────────────────
app = FastAPI(
    title="SignBridge API",
    description="Real-time sign language recognition backend for Google Meet.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# ── CORS ─────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "chrome-extension://*",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Create Tables ─────────────────────────────
@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)
    print("[SignBridge Backend] Database tables ensured.")
    print("[SignBridge Backend] Server starting up — http://localhost:8000")

# ── Include Routers ───────────────────────────
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(ws_router,   tags=["WebSocket"])

# ── Pydantic Models ───────────────────────────
class TranscriptEntry(BaseModel):
    timestamp:  str
    elapsed:    int
    speaker:    str  # "sign_user" | "voice_user"
    text:       str

class SummarizeRequest(BaseModel):
    meeting_id:       str
    transcript:       list[TranscriptEntry]
    duration_seconds: int

# ── Health Endpoint ───────────────────────────
@app.get("/api/health", tags=["Health"])
async def health_check():
    return {
        "status": "ok",
        "service": "SignBridge API",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }

# ── Meeting: Summarize ────────────────────────
@app.post("/api/meeting/summarize", tags=["Meeting"])
async def summarize_meeting(
    req: SummarizeRequest,
    current_user=Depends(get_current_user)
):
    """
    Receives a meeting transcript and returns an AI-generated summary.
    Also generates a PDF and stores it for download.
    """
    try:
        transcript_dicts = [e.dict() for e in req.transcript]

        # Lazy import LLM/PDF modules (optional dependencies)
        try:
            from llm.summarizer import summarize_transcript
            summary_data = await summarize_transcript(
                transcript=transcript_dicts,
                duration_seconds=req.duration_seconds,
                meeting_id=req.meeting_id
            )
        except ImportError:
            summary_data = {
                "summary": f"AI summary unavailable (google-generativeai not installed). Transcript had {len(transcript_dicts)} entries.",
                "key_points": [], "action_items": [], "sign_contributions": []
            }

        # Lazy import PDF generator
        pdf_path = None
        try:
            from pdf_generator.summary_pdf import generate_meeting_pdf
            pdf_path = await generate_meeting_pdf(
                meeting_id=req.meeting_id,
                summary=summary_data,
                transcript=transcript_dicts,
                duration_seconds=req.duration_seconds,
                user_name=current_user.full_name
            )
        except ImportError:
            pass  # PDF generation optional

        return {
            "meeting_id": req.meeting_id,
            "summary":    summary_data.get("summary", ""),
            "key_points": summary_data.get("key_points", []),
            "action_items": summary_data.get("action_items", []),
            "sign_contributions": summary_data.get("sign_contributions", []),
            "pdf_ready":  pdf_path is not None
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Summarization failed: {str(e)}"
        )

# ── Meeting: Download PDF ─────────────────────
@app.get("/api/meeting/pdf/{meeting_id}", tags=["Meeting"])
async def download_pdf(
    meeting_id: str,
    current_user=Depends(get_current_user)
):
    """
    Streams the generated PDF for a given meeting ID.
    """
    pdf_dir  = os.getenv("PDF_OUTPUT_DIR", "./pdfs")
    pdf_path = os.path.join(pdf_dir, f"{meeting_id}.pdf")

    if not os.path.exists(pdf_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not found. Ensure meeting has been summarized first."
        )

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"signbridge_{meeting_id}.pdf"
    )

# ── Root Redirect ─────────────────────────────
@app.get("/", include_in_schema=False)
async def root():
    return {"message": "SignBridge API is running. Visit /docs for API documentation."}

# ── Run ───────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
