import httpx
import re

def web_search_tool(query: str) -> str:
    """Search Wikipedia as a proxy for web search"""
    try:
        url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&utf8=&format=json"
        with httpx.Client() as client:
            response = client.get(url, timeout=5.0)
            data = response.json()
            snippets = [item['snippet'] for item in data['query']['search'][:3]]
            clean_snippets = [re.sub('<[^<]+>', '', s) for s in snippets]
            return "\n".join(clean_snippets) if clean_snippets else "No results found."
    except Exception as e:
        return f"Search error: {str(e)}"
