// Background script for the Amazon Price Checker extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Amazon Price Checker extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Open the popup (this is handled automatically by manifest.json)
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchPage') {
    // Handle page fetching requests
    fetchPage(request.url)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'saveState') {
    // Save processing state
    chrome.storage.local.set({ 'priceCheckerState': request.state }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'loadState') {
    // Load processing state
    chrome.storage.local.get(['priceCheckerState'], (result) => {
      sendResponse({ success: true, data: result.priceCheckerState || null });
    });
    return true;
  }
});

async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    return { html, status: response.status };
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

// Handle storage operations (legacy support)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveResults') {
    chrome.storage.local.set({ 'amazonResults': request.data }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'loadResults') {
    chrome.storage.local.get(['amazonResults'], (result) => {
      sendResponse({ success: true, data: result.amazonResults || [] });
    });
    return true;
  }
});