import logging
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from agent.multi_agent import run_multi_agent_stream, run_story_agent_stream, run_summary_agent_stream

logger = logging.getLogger(__name__)
router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    agent_type: str = "research"

@router.post("/ask")
async def ask_agent_stream_endpoint(request: ChatRequest):
    logger.info(f"Received chat API request: {request.message[:75]}... (Mode: {request.agent_type})")
    
    if request.agent_type == "story":
        generator = run_story_agent_stream(request.message)
    elif request.agent_type == "summary":
        generator = run_summary_agent_stream(request.message)
    else:
        generator = run_multi_agent_stream(request.message)
        
    return StreamingResponse(generator, media_type="text/event-stream")
