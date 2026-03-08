(function () {
    const { fetch: originalFetch } = window;
    let lastUserMsg = "";

    window.fetch = async (...args) => {
        let url = args[0];
        if (typeof url !== 'string') url = url.url || url.toString();
        if (url.includes("localhost:8000")) return originalFetch(...args);

        if (url.includes("/conversation") && args[1]?.body) {
            try {
                const reqData = JSON.parse(args[1].body);
                lastUserMsg = reqData.messages?.[0]?.content?.parts?.[0] || lastUserMsg;
            } catch (e) { }
        }

        const response = await originalFetch(...args);

        if (url.includes("/conversation") && !url.includes("/prepare")) {
            const capturedPrompt = lastUserMsg;
            const reader = response.clone().body.getReader();
            const decoder = new TextDecoder();
            let fullAI = "";

            (async () => {
                const chunks = [];
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        chunks.push(value);

                        // Parse JSON parts to extract AI text smoothly
                        const chunkStr = decoder.decode(value, { stream: true });
                        const lines = chunkStr.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
                                try {
                                    const json = JSON.parse(line.substring(6));
                                    if (json?.message?.content?.parts?.[0]) {
                                        fullAI = json.message.content.parts[0];
                                    } else if (json?.v) {
                                        json.v.forEach(p => { if (p.o === "append") fullAI += p.v; });
                                    }
                                } catch (e) {
                                    // Ignore parse errors on partial chunks
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("Stream reading error:", e);
                }

                if (fullAI.trim().length > 0) {
                    window.postMessage({
                        type: "LLM_LOG_DATA",
                        payload: { platform: "ChatGPT", prompt: capturedPrompt, response: fullAI }
                    }, "*");
                }
            })();
        }
        return response;
    };
})();