import httpx

async def search_wikipedia(query: str) -> dict:
    """Search Wikipedia and return article summary + extract."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            search_resp = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": query,
                    "srlimit": 3,
                    "format": "json",
                },
            )
            search_data = search_resp.json()
            results = search_data.get("query", {}).get("search", [])
            if not results:
                return {"found": False, "source": "Wikipedia"}

            title = results[0]["title"]

            content_resp = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "titles": title,
                    "prop": "extracts",
                    "exintro": False,
                    "explaintext": True,
                    "exsectionformat": "plain",
                    "format": "json",
                },
            )
            pages = content_resp.json().get("query", {}).get("pages", {})
            page = next(iter(pages.values()), {})
            extract = page.get("extract", "")

            return {
                "found": True,
                "source": "Wikipedia",
                "title": title,
                "content": extract[:4000],
                "url": f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
            }
        except Exception as e:
            return {"found": False, "source": "Wikipedia", "error": str(e)}
