"""PubMed Source — Search medical/scientific literature via NCBI E-Utilities API."""

import httpx


async def search_pubmed(query: str) -> dict:
    """Search PubMed for medical literature relevant to a claim."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            # Step 1: Search for article IDs
            search_resp = await client.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
                params={
                    "db": "pubmed",
                    "term": query,
                    "retmax": 3,
                    "retmode": "json",
                    "sort": "relevance",
                },
            )
            search_data = search_resp.json()
            ids = search_data.get("esearchresult", {}).get("idlist", [])

            if not ids:
                return {"found": False, "source": "PubMed"}

            # Step 2: Fetch article summaries
            summary_resp = await client.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
                params={
                    "db": "pubmed",
                    "id": ",".join(ids[:3]),
                    "retmode": "json",
                },
            )
            summary_data = summary_resp.json()
            articles = summary_data.get("result", {})

            content_parts = []
            for pmid in ids[:3]:
                article = articles.get(pmid, {})
                if isinstance(article, dict) and "title" in article:
                    title = article.get("title", "")
                    journal = article.get("source", "")
                    pubdate = article.get("pubdate", "")
                    authors = ", ".join(
                        a.get("name", "") for a in article.get("authors", [])[:3]
                    )
                    content_parts.append(
                        f"Title: {title}\n"
                        f"Authors: {authors}\n"
                        f"Journal: {journal} ({pubdate})"
                    )

            # Step 3: Fetch abstract for the top result
            abstract_resp = await client.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
                params={
                    "db": "pubmed",
                    "id": ids[0],
                    "retmode": "text",
                    "rettype": "abstract",
                },
            )
            abstract = abstract_resp.text.strip()

            content = "\n\n".join(content_parts)
            if abstract:
                content += f"\n\nAbstract:\n{abstract[:2000]}"

            return {
                "found": True,
                "source": "PubMed",
                "title": f"PubMed results for: {query}",
                "content": content,
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{ids[0]}/",
            }
        except Exception as e:
            return {"found": False, "source": "PubMed", "error": str(e)}
