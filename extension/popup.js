document.addEventListener('DOMContentLoaded', async () => {
  const radioInputs = document.querySelectorAll('input[name="saver-mode"]');

  // Load saved mode from chrome.storage or dashboard API
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['mode'], (result) => {
      if (result.mode) {
        const matching = document.querySelector(`input[value="${result.mode}"]`);
        if (matching) matching.checked = true;
      }
    });
  }

  // Handle mode changes
  radioInputs.forEach(input => {
    input.addEventListener('change', async (e) => {
      const mode = e.target.value;
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ mode });
      }

      // Sync with local server if running
      try {
        await fetch('http://localhost:3000/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode })
        });
      } catch (err) {
        // Local server might not be running, extension continues locally
      }
    });
  });
});
