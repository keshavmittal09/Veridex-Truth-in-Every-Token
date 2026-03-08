"""SEC EDGAR Source — Search financial filings and company data from the SEC."""

import httpx


async def search_sec_edgar(query: str) -> dict:
    """Search SEC EDGAR for financial filings relevant to a claim."""
    headers = {
        "User-Agent": "TrustLayer verification@trustlayer.dev",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=15, headers=headers) as client:
        try:
            resp = await client.get(
                "https://efts.sec.gov/LATEST/search-index",
                params={
                    "q": query,
                    "dateRange": "custom",
                    "startdt": "2020-01-01",
                    "forms": "10-K,10-Q,8-K",
                },
            )
            data = resp.json()
            hits = data.get("hits", {}).get("hits", [])

            if not hits:
                return {"found": False, "source": "SEC EDGAR"}

            content_parts = []
            for hit in hits[:5]:
                source = hit.get("_source", {})
                entity_name = source.get("entity_name", "")
                file_date = source.get("file_date", "")
                form_type = source.get("form_type", "")
                file_description = source.get("file_description", "")
                file_num = source.get("file_num", "")

                content_parts.append(
                    f"Entity: {entity_name}\n"
                    f"Filing: {form_type}\n"
                    f"Date: {file_date}\n"
                    f"File #: {file_num}\n"
                    f"Description: {file_description}"
                )

            return {
                "found": True,
                "source": "SEC EDGAR",
                "title": f"SEC filings for: {query}",
                "content": "\n\n---\n\n".join(content_parts),
                "url": f"https://www.sec.gov/cgi-bin/browse-edgar?company={query}&CIK=&type=10-K&action=getcompany",
            }
        except Exception as e:
            return {"found": False, "source": "SEC EDGAR", "error": str(e)}
