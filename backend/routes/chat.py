import logging
from fastapi import APIRouter
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from agent.multi_agent import run_multi_agent_stream

logger = logging.getLogger(__name__)
router = APIRouter()

class ChatRequest(BaseModel):
    message: str

@router.post("/ask")
async def ask_agent_stream_endpoint(request: ChatRequest):
    logger.info(f"Received chat API request: {request.message[:75]}...")
    return StreamingResponse(run_multi_agent_stream(request.message), media_type="text/event-stream")
