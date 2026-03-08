"""CourtListener Source — Search legal case opinions and citations."""

import httpx


async def search_courtlistener(query: str) -> dict:
    """Search CourtListener for legal case information."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                "https://www.courtlistener.com/api/rest/v3/search/",
                params={"q": query, "type": "o", "format": "json"},
                headers={"User-Agent": "TrustLayer/1.0 Verification Engine"},
            )
            data = resp.json()
            results = data.get("results", [])

            if not results:
                return {"found": False, "source": "CourtListener"}

            content_parts = []
            for result in results[:5]:
                case_name = result.get("caseName", "")
                court = result.get("court", "")
                date_filed = result.get("dateFiled", "")
                snippet = (
                    result.get("snippet", "")
                    .replace("<mark>", "")
                    .replace("</mark>", "")
                )
                docket_number = result.get("docketNumber", "")
                citation = result.get("citation", [""])

                content_parts.append(
                    f"Case: {case_name}\n"
                    f"Court: {court}\n"
                    f"Docket: {docket_number}\n"
                    f"Citation: {citation}\n"
                    f"Date: {date_filed}\n"
                    f"Excerpt: {snippet}"
                )

            return {
                "found": True,
                "source": "CourtListener",
                "title": f"Legal cases for: {query}",
                "content": "\n\n---\n\n".join(content_parts),
                "url": f"https://www.courtlistener.com/?q={query}&type=o",
            }
        except Exception as e:
            return {"found": False, "source": "CourtListener", "error": str(e)}
