import json
import os
import logging
from dotenv import load_dotenv
from openai import AsyncOpenAI
from tools.search import web_search_tool
from tools.calculator import calculator_tool
from tools.reader import file_reader_tool
from memory.rag import search_documents

logger = logging.getLogger(__name__)

load_dotenv()
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Define tools schema for OpenAI
tools_schema = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for current information",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query"}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "Evaluate a mathematical expression",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "The mathematical expression to evaluate (e.g. '2 + 2')"}
                },
                "required": ["expression"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "file_reader",
            "description": "Read content from a local file",
            "parameters": {
                "type": "object",
                "properties": {
                    "filepath": {"type": "string", "description": "The path to the file to read"}
                },
                "required": ["filepath"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_documents",
            "description": "CRITICAL TOOL: Use this to retrieve or read the text of an uploaded document, file, or PDF. You MUST call this if the user asks you to summarize, read, or get info from an uploaded file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The semantic search query. To get the whole document for a summary, pass 'comprehensive summary' here."}
                },
                "required": ["query"],
            },
        },
    }
]

# Map names to actual python functions
available_tools = {
    "web_search": web_search_tool,
    "calculator": calculator_tool,
    "file_reader": file_reader_tool,
    "search_documents": search_documents,
}

SYSTEM_PROMPT = """
You are a helpful AI assistant with access to tools. 
When asked a question, you should decide whether you can answer it directly or if you need to use a tool to gather more information.
- If you need current information, use the web_search tool.
- If you need to do math, use the calculator tool.
- If you need to read a file by exact file path, use the file_reader tool.
- If the user asks about an uploaded document, PDF, or wants a summary of the upload, ALWAYS use the search_documents tool with a relevant semantic query.
Answer clearly and concisely.
"""

async def run_agent(user_message: str) -> str:
    import datetime
    today_str = datetime.date.today().isoformat()
    
    logger.info("Researcher starting Tool Execution loop.")
    messages = [
        {"role": "system", "content": f"{SYSTEM_PROMPT.strip()}\n\nCURRENT DATE: {today_str}"},
        {"role": "user", "content": user_message}
    ]

    try:
        # Step 1: Send the conversation and available functions to the model
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=tools_schema,
            tool_choice="auto",
        )
        response_message = response.choices[0].message
        tool_calls = response_message.tool_calls

        # Step 2: Check if the model wanted to call a function
        if tool_calls:
            logger.info(f"Researcher identified {len(tool_calls)} tool call(s) to make.")
            messages.append(response_message)  # Extend conversation with assistant's reply
            
            # Step 3: Call the function
            for tool_call in tool_calls:
                function_name = tool_call.function.name
                function_to_call = available_tools.get(function_name)
                if not function_to_call:
                    logger.warning(f"Model requested unknown tool: {function_name}")
                    continue
                
                function_args = json.loads(tool_call.function.arguments)
                logger.info(f"Executing tool: {function_name} with args {function_args}")
                
                if function_name == "web_search":
                    function_response = function_to_call(query=function_args.get("query"))
                elif function_name == "calculator":
                    function_response = function_to_call(expression=function_args.get("expression"))
                elif function_name == "file_reader":
                    function_response = function_to_call(filepath=function_args.get("filepath"))
                elif function_name == "search_documents":
                    function_response = function_to_call(query=function_args.get("query"))
                else:
                    function_response = "Unknown function"
                
                # Step 4: Send the info for each function call and function response to the model
                messages.append(
                    {
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": str(function_response),
                    }
                )
            
            # Second API call to formulate the final answer
            logger.info("Compiling final output string from tool contents.")
            second_response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
            )
            return second_response.choices[0].message.content
        else:
            logger.info("No tools required. Returned context directly.")
            return response_message.content

    except Exception as e:
        logger.exception("Error in researcher tool loop:")
        return f"Error running agent: {str(e)}"
