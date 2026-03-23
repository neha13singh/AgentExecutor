import os

def file_reader_tool(filepath: str) -> str:
    """Read content of a local file"""
    try:
        if not os.path.exists(filepath):
            return "File does not exist."
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            return content[:2000] # Return up to 2000 chars to avoid token limits
    except Exception as e:
        return f"Error reading file: {str(e)}"
