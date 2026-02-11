// Content script for Amazon Price Checker extension
// This script runs on Amazon pages and helps with data extraction

(function() {
  'use strict';

  // Listen for messages from the popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractProductData') {
      try {
        const productData = extractAmazonProductData();
        sendResponse({ success: true, data: productData });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }
    
    if (request.action === 'fetchProductPage') {
      fetchProductPage(request.url)
        .then(data => sendResponse({ success: true, data }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep message channel open for async response
    }
  });

  function extractAmazonProductData() {
    const data = {
      price: null,
      availability: null,
      deliveryDate: null,
      title: null,
      url: window.location.href
    };

    // Extract price
    const priceSelectors = [
      '.a-price-whole',
      '.a-price .a-offscreen',
      '#price_inside_buybox',
      '.a-price-range',
      '#priceblock_dealprice',
      '#priceblock_ourprice',
      '.a-price.a-text-price.a-size-medium.apexPriceToPay .a-offscreen',
      '.a-price.a-text-price.a-size-medium.apexPriceToPay',
      '.a-price-symbol + .a-price-whole'
    ];

    for (const selector of priceSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent && element.textContent.trim()) {
        data.price = element.textContent.trim().replace(/\s+/g, ' ');
        if (data.price.includes('$') || data.price.includes('£') || data.price.includes('€')) {
          break;
        }
      }
    }

    // Extract availability
    const availabilitySelectors = [
      '#availability span',
      '#availability .a-color-success',
      '#availability .a-color-state',
      '.a-color-success',
      '.a-color-state',
      '#availability .a-size-medium',
      '[data-feature-name="availability"] .a-size-medium'
    ];

    for (const selector of availabilitySelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent && element.textContent.trim()) {
        data.availability = element.textContent.trim().replace(/\s+/g, ' ');
        if (data.availability.length > 0 && data.availability.length < 100) {
          break;
        }
      }
    }

    // Extract delivery date
    const deliverySelectors = [
      '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE span[data-csa-c-content-id]',
      '#deliveryBlockMessage span',
      '#delivery-block span',
      '.a-color-secondary.a-text-bold',
      '[data-feature-name="delivery"] span',
      '#ddmMIRAsinTitle + div span',
      '.a-size-base.a-color-secondary'
    ];

    for (const selector of deliverySelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent && element.textContent.trim()) {
        const deliveryText = element.textContent.trim();
        // Look for date patterns
        const dateMatch = deliveryText.match(/(\w+day,?\s+)?(\w+\s+\d{1,2})/i);
        if (dateMatch) {
          data.deliveryDate = parseDeliveryDate(dateMatch[0]);
          if (data.deliveryDate) break;
        }
      }
    }

    // Extract title
    const titleSelectors = ['#productTitle', '.product-title', 'h1.a-size-large'];
    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent) {
        data.title = element.textContent.trim();
        break;
      }
    }

    return data;
  }

  function parseDeliveryDate(dateStr) {
    try {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      
      // Handle formats like "Monday, July 15" or "July 15"
      const cleanDate = dateStr.replace(/^\w+day,?\s+/i, '').trim();
      
      // Try to parse with current year
      let parsedDate = new Date(`${cleanDate}, ${currentYear}`);
      
      // If the date is in the past, try next year
      if (parsedDate < currentDate) {
        parsedDate = new Date(`${cleanDate}, ${currentYear + 1}`);
      }
      
      // Validate the date
      if (isNaN(parsedDate.getTime())) {
        return null;
      }
      
      return parsedDate.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    } catch {
      return null;
    }
  }

  async function fetchProductPage(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': navigator.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      
      // Parse the HTML to extract product data
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      return parseProductDataFromDoc(doc, url);
    } catch (error) {
      console.error('Error fetching product page:', error);
      throw error;
    }
  }

  function parseProductDataFromDoc(doc, url) {
    const data = {
      price: null,
      availability: null,
      deliveryDate: null,
      title: null,
      url: url,
      status: 'success'
    };

    // Check if we got blocked
    const bodyText = doc.body ? doc.body.textContent : '';
    if (bodyText.includes('Robot Check') || bodyText.includes('Enter the characters you see below')) {
      return {
        ...data,
        status: 'blocked',
        errorMessage: 'Request blocked - retry later'
      };
    }

    // Extract price
    const priceSelectors = [
      '.a-price-whole',
      '.a-price .a-offscreen',
      '#price_inside_buybox',
      '.a-price-range',
      '#priceblock_dealprice',
      '#priceblock_ourprice',
      '.a-price.a-text-price.a-size-medium.apexPriceToPay .a-offscreen',
      '.a-price.a-text-price.a-size-medium.apexPriceToPay',
      '.a-price-symbol + .a-price-whole'
    ];

    for (const selector of priceSelectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent && element.textContent.trim()) {
        data.price = element.textContent.trim().replace(/\s+/g, ' ');
        if (data.price.includes('$') || data.price.includes('£') || data.price.includes('€')) {
          break;
        }
      }
    }

    // Extract availability
    const availabilitySelectors = [
      '#availability span',
      '#availability .a-color-success',
      '#availability .a-color-state',
      '.a-color-success',
      '.a-color-state',
      '#availability .a-size-medium',
      '[data-feature-name="availability"] .a-size-medium'
    ];

    for (const selector of availabilitySelectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent && element.textContent.trim()) {
        data.availability = element.textContent.trim().replace(/\s+/g, ' ');
        if (data.availability.length > 0 && data.availability.length < 100) {
          break;
        }
      }
    }

    // Extract delivery date
    const deliverySelectors = [
      '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE span[data-csa-c-content-id]',
      '#deliveryBlockMessage span',
      '#delivery-block span',
      '.a-color-secondary.a-text-bold',
      '[data-feature-name="delivery"] span',
      '#ddmMIRAsinTitle + div span',
      '.a-size-base.a-color-secondary'
    ];

    for (const selector of deliverySelectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent && element.textContent.trim()) {
        const deliveryText = element.textContent.trim();
        // Look for date patterns
        const dateMatch = deliveryText.match(/(\w+day,?\s+)?(\w+\s+\d{1,2})/i);
        if (dateMatch) {
          data.deliveryDate = parseDeliveryDate(dateMatch[0]);
          if (data.deliveryDate) break;
        }
      }
    }

    // Extract title
    const titleSelectors = ['#productTitle', '.product-title', 'h1.a-size-large'];
    for (const selector of titleSelectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent) {
        data.title = element.textContent.trim();
        break;
      }
    }

    // Check if we found any data
    if (!data.title && !data.price && !data.availability) {
      return {
        ...data,
        status: 'error',
        errorMessage: 'Product not found or page structure changed'
      };
    }

    return data;
  }

  // Add visual indicator when extension is active
  function addExtensionIndicator() {
    if (document.querySelector('#amazon-price-checker-indicator')) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'amazon-price-checker-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    indicator.textContent = '📦 Price Checker Active';
    
    document.body.appendChild(indicator);
    
    // Remove indicator after 3 seconds
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 3000);
  }

  // Add floating access button on Amazon pages
  function addFloatingButton() {
    if (document.querySelector('#amazon-price-checker-float-btn')) return;
    
    const floatingBtn = document.createElement('div');
    floatingBtn.id = 'amazon-price-checker-float-btn';
    floatingBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      cursor: pointer;
      z-index: 10000;
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
      transition: all 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    floatingBtn.innerHTML = '📦';
    floatingBtn.title = 'Open Amazon Price Checker';
    
    // Add hover effects
    floatingBtn.addEventListener('mouseenter', () => {
      floatingBtn.style.transform = 'scale(1.1)';
      floatingBtn.style.boxShadow = '0 6px 25px rgba(59, 130, 246, 0.6)';
    });
    
    floatingBtn.addEventListener('mouseleave', () => {
      floatingBtn.style.transform = 'scale(1)';
      floatingBtn.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.4)';
    });
    
    // Open extension popup when clicked
    floatingBtn.addEventListener('click', () => {
      // Since we can't directly open the popup from content script,
      // we'll send a message to background script
      chrome.runtime.sendMessage({ action: 'openPopup' });
      
      // Show a temporary message
      const message = document.createElement('div');
      message.style.cssText = `
        position: fixed;
        bottom: 90px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      message.textContent = 'Click the extension icon in toolbar';
      document.body.appendChild(message);
      
      setTimeout(() => {
        if (message.parentNode) {
          message.parentNode.removeChild(message);
        }
      }, 3000);
    });
    
    document.body.appendChild(floatingBtn);
  }

  // Show indicator when content script loads on Amazon pages
  if (window.location.hostname.includes('amazon')) {
    addExtensionIndicator();
    
    // Add floating button after a short delay
    setTimeout(() => {
      addFloatingButton();
    }, 2000);
  }

})();