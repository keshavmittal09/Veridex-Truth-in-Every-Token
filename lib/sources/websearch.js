const DUCKDUCKGO_API = 'https://api.duckduckgo.com/';

export async function searchWeb(queries) {
    const results = [];

    for (const query of queries.slice(0, 2)) {
        try {
            const url = `${DUCKDUCKGO_API}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.Abstract) {
                results.push({
                    title: data.Heading || query,
                    extract: data.Abstract,
                    url: data.AbstractURL || '',
                    source: data.AbstractSource || 'Web',
                });
            }

            if (data.RelatedTopics?.length > 0) {
                for (const topic of data.RelatedTopics.slice(0, 3)) {
                    if (topic.Text) {
                        results.push({
                            title: topic.Text.slice(0, 80),
                            extract: topic.Text,
                            url: topic.FirstURL || '',
                            source: 'DuckDuckGo',
                        });
                    }
                }
            }

            if (data.Infobox?.content?.length > 0) {
                const infoText = data.Infobox.content
                    .filter(item => item.label && item.value)
                    .map(item => `${item.label}: ${item.value}`)
                    .join('. ');

                if (infoText) {
                    results.push({
                        title: `${data.Heading || query} — Infobox`,
                        extract: infoText,
                        url: data.AbstractURL || '',
                        source: 'DuckDuckGo Infobox',
                    });
                }
            }
        } catch (err) {
            console.error('Web search error:', err.message);
        }
    }

    return results;
}
