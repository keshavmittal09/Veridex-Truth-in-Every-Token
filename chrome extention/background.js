// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "LLM_LOG_DATA") {
        // Retrieve chosen API provider from storage, default to 'groq'
        chrome.storage.local.get(['provider'], (result) => {
            const provider = result.provider || "groq";

            // Add provider to payload
            const payload = { ...message.payload, provider: provider };

            fetch("http://localhost:8000/msg/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })
                .then(res => res.json())
                .then(data => {
                    // Ensure the tab still exists before sending
                    if (sender.tab?.id) {
                        chrome.tabs.sendMessage(sender.tab.id, {
                            type: "DISPLAY_ANALYSIS",
                            data: data
                        });
                    }
                })
                .catch(err => console.error("FastAPI Error:", err));
        });
    }
    return true; // Keep message channel open for async response
});