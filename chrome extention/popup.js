document.addEventListener('DOMContentLoaded', () => {
    // Load saved provider
    chrome.storage.local.get(['provider'], (result) => {
        if (result.provider) {
            document.getElementById('provider').value = result.provider;
        } else {
            document.getElementById('provider').value = 'groq'; // Default
        }
    });

    // Save selection
    document.getElementById('save').addEventListener('click', () => {
        const provider = document.getElementById('provider').value;

        chrome.storage.local.set({ provider: provider }, () => {
            const status = document.getElementById('status');
            status.textContent = 'Settings saved!';
            setTimeout(() => {
                status.textContent = '';
            }, 2000);
        });
    });
});
