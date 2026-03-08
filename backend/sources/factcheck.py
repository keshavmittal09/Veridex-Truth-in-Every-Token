import os
import httpx

async def search_factcheck(query: str) -> dict:
    """Search Google Fact Check Tools API."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            params = {"query": query, "languageCode": "en"}
            api_key = os.getenv("GOOGLE_FACTCHECK_API_KEY", "")
            if api_key:
                params["key"] = api_key
            resp = await client.get(
                "https://factchecktools.googleapis.com/v1alpha1/claims:search",
                params=params,
            )
            data = resp.json()
            claims = data.get("claims", [])

            if not claims:
                return {"found": False, "source": "Google Fact Check"}

            results = []
            for claim in claims[:5]:
                claim_text = claim.get("text", "")
                claimant = claim.get("claimant", "Unknown")
                reviews = claim.get("claimReview", [])

                for review in reviews:
                    results.append({
                        "claim": claim_text,
                        "claimant": claimant,
                        "rating": review.get("textualRating", ""),
                        "publisher": review.get("publisher", {}).get("name", ""),
                        "url": review.get("url", ""),
                        "title": review.get("title", ""),
                    })

            content_parts = []
            for r in results:
                content_parts.append(
                    f"Claim: \"{r['claim']}\" (by {r['claimant']})\n"
                    f"Rating: {r['rating']} — by {r['publisher']}\n"
                    f"Review: {r['title']}"
                )

            return {
                "found": True,
                "source": "Google Fact Check",
                "title": f"Fact checks related to: {query}",
                "content": "\n\n---\n\n".join(content_parts),
                "url": results[0]["url"] if results else "",
                "factCheckResults": results,
            }
        except Exception as e:
            return {"found": False, "source": "Google Fact Check", "error": str(e)}
