# Amazon Price Checker - Chrome Extension

A powerful Chrome extension that allows you to check prices and availability for up to 1,000 Amazon products at once. Perfect for bulk product analysis, price monitoring, and inventory management.

## Features

- **Bulk Processing**: Analyze up to 1,000 Amazon products simultaneously
- **Real-time Data**: Get accurate pricing and stock information directly from Amazon
- **Smart Rate Limiting**: Intelligent delays to avoid detection and blocking
- **Progress Tracking**: Live progress updates with detailed statistics
- **Export Options**: Copy results to clipboard or export as CSV
- **Region Support**: Works with amazon.com and amazon.co.uk
- **User-friendly Interface**: Clean, modern popup interface

## Installation

### From Source (Developer Mode)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension folder
5. The extension icon will appear in your Chrome toolbar

### Usage

1. Click the extension icon in your Chrome toolbar
2. Paste Amazon product URLs (one per line) into the text area
3. Click "Start Analysis" to begin processing
4. Monitor progress in real-time
5. View results in the table below
6. Copy results or export to CSV as needed

## Supported URLs

The extension works with product URLs from:
- amazon.com
- amazon.co.uk

URLs must contain `/dp/` or `/gp/product/` in the path.

## How It Works

The extension uses Chrome's extension APIs to:
1. Bypass CORS restrictions that prevent web apps from accessing Amazon
2. Fetch product pages directly using your browser session
3. Parse HTML to extract price, availability, and product information
4. Apply smart rate limiting to avoid detection
5. Present results in an easy-to-use interface

## Technical Details

### Files Structure

- `manifest.json` - Extension configuration and permissions
- `popup.html` - Main interface HTML
- `popup.css` - Styling for the popup interface
- `popup.js` - Main application logic and UI handling
- `background.js` - Background service worker for extension functionality
- `content.js` - Content script that runs on Amazon pages

### Permissions

- `activeTab` - Access to the current tab for content script injection
- `storage` - Local storage for saving results (optional)
- `scripting` - Execute scripts on Amazon pages
- `host_permissions` - Access to Amazon domains

### Data Extraction

The extension uses multiple CSS selectors to extract:
- **Price**: Various Amazon price selectors including `.a-price-whole`, `.a-offscreen`, etc.
- **Availability**: Stock status from availability sections
- **Title**: Product title from multiple possible selectors

## Privacy & Security

- No data is sent to external servers
- All processing happens locally in your browser
- Uses your existing Amazon session for regional pricing
- No personal information is collected or stored

## Limitations

- Rate limited to prevent Amazon blocking (1-3 seconds between requests)
- Maximum 1,000 URLs per batch
- Requires active internet connection
- May be affected by Amazon's anti-bot measures

## Troubleshooting

### Common Issues

1. **"Blocked" status**: Amazon has temporarily blocked requests. Wait and try again later.
2. **"Failed" status**: Product page may have changed structure or product doesn't exist.
3. **No data extracted**: Amazon may have updated their page structure.

### Tips for Better Results

- Use clean, direct Amazon product URLs
- Avoid processing too many URLs too quickly
- If you get blocked, wait 10-15 minutes before trying again
- Make sure you're logged into Amazon for better regional pricing

## Development

To modify or extend the extension:

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

### Adding New Amazon Domains

To support additional Amazon domains:
1. Add the domain to `host_permissions` in `manifest.json`
2. Update URL validation in `popup.js`
3. Test with products from the new domain

## License

This project is for educational and personal use. Please respect Amazon's terms of service and use responsibly.

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the extension.