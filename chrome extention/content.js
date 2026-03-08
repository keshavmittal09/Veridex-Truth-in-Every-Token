// content.js
console.log("🌉 [Bridge] Content Script Active.");

// Inject the interceptor
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);

// 1. RELAY: Page -> Background
window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "LLM_LOG_DATA") return;

    console.log("📤 [Bridge] Relaying to Background...");
    chrome.runtime.sendMessage(event.data);
});

// 2. RECEIVE: Background -> Page
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "DISPLAY_ANALYSIS") {
        console.log("📍 [4] Content.js: Showing Report...");
        renderReport(msg.data);
    }
});

// 3. UI RENDERER (CSP-Safe version of your working code)
function renderReport(data) {
    // Remove old one
    const old = document.getElementById('fact-ui');
    if (old) old.remove();

    const ui = document.createElement('div');
    ui.id = 'fact-ui';
    ui.style = `
        position: fixed; top: 70px; right: 20px; width: 300px; 
        background: #202123; color: white; border: 1px solid #444; 
        border-radius: 10px; padding: 15px; z-index: 10000; 
        box-shadow: 0 8px 16px rgba(0,0,0,0.4); font-family: sans-serif;
    `;

    const score = data["Trust Score"] || 0;
    const hist = data["Historical Facts"] || [];
    const ver = data["Verifiable Facts"] || [];

    // Construct content as a string (since this part was working)
    ui.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
            <b style="color:#10a37f">FACT CHECK</b>
            <span id="close-fact-ui" style="cursor:pointer; padding: 0 5px;">✕</span>
        </div>
        <div style="font-size:20px; font-weight:bold; margin-bottom:10px;">${score}% Trust</div>
        <div style="font-size:12px; max-height:200px; overflow-y:auto;">
            ${hist.map(f => `<div style="color:#ff6b6b; margin-top:5px;">❌ ${f.fact}</div>`).join('')}
            ${ver.map(f => `<div style="color:#51cf66; margin-top:5px;">✅ ${f.fact}</div>`).join('')}
        </div>
    `;

    document.body.appendChild(ui);

    // Attach the close event AFTER the element is in the DOM
    document.getElementById('close-fact-ui').addEventListener('click', () => {
        ui.remove();
    });
}