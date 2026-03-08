const WIKI_API = 'https://en.wikipedia.org/api/rest_v1';
const WIKI_SEARCH_API = 'https://en.wikipedia.org/w/api.php';

export async function searchWikipedia(queries) {
    const results = [];

    for (const query of queries.slice(0, 2)) {
        try {
            const searchUrl = `${WIKI_SEARCH_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();

            if (searchData.query?.search?.length > 0) {
                const topResult = searchData.query.search[0];
                const title = topResult.title;

                const summaryUrl = `${WIKI_API}/page/summary/${encodeURIComponent(title)}`;
                const summaryRes = await fetch(summaryUrl);

                if (summaryRes.ok) {
                    const summaryData = await summaryRes.json();
                    results.push({
                        title: summaryData.title,
                        extract: summaryData.extract || '',
                        description: summaryData.description || '',
                        url: summaryData.content_urls?.desktop?.page || '',
                        source: 'Wikipedia',
                    });
                }
            }
        } catch (err) {
            console.error('Wikipedia search error:', err.message);
        }
    }

    return results;
}

export async function getWikipediaArticle(title) {
    try {
        const url = `${WIKI_SEARCH_API}?action=query&titles=${encodeURIComponent(title)}&prop=extracts&exintro=false&explaintext=true&exsectionformat=plain&format=json&origin=*`;
        const res = await fetch(url);
        const data = await res.json();
        const pages = data.query?.pages;
        if (pages) {
            const page = Object.values(pages)[0];
            return {
                title: page.title,
                content: (page.extract || '').slice(0, 4000),
                source: 'Wikipedia',
            };
        }
    } catch (err) {
        console.error('Wikipedia article error:', err.message);
    }
    return null;
}
