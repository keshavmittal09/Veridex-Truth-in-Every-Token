"""Academic Source — Search CrossRef + Semantic Scholar for citation verification."""

import httpx


async def search_academic(query: str) -> dict:
    """Search CrossRef and Semantic Scholar for academic papers and citations."""
    async with httpx.AsyncClient(timeout=15) as client:
        content_parts = []
        url = ""

        # --- CrossRef ---
        try:
            crossref_resp = await client.get(
                "https://api.crossref.org/works",
                params={"query": query, "rows": 3},
                headers={"User-Agent": "TrustLayer/1.0 (verification@trustlayer.dev)"},
            )
            cr_data = crossref_resp.json()
            items = cr_data.get("message", {}).get("items", [])

            for item in items:
                title = item.get("title", [""])[0] if item.get("title") else ""
                authors = ", ".join(
                    f"{a.get('given', '')} {a.get('family', '')}"
                    for a in item.get("author", [])[:3]
                )
                doi = item.get("DOI", "")
                published = item.get("published-print", item.get("published-online", {}))
                year = (
                    published.get("date-parts", [[""]])[0][0]
                    if published and published.get("date-parts")
                    else ""
                )
                journal = item.get("container-title", [""])[0] if item.get("container-title") else ""
                citation_count = item.get("is-referenced-by-count", 0)

                content_parts.append(
                    f"[CrossRef] {title}\n"
                    f"Authors: {authors}\n"
                    f"Journal: {journal} ({year})\n"
                    f"DOI: {doi}\n"
                    f"Citations: {citation_count}"
                )
                if not url and doi:
                    url = f"https://doi.org/{doi}"
        except Exception:
            pass

        # --- Semantic Scholar ---
        try:
            ss_resp = await client.get(
                "https://api.semanticscholar.org/graph/v1/paper/search",
                params={
                    "query": query,
                    "limit": 3,
                    "fields": "title,abstract,authors,year,citationCount,url",
                },
            )
            ss_data = ss_resp.json()
            papers = ss_data.get("data", [])

            for paper in papers:
                title = paper.get("title", "")
                authors = ", ".join(
                    a.get("name", "") for a in paper.get("authors", [])[:3]
                )
                year = paper.get("year", "")
                citations = paper.get("citationCount", 0)
                abstract = paper.get("abstract", "")

                entry = (
                    f"[Semantic Scholar] {title}\n"
                    f"Authors: {authors} ({year})\n"
                    f"Citations: {citations}"
                )
                if abstract:
                    entry += f"\nAbstract: {abstract[:500]}"
                content_parts.append(entry)

                if not url and paper.get("url"):
                    url = paper["url"]
        except Exception:
            pass

        if not content_parts:
            return {"found": False, "source": "Academic"}

        return {
            "found": True,
            "source": "Academic",
            "title": f"Academic sources for: {query}",
            "content": "\n\n---\n\n".join(content_parts),
            "url": url,
        }
