import os
from fastapi import FastAPI, Depends, HTTPException, WebSocket, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List

from dotenv import load_dotenv
load_dotenv()

from auth.database import engine, Base
from auth import auth, models
from websocket_server import sign_websocket_endpoint

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SignBridge API",
    description="Backend for Real-Time Sign Language Recognition in Google Meet",
    version="1.0.0"
)

# Allow CORS for the Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "chrome-extension://*", # Match any chrome extension
        "https://meet.google.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Authentication Routes
app.include_router(auth.router)

# Mount WebSocket Endpoint
app.add_api_websocket_route("/ws/sign-recognition", sign_websocket_endpoint)

# Meeting Summarization Schemas
class TranscriptEntry(BaseModel):
    timestamp: str
    speaker: str
    text: str

class SummarizeRequest(BaseModel):
    meeting_id: str
    duration_seconds: int
    transcript: List[TranscriptEntry]

# Routes
@app.get("/")
def read_root():
    return {"status": "SignBridge Backend is running"}

@app.post("/api/meeting/summarize")
async def summarize_meeting(request: SummarizeRequest, current_user: models.User = Depends(auth.get_current_user)):
    # We will import the actual summarizer here to avoid circular imports / missing deps during init
    try:
        from llm.summarizer import generate_meeting_summary
        from pdf_generator.summary_pdf import generate_pdf
        
        # 1. Ask Gemini to summarize
        summary_data = await generate_meeting_summary(request.transcript)
        
        # 2. Append meeting metadata
        summary_data["meeting_id"] = request.meeting_id
        summary_data["duration"] = request.duration_seconds
        summary_data["date"] = request.transcript[0].timestamp if request.transcript else "Unknown"
        
        # 3. Generate PDF file
        pdf_path = f"tmp_pdfs/{request.meeting_id}.pdf"
        os.makedirs("tmp_pdfs", exist_ok=True)
        generate_pdf(summary_data, pdf_path)
        
        return {
            "status": "success", 
            "meeting_id": request.meeting_id,
            "message": "Summary and PDF generated successfully"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Summarization failed: {str(e)}")

@app.get("/api/meeting/pdf/{meeting_id}")
async def get_meeting_pdf(meeting_id: str):
    pdf_path = f"tmp_pdfs/{meeting_id}.pdf"
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF not found")
        
    return FileResponse(
        path=pdf_path, 
        filename=f"SignBridge_Summary_{meeting_id}.pdf", 
        media_type="application/pdf"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
