import os
import httpx

async def search_serper(query: str) -> dict:
    """Search using Google Serper API for real Google results."""
    api_key = os.getenv("SERPER_API_KEY", "")
    if not api_key:
        return {"found": False, "source": "Google Serper", "error": "No SERPER_API_KEY configured"}

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
                json={"q": query, "num": 5},
            )
            data = resp.json()

            snippets = []
            sources_list = []

            # Knowledge graph
            kg = data.get("knowledgeGraph", {})
            if kg:
                kg_text = f"{kg.get('title', '')}: {kg.get('description', '')}"
                for attr_key, attr_val in kg.get("attributes", {}).items():
                    kg_text += f"\n{attr_key}: {attr_val}"
                snippets.append(kg_text)

            # Answer box
            answer_box = data.get("answerBox", {})
            if answer_box:
                snippets.append(answer_box.get("answer", answer_box.get("snippet", "")))

            # Organic results
            for result in data.get("organic", [])[:5]:
                snippet = result.get("snippet", "")
                title = result.get("title", "")
                link = result.get("link", "")
                if snippet:
                    snippets.append(f"{title}: {snippet}")
                    sources_list.append({"title": title, "url": link, "snippet": snippet})

            if not snippets:
                return {"found": False, "source": "Google Serper"}

            return {
                "found": True,
                "source": "Google Serper",
                "title": f"Google results for: {query}",
                "content": "\n\n".join(snippets),
                "url": sources_list[0]["url"] if sources_list else "",
                "detailedSources": sources_list,
            }
        except Exception as e:
            return {"found": False, "source": "Google Serper", "error": str(e)}
