const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

export async function searchWikidata(queries) {
    const results = [];

    for (const query of queries.slice(0, 2)) {
        try {
            const searchUrl = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&limit=3&format=json&origin=*`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();

            if (searchData.search?.length > 0) {
                const entity = searchData.search[0];
                const entityId = entity.id;

                const entityUrl = `${WIKIDATA_API}?action=wbgetentities&ids=${entityId}&props=labels|descriptions|claims&languages=en&format=json&origin=*`;
                const entityRes = await fetch(entityUrl);
                const entityData = await entityRes.json();

                const entityInfo = entityData.entities?.[entityId];
                if (entityInfo) {
                    const label = entityInfo.labels?.en?.value || '';
                    const description = entityInfo.descriptions?.en?.value || '';

                    const claims = entityInfo.claims || {};
                    const factSnippets = [];

                    const propertyMap = {
                        P571: 'inception/founded',
                        P17: 'country',
                        P159: 'headquarters',
                        P169: 'CEO',
                        P112: 'founder',
                        P1128: 'employees',
                        P2139: 'revenue',
                        P856: 'website',
                        P569: 'date of birth',
                        P570: 'date of death',
                        P27: 'citizenship',
                        P106: 'occupation',
                        P1082: 'population',
                    };

                    for (const [propId, propName] of Object.entries(propertyMap)) {
                        if (claims[propId]) {
                            const val = claims[propId][0]?.mainsnak?.datavalue;
                            if (val) {
                                let displayVal = '';
                                if (val.type === 'time') {
                                    displayVal = val.value?.time?.replace('+', '') || '';
                                } else if (val.type === 'quantity') {
                                    displayVal = val.value?.amount || '';
                                } else if (val.type === 'string') {
                                    displayVal = val.value || '';
                                } else if (val.type === 'wikibase-entityid') {
                                    displayVal = `Entity: ${val.value?.id || ''}`;
                                }
                                if (displayVal) {
                                    factSnippets.push(`${propName}: ${displayVal}`);
                                }
                            }
                        }
                    }

                    results.push({
                        title: label,
                        description: description,
                        facts: factSnippets,
                        entityId: entityId,
                        extract: `${label}: ${description}. ${factSnippets.join('. ')}`,
                        url: `https://www.wikidata.org/wiki/${entityId}`,
                        source: 'Wikidata',
                    });
                }
            }
        } catch (err) {
            console.error('Wikidata search error:', err.message);
        }
    }

    return results;
}
