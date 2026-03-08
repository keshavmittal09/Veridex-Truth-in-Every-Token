import httpx

async def search_web(query: str) -> dict:
    """Search using DuckDuckGo Instant Answer API."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_html": 1, "skip_disambig": 1},
            )
            data = resp.json()

            abstract = data.get("AbstractText", "")
            answer = data.get("Answer", "")
            related = data.get("RelatedTopics", [])

            snippets = []
            if abstract:
                snippets.append(abstract)
            if answer:
                snippets.append(answer)
            for topic in related[:5]:
                if isinstance(topic, dict) and "Text" in topic:
                    snippets.append(topic["Text"])

            if not snippets:
                return {"found": False, "source": "DuckDuckGo"}

            return {
                "found": True,
                "source": "DuckDuckGo",
                "title": data.get("Heading", query),
                "content": "\n\n".join(snippets),
                "url": data.get("AbstractURL", ""),
            }
        except Exception as e:
            return {"found": False, "source": "DuckDuckGo", "error": str(e)}
