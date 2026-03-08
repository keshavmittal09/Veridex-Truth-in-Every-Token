import httpx

async def search_wikidata(query: str) -> dict:
    """Search Wikidata for structured entity data (dates, numbers, relationships)."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            search_resp = await client.get(
                "https://www.wikidata.org/w/api.php",
                params={
                    "action": "wbsearchentities",
                    "search": query,
                    "language": "en",
                    "limit": 3,
                    "format": "json",
                },
            )
            results = search_resp.json().get("search", [])
            if not results:
                return {"found": False, "source": "Wikidata"}

            entity_id = results[0]["id"]
            label = results[0].get("label", "")
            description = results[0].get("description", "")

            entity_resp = await client.get(
                "https://www.wikidata.org/w/api.php",
                params={
                    "action": "wbgetentities",
                    "ids": entity_id,
                    "languages": "en",
                    "props": "claims|descriptions|labels",
                    "format": "json",
                },
            )
            entity = entity_resp.json().get("entities", {}).get(entity_id, {})
            claims = entity.get("claims", {})

            facts = []
            property_labels = {
                "P571": "inception/founded",
                "P112": "founded by",
                "P17": "country",
                "P1082": "population",
                "P2044": "elevation",
                "P569": "date of birth",
                "P570": "date of death",
                "P36": "capital",
                "P1128": "employees",
                "P2139": "total revenue",
                "P159": "headquarters",
            }

            for prop_id, prop_label in property_labels.items():
                if prop_id in claims:
                    for claim_data in claims[prop_id][:2]:
                        mainsnak = claim_data.get("mainsnak", {})
                        value = mainsnak.get("datavalue", {}).get("value", {})
                        if isinstance(value, dict):
                            if "time" in value:
                                facts.append(f"{prop_label}: {value['time']}")
                            elif "amount" in value:
                                facts.append(f"{prop_label}: {value['amount']}")
                            elif "id" in value:
                                facts.append(f"{prop_label}: {value['id']}")
                        elif isinstance(value, str):
                            facts.append(f"{prop_label}: {value}")

            content = f"Entity: {label}\nDescription: {description}\n\nStructured Facts:\n" + "\n".join(facts)

            return {
                "found": True,
                "source": "Wikidata",
                "title": label,
                "content": content,
                "url": f"https://www.wikidata.org/wiki/{entity_id}",
            }
        except Exception as e:
            return {"found": False, "source": "Wikidata", "error": str(e)}
