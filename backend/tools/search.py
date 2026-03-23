import urllib.request
import urllib.parse
import ssl
import re

def web_search_tool(query: str) -> str:
    """Search the web resiliently using standard library urllib."""
    try:
        url = "https://html.duckduckgo.com/html/"
        data = urllib.parse.urlencode({"q": query}).encode("utf-8")
        req = urllib.request.Request(
            url, 
            data=data, 
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0"}
        )
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=10.0, context=ctx) as response:
            html = response.read().decode("utf-8")
            
            # Extract snippets via Regex
            snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL)
            
            # Clean HTML tags
            clean_snippets = [re.sub(r'<[^>]+>', '', s).strip() for s in snippets[:3]]
            
            return "\n\n===\n\n".join(clean_snippets) if clean_snippets else "No results found."
            
    except Exception as e:
        return f"Search error: {str(e)}"
