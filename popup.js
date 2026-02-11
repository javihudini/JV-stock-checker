class AmazonPriceChecker {
  constructor() {
    this.results = [];
    this.isProcessing = false;
    this.currentInputMode = 'simple';
    this.spreadsheetData = [];
    this.currentDate = new Date();
    this.stats = {
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      blocked: 0
    };
    this.enhancedStats = {
      outOfStock: 0,
      lateDelivery: 0,
      priceIncreased: 0,
      lowStock: 0
    };
    
    this.initializeEventListeners();
    this.initializeSpreadsheet();
    this.updateCurrentDate();
    this.loadPersistedState();
  }

  updateCurrentDate() {
    const now = new Date();
    const options = { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', options);
    this.currentDate = now;
  }

  async loadPersistedState() {
    try {
      const response = await this.sendMessageToBackground('loadState', {});
      if (response.success && response.data) {
        const state = response.data;
        
        // Restore results and stats
        if (state.results) {
          this.results = state.results;
          this.stats = state.stats || this.stats;
          this.enhancedStats = state.enhancedStats || this.enhancedStats;
          
          // Restore UI state
          if (this.results.length > 0) {
            document.getElementById('progress-section').classList.remove('hidden');
            document.getElementById('results-section').classList.remove('hidden');
            this.updateProgress();
            this.updateEnhancedStats();
            this.renderResults();
          }
          
          // Restore processing state
          if (state.isProcessing) {
            this.isProcessing = true;
            document.getElementById('processing-status').classList.remove('hidden');
            const startButton = document.getElementById('start-analysis');
            startButton.disabled = true;
            startButton.innerHTML = '<span class="button-icon">⏸️</span>Processing...';
            
            // Continue processing from where we left off
            this.continueProcessing(state.pendingUrls || []);
          }
        }
        
        // Restore input mode and data
        if (state.inputMode) {
          this.currentInputMode = state.inputMode;
          this.switchInputMode(state.inputMode);
        }
        
        if (state.inputText) {
          document.getElementById('urls').value = state.inputText;
        }
        
        if (state.spreadsheetData) {
          this.spreadsheetData = state.spreadsheetData;
          this.renderSpreadsheet();
        }
      }
    } catch (error) {
      console.error('Failed to load persisted state:', error);
    }
  }

  async saveState() {
    const state = {
      results: this.results,
      stats: this.stats,
      enhancedStats: this.enhancedStats,
      isProcessing: this.isProcessing,
      inputMode: this.currentInputMode,
      inputText: document.getElementById('urls').value,
      spreadsheetData: this.spreadsheetData,
      pendingUrls: this.getPendingUrls(),
      timestamp: Date.now()
    };
    
    await this.sendMessageToBackground('saveState', { state });
  }

  getPendingUrls() {
    return this.results
      .filter(result => result.status === 'pending' || result.status === 'processing')
      .map(result => ({ url: result.url, savedPrice: result.savedPrice }));
  }

  initializeEventListeners() {
    // Tab switching
    document.getElementById('tab-simple').addEventListener('click', () => this.switchInputMode('simple'));
    document.getElementById('tab-spreadsheet').addEventListener('click', () => this.switchInputMode('spreadsheet'));
    
    // Spreadsheet controls
    document.getElementById('add-row').addEventListener('click', () => this.addSpreadsheetRow());
    document.getElementById('clear-all').addEventListener('click', () => this.clearSpreadsheet());
    document.getElementById('import-csv').addEventListener('click', () => this.showCSVImport());
    
    // Main controls
    document.getElementById('start-analysis').addEventListener('click', () => this.handleStartAnalysis());
    document.getElementById('copy-results').addEventListener('click', () => this.copyResults());
    document.getElementById('export-csv').addEventListener('click', () => this.exportCSV());
    document.getElementById('open-new-tab').addEventListener('click', () => this.openResultsInNewTab());
    
    // Enhanced stats buttons
    document.getElementById('stat-out-of-stock').addEventListener('click', () => this.filterResults('outOfStock'));
    document.getElementById('stat-late-delivery').addEventListener('click', () => this.filterResults('lateDelivery'));
    document.getElementById('stat-price-increased').addEventListener('click', () => this.filterResults('priceIncreased'));
    document.getElementById('stat-low-stock').addEventListener('click', () => this.filterResults('lowStock'));
    
    // Add pause/resume functionality
    document.getElementById('pause-resume').addEventListener('click', () => this.toggleProcessing());
    
    // Save state when popup is about to close
    window.addEventListener('beforeunload', () => this.saveState());
    
    // Auto-save state periodically during processing
    setInterval(() => {
      if (this.isProcessing) {
        this.saveState();
      }
    }, 5000);
  }

  filterResults(filterType) {
    // Highlight matching rows in the table
    const rows = document.querySelectorAll('#results-tbody tr');
    rows.forEach((row, index) => {
      const result = this.results[index];
      let shouldHighlight = false;
      
      switch (filterType) {
        case 'outOfStock':
          shouldHighlight = this.isOutOfStock(result.availability);
          break;
        case 'lateDelivery':
          shouldHighlight = this.isLateDelivery(result.deliveryDate);
          break;
        case 'priceIncreased':
          shouldHighlight = result.priceChangePercent && result.priceChangePercent >= 15;
          break;
        case 'lowStock':
          shouldHighlight = this.isLowStock(result.availability);
          break;
      }
      
      if (shouldHighlight) {
        row.style.backgroundColor = '#eff6ff';
        row.style.border = '2px solid #3b82f6';
        setTimeout(() => {
          row.style.backgroundColor = '';
          row.style.border = '';
        }, 3000);
      }
    });
  }

  switchInputMode(mode) {
    this.currentInputMode = mode;
    
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${mode}`).classList.add('active');
    
    // Show/hide input modes
    document.getElementById('simple-input').classList.toggle('hidden', mode !== 'simple');
    document.getElementById('spreadsheet-input').classList.toggle('hidden', mode !== 'spreadsheet');
    
    this.saveState();
  }

  initializeSpreadsheet() {
    // Initialize with 5 empty rows
    this.spreadsheetData = Array(5).fill().map(() => ({ url: '', price: '' }));
    this.renderSpreadsheet();
  }

  renderSpreadsheet() {
    const tbody = document.getElementById('spreadsheet-tbody');
    tbody.innerHTML = '';

    this.spreadsheetData.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="row-number">${index + 1}</td>
        <td>
          <textarea 
            class="spreadsheet-input url-input" 
            placeholder="https://amazon.com/dp/..."
            data-row="${index}" 
            data-field="url"
          >${row.url}</textarea>
        </td>
        <td>
          <input 
            type="text" 
            class="spreadsheet-input price-input" 
            placeholder="$29.99"
            data-row="${index}" 
            data-field="price"
            value="${row.price}"
          />
        </td>
        <td class="row-actions">
          <button class="delete-row" data-row="${index}">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Add event listeners
    this.addSpreadsheetEventListeners();
  }

  addSpreadsheetEventListeners() {
    // Input change handlers
    document.querySelectorAll('.spreadsheet-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const row = parseInt(e.target.dataset.row);
        const field = e.target.dataset.field;
        this.spreadsheetData[row][field] = e.target.value;
        this.saveState();
      });

      // Tab navigation
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          this.navigateSpreadsheet(e.target, e.shiftKey);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.addSpreadsheetRow();
        }
      });

      // Auto-paste functionality - Google Sheets style
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text');
        this.handleSpreadsheetPaste(e.target, pastedData);
      });
    });

    // Delete row handlers
    document.querySelectorAll('.delete-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = parseInt(e.target.dataset.row);
        this.deleteSpreadsheetRow(row);
      });
    });
  }

  handleSpreadsheetPaste(targetInput, pastedData) {
    const startRow = parseInt(targetInput.dataset.row);
    const startField = targetInput.dataset.field;
    
    // Split pasted data into lines and cells
    const lines = pastedData.split('\n').filter(line => line.trim());
    const pastedRows = lines.map(line => {
      // Split by tab or multiple spaces (common in copy-paste from spreadsheets)
      const cells = line.split(/\t|  +/).map(cell => cell.trim());
      return cells;
    });

    if (pastedRows.length === 0) return;

    // Determine starting column index
    const fieldIndex = startField === 'url' ? 0 : 1;

    // Ensure we have enough rows in spreadsheetData
    const requiredRows = startRow + pastedRows.length;
    while (this.spreadsheetData.length < requiredRows) {
      this.spreadsheetData.push({ url: '', price: '' });
    }

    // Fill the data
    pastedRows.forEach((rowData, rowOffset) => {
      const targetRowIndex = startRow + rowOffset;
      
      if (rowData.length === 1) {
        // Single column paste - paste into the current field
        if (startField === 'url') {
          this.spreadsheetData[targetRowIndex].url = rowData[0];
        } else {
          this.spreadsheetData[targetRowIndex].price = rowData[0];
        }
      } else if (rowData.length >= 2) {
        // Multi-column paste - fill both URL and price
        this.spreadsheetData[targetRowIndex].url = rowData[0] || '';
        this.spreadsheetData[targetRowIndex].price = rowData[1] || '';
      } else if (rowData.length === 1 && fieldIndex === 0) {
        // Single cell paste starting from URL column
        this.spreadsheetData[targetRowIndex].url = rowData[0];
      }
    });

    // Re-render the spreadsheet
    this.renderSpreadsheet();
    this.saveState();

    // Show success message
    this.showValidationMessage('success', `Pasted ${pastedRows.length} rows successfully! 📋`);
    setTimeout(() => this.hideValidationMessage(), 3000);
  }

  navigateSpreadsheet(currentInput, reverse = false) {
    const inputs = Array.from(document.querySelectorAll('.spreadsheet-input'));
    const currentIndex = inputs.indexOf(currentInput);
    
    let nextIndex;
    if (reverse) {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : inputs.length - 1;
    } else {
      nextIndex = currentIndex < inputs.length - 1 ? currentIndex + 1 : 0;
    }
    
    inputs[nextIndex].focus();
  }

  addSpreadsheetRow() {
    this.spreadsheetData.push({ url: '', price: '' });
    this.renderSpreadsheet();
    
    // Focus on the new row's URL input
    setTimeout(() => {
      const newRowInput = document.querySelector(`[data-row="${this.spreadsheetData.length - 1}"][data-field="url"]`);
      if (newRowInput) newRowInput.focus();
    }, 0);
  }

  deleteSpreadsheetRow(index) {
    if (this.spreadsheetData.length > 1) {
      this.spreadsheetData.splice(index, 1);
      this.renderSpreadsheet();
      this.saveState();
    }
  }

  clearSpreadsheet() {
    if (confirm('Are you sure you want to clear all data?')) {
      this.spreadsheetData = [{ url: '', price: '' }];
      this.renderSpreadsheet();
      this.saveState();
    }
  }

  showCSVImport() {
    // Create CSV import modal
    const overlay = document.createElement('div');
    overlay.className = 'csv-import-overlay';
    overlay.innerHTML = `
      <div class="csv-import-modal">
        <div class="csv-import-header">
          <h3>Import CSV</h3>
          <button class="close-modal">×</button>
        </div>
        <div class="csv-import-content">
          <p>Upload a CSV file with two columns: Amazon URL and Price</p>
          <div class="file-input-container">
            <input type="file" class="file-input" accept=".csv" />
            <p>📁 Click to select CSV file or drag and drop</p>
          </div>
        </div>
        <div class="csv-import-actions">
          <button class="action-button">Cancel</button>
          <button class="action-button primary">Import</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Add event listeners
    const closeModal = () => document.body.removeChild(overlay);
    overlay.querySelector('.close-modal').addEventListener('click', closeModal);
    overlay.querySelector('.csv-import-actions .action-button:not(.primary)').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // File input handling
    const fileInput = overlay.querySelector('.file-input');
    const fileContainer = overlay.querySelector('.file-input-container');
    
    fileContainer.addEventListener('click', () => fileInput.click());
    fileContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileContainer.classList.add('dragover');
    });
    fileContainer.addEventListener('dragleave', () => {
      fileContainer.classList.remove('dragover');
    });
    fileContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      fileContainer.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.processCSVFile(files[0]);
        closeModal();
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.processCSVFile(e.target.files[0]);
        closeModal();
      }
    });
  }

  processCSVFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target.result;
        const lines = csv.split('\n').filter(line => line.trim());
        const data = [];

        lines.forEach((line, index) => {
          if (index === 0) return; // Skip header
          const [url, price] = line.split(',').map(cell => cell.trim().replace(/"/g, ''));
          if (url && this.validateAmazonUrl(url)) {
            data.push({ url, price: price || '' });
          }
        });

        if (data.length > 0) {
          this.spreadsheetData = data;
          this.renderSpreadsheet();
          this.saveState();
          this.showValidationMessage('success', `Imported ${data.length} products from CSV`);
        } else {
          this.showValidationMessage('error', 'No valid Amazon URLs found in CSV file');
        }
      } catch (error) {
        this.showValidationMessage('error', 'Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
  }

  toggleProcessing() {
    const button = document.getElementById('pause-resume');
    if (this.isProcessing) {
      this.isProcessing = false;
      button.innerHTML = '<span class="button-icon">▶️</span>Resume';
      document.getElementById('processing-status').classList.add('hidden');
    } else {
      this.isProcessing = true;
      button.innerHTML = '<span class="button-icon">⏸️</span>Pause';
      document.getElementById('processing-status').classList.remove('hidden');
      this.continueProcessing(this.getPendingUrls());
    }
    this.saveState();
  }

  validateAmazonUrl(url) {
    try {
      const urlObj = new URL(url.trim());
      const hostname = urlObj.hostname.toLowerCase();
      
      return (
        (hostname.includes('amazon.com') || 
         hostname.includes('amazon.co.uk') ||
         hostname.includes('amazon.de') ||
         hostname.includes('amazon.fr') ||
         hostname.includes('amazon.it') ||
         hostname.includes('amazon.es') ||
         hostname.includes('amazon.ca') ||
         hostname.includes('amazon.com.au')) &&
        (urlObj.pathname.includes('/dp/') || urlObj.pathname.includes('/gp/product/'))
      );
    } catch {
      return false;
    }
  }

  extractProductData() {
    if (this.currentInputMode === 'simple') {
      const textarea = document.getElementById('urls');
      const inputText = textarea.value.trim();
      const lines = inputText.split('\n').map(line => line.trim()).filter(Boolean);
      const products = [];
      
      lines.forEach(line => {
        if (this.validateAmazonUrl(line)) {
          try {
            const url = new URL(line);
            const cleanUrl = `${url.protocol}//${url.hostname}${url.pathname}`;
            products.push({ url: cleanUrl, savedPrice: null });
          } catch {
            // Skip invalid URLs
          }
        }
      });
      
      return products;
    } else {
      // Spreadsheet mode
      const products = [];
      this.spreadsheetData.forEach(row => {
        if (row.url && this.validateAmazonUrl(row.url)) {
          try {
            const url = new URL(row.url);
            const cleanUrl = `${url.protocol}//${url.hostname}${url.pathname}`;
            products.push({ 
              url: cleanUrl, 
              savedPrice: this.parsePrice(row.price) 
            });
          } catch {
            // Skip invalid URLs
          }
        }
      });
      return products;
    }
  }

  parsePrice(priceStr) {
    if (!priceStr) return null;
    // Extract numeric value from price string
    const match = priceStr.match(/[\d.,]+/);
    if (match) {
      return parseFloat(match[0].replace(',', ''));
    }
    return null;
  }

  showValidationMessage(type, message) {
    const messageEl = document.getElementById('validation-message');
    messageEl.className = `validation-message ${type}`;
    messageEl.textContent = message;
    messageEl.classList.remove('hidden');
  }

  hideValidationMessage() {
    document.getElementById('validation-message').classList.add('hidden');
  }

  async handleStartAnalysis() {
    const products = this.extractProductData();

    if (products.length === 0) {
      this.showValidationMessage('error', 'No valid Amazon URLs found. Please check your input.');
      return;
    }

    if (products.length > 1000) {
      this.showValidationMessage('error', 'Maximum 1,000 URLs allowed. Please reduce your list.');
      return;
    }

    this.showValidationMessage('success', `Found ${products.length} valid products. Starting analysis...`);
    
    setTimeout(() => {
      this.startProcessing(products);
    }, 1000);
  }

  async startProcessing(products) {
    this.isProcessing = true;
    this.results = [];
    
    // Initialize results
    this.results = products.map((product, index) => ({
      id: `product-${index}`,
      url: product.url,
      savedPrice: product.savedPrice,
      currentPrice: null,
      priceChange: null,
      priceChangePercent: null,
      availability: null,
      deliveryDate: null,
      status: 'pending',
      title: null
    }));

    // Initialize stats
    this.stats = {
      total: products.length,
      processed: 0,
      success: 0,
      failed: 0,
      blocked: 0
    };

    this.enhancedStats = {
      outOfStock: 0,
      lateDelivery: 0,
      priceIncreased: 0,
      lowStock: 0
    };

    // Show progress section
    document.getElementById('progress-section').classList.remove('hidden');
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('processing-status').classList.remove('hidden');
    
    // Update start button to pause button
    const startButton = document.getElementById('start-analysis');
    startButton.disabled = true;
    startButton.innerHTML = '<span class="button-icon">⏸️</span>Processing...';

    this.updateProgress();
    this.updateEnhancedStats();
    this.renderResults();
    this.saveState();

    this.continueProcessing(products);
  }

  async continueProcessing(products) {
    // Process products
    for (let i = 0; i < products.length; i++) {
      if (!this.isProcessing) break; // Allow pausing
      
      const product = products[i];
      const resultIndex = this.results.findIndex(r => r.url === product.url);
      
      if (resultIndex === -1 || this.results[resultIndex].status !== 'pending') {
        continue; // Skip if already processed
      }
      
      // Update status to processing
      this.results[resultIndex].status = 'processing';
      this.renderResults();

      try {
        const result = await this.scrapeProduct(product.url);
        
        // Calculate price changes
        const priceAnalysis = this.analyzePriceChange(product.savedPrice, result.price);
        
        // Update result
        this.results[resultIndex] = {
          ...this.results[resultIndex],
          ...result,
          ...priceAnalysis,
          status: result.status || 'success'
        };

        // Update stats
        this.stats.processed++;
        if (result.status === 'success') {
          this.stats.success++;
        } else if (result.status === 'blocked') {
          this.stats.blocked++;
        } else {
          this.stats.failed++;
        }

        // Update enhanced stats
        this.updateEnhancedStatsForResult(this.results[resultIndex]);

      } catch (error) {
        console.error(`Error processing ${product.url}:`, error);
        this.results[resultIndex].status = 'error';
        this.results[resultIndex].errorMessage = 'Processing failed';
        this.stats.processed++;
        this.stats.failed++;
      }

      this.updateProgress();
      this.updateEnhancedStats();
      this.renderResults();
      this.saveState();

      // Add delay between requests
      if (i < products.length - 1 && this.isProcessing) {
        await this.delay(1000 + Math.random() * 2000);
      }
    }

    // Finish processing
    if (this.isProcessing) {
      this.isProcessing = false;
      document.getElementById('processing-status').classList.add('hidden');
      const startButton = document.getElementById('start-analysis');
      startButton.disabled = false;
      startButton.innerHTML = '<span class="button-icon">📤</span>Start Analysis';
      this.saveState();
    }
  }

  updateEnhancedStatsForResult(result) {
    // Reset and recalculate all enhanced stats
    this.enhancedStats = {
      outOfStock: 0,
      lateDelivery: 0,
      priceIncreased: 0,
      lowStock: 0
    };

    this.results.forEach(r => {
      if (r.status === 'success') {
        if (this.isOutOfStock(r.availability)) {
          this.enhancedStats.outOfStock++;
        }
        if (this.isLateDelivery(r.deliveryDate)) {
          this.enhancedStats.lateDelivery++;
        }
        if (r.priceChangePercent && r.priceChangePercent >= 15) {
          this.enhancedStats.priceIncreased++;
        }
        if (this.isLowStock(r.availability)) {
          this.enhancedStats.lowStock++;
        }
      }
    });
  }

  isOutOfStock(availability) {
    if (!availability || availability === 'N/A') return false;
    const lower = availability.toLowerCase();
    return lower.includes('unavailable') || 
           lower.includes('out of stock') || 
           lower.includes('currently unavailable') ||
           lower.includes('not available');
  }

  isLowStock(availability) {
    if (!availability || availability === 'N/A') return false;
    const lower = availability.toLowerCase();
    
    // Extract number from phrases like "5 left in stock", "Only 3 remaining", etc.
    const matches = lower.match(/(\d+)\s*(left|remaining|in stock)/);
    if (matches) {
      const quantity = parseInt(matches[1]);
      return quantity < 20;
    }
    
    // Check for other low stock indicators
    return lower.includes('only') && (lower.includes('left') || lower.includes('remaining'));
  }

  isLateDelivery(deliveryDate) {
    if (!deliveryDate || deliveryDate === 'N/A') return false;
    
    try {
      const delivery = new Date(deliveryDate);
      const diffTime = delivery - this.currentDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 10;
    } catch {
      return false;
    }
  }

  analyzePriceChange(savedPrice, currentPriceStr) {
    const currentPrice = this.parsePrice(currentPriceStr);
    
    if (!savedPrice || !currentPrice) {
      return {
        currentPrice: currentPriceStr,
        priceChange: null,
        priceChangePercent: null
      };
    }

    const change = currentPrice - savedPrice;
    const changePercent = (change / savedPrice) * 100;

    return {
      currentPrice: currentPriceStr,
      priceChange: change,
      priceChangePercent: changePercent
    };
  }

  async scrapeProduct(url) {
    try {
      // Use background script to fetch the page
      const response = await this.sendMessageToBackground('fetchPage', { url });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch page');
      }
      
      return this.parseAmazonData(response.data.html);
    } catch (error) {
      console.error('Scraping error:', error);
      return {
        status: 'error',
        errorMessage: error.message || 'Failed to fetch product data'
      };
    }
  }

  sendMessageToBackground(action, data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action, ...data }, (response) => {
        resolve(response || { success: false, error: 'No response from background script' });
      });
    });
  }

  parseAmazonData(html) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check if we got blocked first
      const bodyText = doc.body ? doc.body.textContent : '';
      if (bodyText.includes('Robot Check') || bodyText.includes('Enter the characters you see below') || bodyText.includes('Sorry, we just need to make sure you\'re not a robot')) {
        return {
          status: 'blocked',
          errorMessage: 'Request blocked - retry later'
        };
      }
      
      // Amazon price selectors (these change frequently)
      const priceSelectors = [
        '.a-price-whole',
        '.a-price .a-offscreen',
        '#price_inside_buybox',
        '.a-price-range',
        '#priceblock_dealprice',
        '#priceblock_ourprice',
        '.a-price.a-text-price.a-size-medium.apexPriceToPay .a-offscreen',
        '.a-price.a-text-price.a-size-medium.apexPriceToPay',
        '.a-price-symbol + .a-price-whole',
        '[data-a-price-amount]',
        '.a-price-symbol',
        '#apex_desktop .a-price .a-offscreen',
        '.a-price.a-text-price .a-offscreen'
      ];
      
      // Amazon availability selectors
      const availabilitySelectors = [
        '#availability span',
        '#availability .a-color-success',
        '#availability .a-color-state',
        '.a-color-success',
        '.a-color-state',
        '#availability .a-size-medium',
        '[data-feature-name="availability"] .a-size-medium',
        '#availability .a-color-price',
        '#availability-brief',
        '.a-accordion-row-a11y[aria-label*="availability"]'
      ];

      // Amazon delivery date selectors
      const deliverySelectors = [
        '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE span[data-csa-c-content-id]',
        '#deliveryBlockMessage span',
        '#delivery-block span',
        '.a-color-secondary.a-text-bold',
        '[data-feature-name="delivery"] span',
        '#ddmMIRAsinTitle + div span',
        '.a-size-base.a-color-secondary'
      ];
      
      let price = null;
      let availability = null;
      let deliveryDate = null;
      let title = null;
      
      // Extract price
      for (const selector of priceSelectors) {
        const element = doc.querySelector(selector);
        if (element && element.textContent && element.textContent.trim()) {
          let priceText = element.textContent.trim();
          // Clean up price text
          priceText = priceText.replace(/\s+/g, ' ').trim();
          if (priceText.includes('$') || priceText.includes('£') || priceText.includes('€') || priceText.includes('₹')) {
            price = priceText;
            break;
          }
        }
      }
      
      // Extract availability
      for (const selector of availabilitySelectors) {
        const element = doc.querySelector(selector);
        if (element && element.textContent && element.textContent.trim()) {
          let availText = element.textContent.trim();
          // Clean up availability text
          availText = availText.replace(/\s+/g, ' ').trim();
          if (availText.length > 0 && availText.length < 200) {
            availability = availText;
            break;
          }
        }
      }

      // Extract delivery date
      for (const selector of deliverySelectors) {
        const element = doc.querySelector(selector);
        if (element && element.textContent && element.textContent.trim()) {
          let deliveryText = element.textContent.trim();
          // Look for date patterns
          const dateMatch = deliveryText.match(/(\w+day,?\s+)?(\w+\s+\d{1,2})/i);
          if (dateMatch) {
            deliveryDate = this.parseDeliveryDate(dateMatch[0]);
            if (deliveryDate) break;
          }
        }
      }
      
      // Extract title
      const titleSelectors = ['#productTitle', '.product-title', 'h1.a-size-large', 'h1 span'];
      for (const selector of titleSelectors) {
        const element = doc.querySelector(selector);
        if (element && element.textContent) {
          title = element.textContent.trim();
          if (title.length > 0) {
            break;
          }
        }
      }
      
      // Check if product exists
      if (!title && !price && !availability) {
        return {
          status: 'error',
          errorMessage: 'Product not found or page structure changed'
        };
      }
      
      return {
        status: 'success',
        price: price || 'N/A',
        availability: availability || 'N/A',
        deliveryDate: deliveryDate || 'N/A',
        title: title || 'N/A'
      };
      
    } catch (error) {
      console.error('Parse error:', error);
      return {
        status: 'error',
        errorMessage: 'Failed to parse product data'
      };
    }
  }

  parseDeliveryDate(dateStr) {
    try {
      const currentYear = this.currentDate.getFullYear();
      
      // Handle formats like "Monday, July 15" or "July 15"
      const cleanDate = dateStr.replace(/^\w+day,?\s+/i, '').trim();
      
      // Try to parse with current year
      let parsedDate = new Date(`${cleanDate}, ${currentYear}`);
      
      // If the date is in the past, try next year
      if (parsedDate < this.currentDate) {
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

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  updateProgress() {
    const progressPercentage = this.stats.total > 0 ? (this.stats.processed / this.stats.total) * 100 : 0;
    
    document.getElementById('progress-count').textContent = `${this.stats.processed} of ${this.stats.total}`;
    document.getElementById('progress-percentage').textContent = `${Math.round(progressPercentage)}%`;
    document.getElementById('progress-fill').style.width = `${progressPercentage}%`;
    
    document.getElementById('stat-processed').textContent = this.stats.processed;
    document.getElementById('stat-success').textContent = this.stats.success;
    document.getElementById('stat-failed').textContent = this.stats.failed;
    document.getElementById('stat-blocked').textContent = this.stats.blocked;
  }

  updateEnhancedStats() {
    document.querySelector('#stat-out-of-stock .enhanced-stat-number').textContent = this.enhancedStats.outOfStock;
    document.querySelector('#stat-late-delivery .enhanced-stat-number').textContent = this.enhancedStats.lateDelivery;
    document.querySelector('#stat-price-increased .enhanced-stat-number').textContent = this.enhancedStats.priceIncreased;
    document.querySelector('#stat-low-stock .enhanced-stat-number').textContent = this.enhancedStats.lowStock;
  }

  renderResults() {
    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';

    this.results.forEach((result, index) => {
      const row = document.createElement('tr');
      
      const statusIcon = this.getStatusIcon(result.status);
      const statusText = this.getStatusText(result);
      
      row.innerHTML = `
        <td>${index + 1}</td>
        <td class="url-cell" title="${result.url}">${result.url}</td>
        <td class="price-cell your-price">${result.savedPrice ? `$${result.savedPrice.toFixed(2)}` : 'N/A'}</td>
        <td class="price-cell ${result.currentPrice && result.currentPrice !== 'N/A' ? '' : 'na'}">${result.currentPrice || 'N/A'}</td>
        <td class="price-change-cell ${this.getPriceChangeClass(result.priceChangePercent)}">
          ${this.formatPriceChange(result.priceChange, result.priceChangePercent)}
        </td>
        <td class="availability-cell ${this.getAvailabilityClass(result.availability)}">
          ${result.availability || 'N/A'}
        </td>
        <td class="delivery-cell ${this.getDeliveryClass(result.deliveryDate)}">
          ${this.formatDeliveryDate(result.deliveryDate)}
        </td>
        <td class="status-cell">
          <span class="status-icon">${statusIcon}</span>
          <span class="status-text ${result.status}">${statusText}</span>
        </td>
        <td>
          <a href="${result.url}" target="_blank" class="external-link" onclick="window.open('${result.url}', '_blank'); return false;">🔗</a>
        </td>
      `;
      
      tbody.appendChild(row);
    });
  }

  getPriceChangeClass(changePercent) {
    if (!changePercent) return 'no-change';
    if (changePercent >= 15) return 'increase';
    if (changePercent <= -15) return 'decrease';
    return 'no-change';
  }

  formatPriceChange(change, changePercent) {
    if (!change || !changePercent) return 'N/A';
    
    const sign = change > 0 ? '+' : '';
    const arrow = change > 0 ? '↗️' : '↘️';
    
    return `${arrow} ${sign}$${change.toFixed(2)} (${sign}${changePercent.toFixed(1)}%)`;
  }

  getStatusIcon(status) {
    switch (status) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'blocked': return '🛡️';
      case 'processing': return '⏳';
      default: return '⏱️';
    }
  }

  getStatusText(result) {
    if (result.status === 'success') return 'Success';
    if (result.status === 'processing') return 'Processing...';
    if (result.status === 'blocked') return 'Blocked';
    if (result.errorMessage) return result.errorMessage;
    return 'Pending';
  }

  getAvailabilityClass(availability) {
    if (!availability || availability === 'N/A') return 'na';
    const lower = availability.toLowerCase();
    if (lower.includes('in stock')) return 'in-stock';
    if (this.isOutOfStock(availability)) return 'out-of-stock';
    if (this.isLowStock(availability)) return 'limited';
    return '';
  }

  getDeliveryClass(deliveryDate) {
    if (!deliveryDate || deliveryDate === 'N/A') return 'na';
    if (this.isLateDelivery(deliveryDate)) return 'late';
    return 'normal';
  }

  formatDeliveryDate(deliveryDate) {
    if (!deliveryDate || deliveryDate === 'N/A') return 'N/A';
    
    try {
      const date = new Date(deliveryDate);
      const diffTime = date - this.currentDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const formattedDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      
      if (diffDays > 10) {
        return `${formattedDate} (${diffDays} days)`;
      } else {
        return `${formattedDate} (${diffDays} days)`;
      }
    } catch {
      return deliveryDate;
    }
  }

  async copyResults() {
    const headers = ['#', 'URL', 'Your Price', 'Current Price', 'Price Change', 'Availability', 'Delivery', 'Status'];
    const rows = this.results.map((result, index) => [
      index + 1,
      result.url,
      result.savedPrice ? `$${result.savedPrice.toFixed(2)}` : 'N/A',
      result.currentPrice || 'N/A',
      this.formatPriceChange(result.priceChange, result.priceChangePercent),
      result.availability || 'N/A',
      this.formatDeliveryDate(result.deliveryDate),
      this.getStatusText(result)
    ]);

    const text = [headers, ...rows]
      .map(row => row.join('\t'))
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      const button = document.getElementById('copy-results');
      const originalText = button.innerHTML;
      button.innerHTML = '<span class="button-icon">✅</span>Copied!';
      setTimeout(() => {
        button.innerHTML = originalText;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  exportCSV() {
    const headers = ['#', 'URL', 'Your Price', 'Current Price', 'Price Change', 'Price Change %', 'Availability', 'Delivery Date', 'Status'];
    const rows = this.results.map((result, index) => [
      index + 1,
      result.url,
      result.savedPrice ? result.savedPrice.toFixed(2) : 'N/A',
      result.currentPrice || 'N/A',
      result.priceChange ? result.priceChange.toFixed(2) : 'N/A',
      result.priceChangePercent ? `${result.priceChangePercent.toFixed(1)}%` : 'N/A',
      result.availability || 'N/A',
      result.deliveryDate || 'N/A',
      this.getStatusText(result)
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amazon-price-comparison-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  openResultsInNewTab() {
    // Create HTML content for the new tab
    const htmlContent = this.generateResultsHTML();
    
    // Create a blob with the HTML content
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // Open in new tab
    window.open(url, '_blank');
    
    // Clean up the blob URL after a short delay
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  generateResultsHTML() {
    const timestamp = new Date().toLocaleString();
    const totalProducts = this.results.length;
    const successfulProducts = this.stats.success;
    
    const tableRows = this.results.map((result, index) => {
      const statusIcon = this.getStatusIcon(result.status);
      const statusText = this.getStatusText(result);
      
      return `
        <tr>
          <td>${index + 1}</td>
          <td class="url-cell">
            <a href="${result.url}" target="_blank" title="${result.url}">
              ${result.url.length > 60 ? result.url.substring(0, 60) + '...' : result.url}
            </a>
          </td>
          <td class="price-cell your-price">${result.savedPrice ? `$${result.savedPrice.toFixed(2)}` : 'N/A'}</td>
          <td class="price-cell ${result.currentPrice && result.currentPrice !== 'N/A' ? '' : 'na'}">${result.currentPrice || 'N/A'}</td>
          <td class="price-change-cell ${this.getPriceChangeClass(result.priceChangePercent)}">
            ${this.formatPriceChange(result.priceChange, result.priceChangePercent)}
          </td>
          <td class="availability-cell ${this.getAvailabilityClass(result.availability)}">${result.availability || 'N/A'}</td>
          <td class="delivery-cell ${this.getDeliveryClass(result.deliveryDate)}">${this.formatDeliveryDate(result.deliveryDate)}</td>
          <td class="status-cell">
            <span class="status-icon">${statusIcon}</span>
            <span class="status-text ${result.status}">${statusText}</span>
          </td>
          <td>
            <a href="${result.url}" target="_blank" class="external-link">🔗 Open</a>
          </td>
        </tr>
      `;
    }).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Amazon Price Checker Results - ${timestamp}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      padding: 20px;
      line-height: 1.6;
    }
    
    .header {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border: 1px solid #e2e8f0;
    }
    
    .header h1 {
      color: #1e293b;
      font-size: 28px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .header p {
      color: #64748b;
      font-size: 16px;
      margin-bottom: 16px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    
    .stat-item {
      background: #f8fafc;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      text-align: center;
    }
    
    .stat-number {
      font-size: 24px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 4px;
    }
    
    .stat-label {
      font-size: 14px;
      color: #64748b;
    }
    
    .developer-credit {
      background: linear-gradient(135deg, #f59e0b, #f97316);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      margin-top: 16px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
      border: 2px solid #fbbf24;
    }
    
    .credit-text {
      font-size: 14px;
      font-weight: 500;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
    
    .credit-text strong {
      font-weight: 700;
      color: #fef3c7;
    }
    
    .results-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border: 1px solid #e2e8f0;
      overflow: hidden;
    }
    
    .results-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .results-table th {
      background: #f8fafc;
      padding: 16px 12px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .results-table td {
      padding: 12px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 14px;
    }
    
    .results-table tr:hover {
      background: #f8fafc;
    }
    
    .url-cell {
      max-width: 300px;
    }
    
    .url-cell a {
      color: #3b82f6;
      text-decoration: none;
    }
    
    .url-cell a:hover {
      color: #2563eb;
      text-decoration: underline;
    }
    
    .price-cell {
      font-weight: 600;
      color: #166534;
      text-align: right;
    }
    
    .price-cell.na {
      color: #64748b;
    }
    
    .price-cell.your-price {
      color: #3b82f6;
    }
    
    .price-change-cell {
      font-weight: 600;
      text-align: right;
    }
    
    .price-change-cell.increase {
      background: #fef2f2 !important;
      color: #dc2626;
    }
    
    .price-change-cell.decrease {
      background: #f0fdf4 !important;
      color: #166534;
    }
    
    .price-change-cell.no-change {
      color: #64748b;
    }
    
    .availability-cell.in-stock {
      color: #166534;
    }
    
    .availability-cell.out-of-stock {
      background: #fef2f2 !important;
      color: #dc2626;
    }
    
    .availability-cell.limited {
      background: #fffbeb !important;
      color: #ea580c;
    }
    
    .availability-cell.na {
      color: #64748b;
    }
    
    .delivery-cell {
      font-size: 12px;
      text-align: center;
    }
    
    .delivery-cell.late {
      background: #fef2f2 !important;
      color: #dc2626;
      font-weight: 600;
    }
    
    .delivery-cell.normal {
      color: #166534;
    }
    
    .delivery-cell.na {
      color: #64748b;
    }
    
    .status-cell {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .status-icon {
      font-size: 14px;
    }
    
    .status-text {
      font-size: 12px;
    }
    
    .status-text.success {
      color: #166534;
    }
    
    .status-text.error {
      color: #dc2626;
    }
    
    .status-text.blocked {
      color: #ea580c;
    }
    
    .status-text.pending {
      color: #64748b;
    }
    
    .external-link {
      color: #3b82f6;
      text-decoration: none;
      font-size: 12px;
    }
    
    .external-link:hover {
      color: #2563eb;
      text-decoration: underline;
    }
    
    .actions-bar {
      background: white;
      padding: 16px 24px;
      border-radius: 12px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border: 1px solid #e2e8f0;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    
    .action-button {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      color: #374151;
    }
    
    .action-button:hover {
      background: #f9fafb;
    }
    
    .action-button.primary {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }
    
    .action-button.primary:hover {
      background: #2563eb;
    }
    
    @media print {
      .actions-bar {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📦 Amazon Price Checker Results</h1>
    <p>Generated on ${timestamp}</p>
    
    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-number">${totalProducts}</div>
        <div class="stat-label">Total Products</div>
      </div>
      <div class="stat-item">
        <div class="stat-number">${successfulProducts}</div>
        <div class="stat-label">Successfully Processed</div>
      </div>
      <div class="stat-item">
        <div class="stat-number">${this.enhancedStats.priceIncreased}</div>
        <div class="stat-label">Price Increased (15%+)</div>
      </div>
      <div class="stat-item">
        <div class="stat-number">${this.enhancedStats.outOfStock}</div>
        <div class="stat-label">Out of Stock</div>
      </div>
      <div class="stat-item">
        <div class="stat-number">${this.enhancedStats.lateDelivery}</div>
        <div class="stat-label">Late Delivery (10+ days)</div>
      </div>
      <div class="stat-item">
        <div class="stat-number">${this.enhancedStats.lowStock}</div>
        <div class="stat-label">Low Stock (<20)</div>
      </div>
    </div>
    
    <div class="developer-credit">
      <span class="credit-text">Developed by <strong>Jawad x Bader</strong></span>
    </div>
  </div>
  
  <div class="actions-bar">
    <button class="action-button" onclick="window.print()">
      <span>🖨️</span>
      Print
    </button>
    <button class="action-button primary" onclick="downloadCSV()">
      <span>💾</span>
      Download CSV
    </button>
  </div>
  
  <div class="results-container">
    <table class="results-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Product URL</th>
          <th>Your Price</th>
          <th>Current Price</th>
          <th>Price Change</th>
          <th>Availability</th>
          <th>Delivery Date</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>
  
  <script>
    function downloadCSV() {
      const headers = ['#', 'URL', 'Your Price', 'Current Price', 'Price Change', 'Price Change %', 'Availability', 'Delivery Date', 'Status'];
      const rows = ${JSON.stringify(this.results.map((result, index) => [
        index + 1,
        result.url,
        result.savedPrice ? result.savedPrice.toFixed(2) : 'N/A',
        result.currentPrice || 'N/A',
        result.priceChange ? result.priceChange.toFixed(2) : 'N/A',
        result.priceChangePercent ? `${result.priceChangePercent.toFixed(1)}%` : 'N/A',
        result.availability || 'N/A',
        result.deliveryDate || 'N/A',
        this.getStatusText(result)
      ]))};
      
      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => '"' + cell + '"').join(','))
        .join('\\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'amazon-price-comparison-${new Date().toISOString().split('T')[0]}.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>
    `;
  }
}

// Initialize the extension when popup loads
document.addEventListener('DOMContentLoaded', () => {
  new AmazonPriceChecker();
});