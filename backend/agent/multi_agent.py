import os
import json
import logging
from dotenv import load_dotenv
from openai import AsyncOpenAI
from .agent import run_agent as researcher_agent

logger = logging.getLogger(__name__)

load_dotenv()
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

import datetime

async def planner_agent(user_message: str) -> dict:
    today_str = datetime.date.today().isoformat()
    logger.info("Planner Agent starting interpretation.")
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={ "type": "json_object" },
        messages=[
            {"role": "system", "content": f"""You are an Orchestrator Agent for Orbit.
Break down the user's request into a series of tasks to be executed by specialized sub-agents.
You have access to a backend tool-equipped researcher capable of Web Search, Document Reading, and Math.
CRITICAL: You must return a JSON object with this exact structure:
{{
  "agents": [
    {{
      "name": "Specific Agent Name (e.g. Job Web Scraper)",
      "instruction": "Detailed instruction for this agent"
    }}
  ]
}}
RULES:
1. ALWAYS create at least 1 agent, maximum of 5 agents.
2. If the user asks about uploaded files or PDFs, YOU MUST explicitly instruct the agent to use Document Search.
3. Be dynamic with agent names based on the query.
4. IMPORTANT: Today's date is {today_str}."""},
            {"role": "user", "content": user_message}
        ]
    )
    content = response.choices[0].message.content
    try:
        return json.loads(content)
    except Exception as e:
        logger.error(f"Failed to parse planner JSON: {e}")
        return {"agents": [{"name": "Fallback Researcher", "instruction": "Research: " + user_message}]}


async def executor_agent_stream(user_message: str, plan: dict, combined_research: str):
    logger.info("Executor Agent formulating final response.")
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are the Main Orbit Executor Agent. Synthesize the provided research from your sub-agents to directly answer the user's request. Format your output nicely using markdown."},
            {"role": "user", "content": f"User Request: {user_message}\n\nSub-Agents Plan:\n{json.dumps(plan)}\n\nCombined Research:\n{combined_research}"}
        ],
        stream=True
    )
    async for chunk in response:
        if chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


async def run_multi_agent_stream(user_message: str):
    """Chain Planner -> 1..N Researchers -> Executor (Streaming JSON events)"""
    logger.info(f"Initiating Dynamic Multi-Agent Pipeline for: {user_message[:50]}...")
    try:
        # 1. Plan
        plan_dict = await planner_agent(user_message)
        agents = plan_dict.get("agents", [])
        if not agents:
            agents = [{"name": "Default Researcher", "instruction": user_message}]
            
        logger.info(f"Planner generated {len(agents)} sub-agents.")
        
        # Stream the plan to UI so it can render the agent slots with instructions
        yield f"data: {json.dumps({'type': 'plan', 'agents': agents})}\n\n"
        
        # 2. Research Phase
        combined_research = ""
        for i, agent in enumerate(agents):
            agent_name = agent["name"]
            instruction = agent["instruction"]
            
            # Notify UI that this agent started
            logger.info(f"Triggering sub-agent: {agent_name}")
            yield f"data: {json.dumps({'type': 'agent_start', 'name': agent_name})}\n\n"
            
            research_prompt = f"CRITICAL DIRECTIVE: You are '{agent_name}'. Execute this task: {instruction}\nIf the task involves reading or summarizing an uploaded document, you MUST invoke the `search_documents` tool.\nOriginal User Request: {user_message}"
            
            research_result = await researcher_agent(research_prompt)
            
            logger.info(f"Sub-agent '{agent_name}' finished.")
            combined_research += f"--- Result from {agent_name} ---\n{research_result}\n\n"
            
            # Notify UI that this agent finished, with its result
            yield f"data: {json.dumps({'type': 'agent_result', 'name': agent_name, 'content': research_result})}\n\n"

        # 3. Execute final summary
        logger.info("Triggering Main Executor Agent Stream.")
        yield f"data: {json.dumps({'type': 'main_start'})}\n\n"
        
        async for chunk in executor_agent_stream(user_message, plan_dict, combined_research):
            # Stream the main agent's response chunk by chunk
            yield f"data: {json.dumps({'type': 'main_chunk', 'content': chunk})}\n\n"
            
        # 4. Done
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        logger.info("Multi-Agent pipeline completed successfully.")
            
    except Exception as e:
        logger.exception("Multi-Agent Pipeline Failed")
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

async def run_story_agent_stream(user_message: str):
    logger.info(f"Initiating Story Agent for: {user_message[:50]}...")
    yield f"data: {json.dumps({'type': 'main_start'})}\n\n"
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a creative and funny Story Teller Agent. Write a highly entertaining, completely original short story based on the user's input."},
                {"role": "user", "content": user_message}
            ],
            stream=True
        )
        async for chunk in response:
            if chunk.choices[0].delta.content:
                yield f"data: {json.dumps({'type': 'main_chunk', 'content': chunk.choices[0].delta.content})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    except Exception as e:
        logger.exception("Story Agent Failed")
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

async def run_summary_agent_stream(user_message: str):
    logger.info(f"Initiating Summary Agent for: {user_message[:50]}...")
    yield f"data: {json.dumps({'type': 'main_start'})}\n\n"
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert Summarizer Agent. Provide a concise, clear, and well-structured summary of the text provided by the user."},
                {"role": "user", "content": user_message}
            ],
            stream=True
        )
        async for chunk in response:
            if chunk.choices[0].delta.content:
                yield f"data: {json.dumps({'type': 'main_chunk', 'content': chunk.choices[0].delta.content})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    except Exception as e:
        logger.exception("Summary Agent Failed")
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
