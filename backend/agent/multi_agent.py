import os
import logging
from dotenv import load_dotenv
from openai import AsyncOpenAI
from .agent import run_agent as researcher_agent

logger = logging.getLogger(__name__)
load_dotenv()
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

async def planner_agent(user_message: str) -> str:
    logger.info("Planner Agent starting interpretation.")
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a Planner Agent for Orbit. Break down the user's request into a 1-3 step concise plan. IMPORTANT: You have access to a backend Researcher with tools (Web Search, File Reader, Math, Document RAG Search). If the user asks about uploaded files or PDFs, you MUST instruct the researcher to execute a Document Search. Never claim you cannot read documents."},
            {"role": "user", "content": user_message}
        ]
    )
    return response.choices[0].message.content

async def executor_agent_stream(user_message: str, plan: str, research: str):
    logger.info("Executor Agent formulating final response.")
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an Executor Agent. Answer the user's request based on the provided plan and research/context. Be direct and helpful. Format your output nicely."},
            {"role": "user", "content": f"User Request: {user_message}\n\nPlan:\n{plan}\n\nResearch/Context:\n{research}"}
        ],
        stream=True
    )
    async for chunk in response:
        if chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content

async def run_multi_agent_stream(user_message: str):
    """Chain Planner -> Researcher -> Executor (Streaming)"""
    logger.info(f"Initiating Multi-Agent Pipeline for: {user_message[:50]}...")
    try:
        # 1. Plan
        plan = await planner_agent(user_message)
        logger.info("Planner generated plan successfully.")
        yield "🧠 **Planning completed:**\n" + plan + "\n\n"
        
        # 2. Research
        logger.info("Triggering Researcher Agent with tools.")
        research_prompt = f"CRITICAL DIRECTIVE: Execute this plan: {plan}\nIf the task involves reading or summarizing an uploaded document, you MUST invoke the `search_documents` tool to extract the text.\nOriginal request: {user_message}"
        research = await researcher_agent(research_prompt)
        logger.info("Researcher returned context data.")
        yield "🔍 **Research completed.**\n\n"
        
        # 3. Execute
        logger.info("Triggering Executor Agent Stream.")
        yield "⚙️ **Executing final response:**\n"
        async for chunk in executor_agent_stream(user_message, plan, research):
            yield chunk
            
        logger.info("Multi-Agent pipeline completed successfully.")
            
    except Exception as e:
        logger.exception("Multi-Agent Pipeline Failed")
        yield f"\n\nMulti-Agent Error: {str(e)}"
