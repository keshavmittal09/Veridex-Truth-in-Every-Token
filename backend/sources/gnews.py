"""GNews Source — Search verified news articles for recent event verification."""

import os
import httpx


async def search_gnews(query: str) -> dict:
    """Search GNews API for recent verified news articles."""
    api_key = os.getenv("GNEWS_API_KEY", "")

    # GNews free tier: 100 requests/day
    if not api_key:
        return {"found": False, "source": "GNews", "error": "No GNEWS_API_KEY configured"}

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                "https://gnews.io/api/v4/search",
                params={
                    "q": query,
                    "lang": "en",
                    "max": 5,
                    "token": api_key,
                },
            )
            data = resp.json()
            articles = data.get("articles", [])

            if not articles:
                return {"found": False, "source": "GNews"}

            content_parts = []
            for article in articles:
                title = article.get("title", "")
                description = article.get("description", "")
                source_name = article.get("source", {}).get("name", "")
                published_at = article.get("publishedAt", "")
                content_text = article.get("content", "")

                entry = f"[{source_name}] {title}\n"
                if published_at:
                    entry += f"Published: {published_at}\n"
                if description:
                    entry += f"Summary: {description}\n"
                if content_text:
                    entry += f"Content: {content_text[:500]}"
                content_parts.append(entry)

            return {
                "found": True,
                "source": "GNews",
                "title": f"News results for: {query}",
                "content": "\n\n---\n\n".join(content_parts),
                "url": articles[0].get("url", ""),
            }
        except Exception as e:
            return {"found": False, "source": "GNews", "error": str(e)}
