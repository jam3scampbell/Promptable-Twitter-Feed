let activeStyles = new Map();
// Store active observers for cleanup
const activeObservers = new Map();
// Cache for tweet filter results to avoid repeated API calls
const tweetFilterCache = new Map();

const injectTheme = async () => {
  try {
    const { settings } = await chrome.storage.sync.get('settings');
    
    StyleManager.removeAllStyles();
    
    if (!settings) {
      return;
    }
    
    Object.entries(TWITTER_MODS).forEach(([modType, modConfig]) => {
      if (modType === 'theme') {
        FeatureHandlers.theme(modConfig, settings?.theme?.enabled === true);
      } else {
        Object.entries(modConfig).forEach(([key, config]) => {
          const isEnabled = settings?.[modType]?.[key]?.enabled === true;
          
          if (FeatureHandlers[modType]) {
            FeatureHandlers[modType](config, isEnabled, key);
          }
        });
      }
    });
    
    // Handle LLM filtering separately since it's an entire feature, not just settings
    if (settings?.llmFiltering?.enabled === true) {
      FeatureHandlers.llmFiltering(settings.llmFiltering, true);
    } else {
      // Disconnect any existing tweet observer
      if (activeObservers.has('llmFiltering')) {
        activeObservers.get('llmFiltering').disconnect();
        activeObservers.delete('llmFiltering');
      }
    }
  } catch (error) {
    // Keep error logging for debugging
    console.error('Failed to apply modifications:', error);
  }
};

const applyTheme = (variables) => {
  const root = document.documentElement;
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
};

const hideElements = (selectors, id) => {
  console.log(`Hiding elements for ${id}:`, selectors);
  
  // Check if elements exist
  const elementsFound = selectors.map(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`Found ${elements.length} elements for selector: ${selector}`);
    return elements.length;
  });

  const style = document.createElement('style');
  style.id = `twitter-theme-${id}`; // Add ID for debugging
  style.textContent = selectors.map(selector => 
    `${selector} { display: none !important; }`
  ).join('\n');
  
  // Remove existing style if any
  const existingStyle = document.head.querySelector(`#twitter-theme-${id}`);
  if (existingStyle) {
    console.log(`Removing existing style for ${id}`);
    existingStyle.remove();
  }
  
  document.head.appendChild(style);
  activeStyles.set(id, style);
  console.log(`Active styles map:`, Array.from(activeStyles.keys()));
};

const replaceElement = (config, id) => {
  const style = document.createElement('style');
  style.textContent = `
    ${config.target} svg { display: none !important; }
    ${config.target} .css-1jxf684 {
      background-image: url('data:image/svg+xml;charset=utf-8,${config.replacementData.svg}');
      background-repeat: no-repeat;
      background-position: center;
      width: ${config.replacementData.width} !important;
      height: ${config.replacementData.height} !important;
      display: block !important;
    }
  `;
  document.head.appendChild(style);
  activeStyles.set(id, style);
};

// Listen for theme update messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  if (message.type === 'refreshTheme') {
    injectTheme();
    sendResponse({ status: 'ok' });
  }
  return true; // Keep message channel open for async response
});

// Handle dynamic content - throttled mutation observer to avoid excessive updates
let throttleTimer = null;
const observer = new MutationObserver((mutations) => {
  // Only respond to significant DOM changes, not all mutations
  const significantChange = mutations.some(mutation => {
    // Check if this is a change to the timeline or main content area
    if (mutation.target.tagName === 'ARTICLE' || 
        mutation.target.getAttribute('data-testid') === 'primaryColumn' ||
        mutation.target.role === 'region') {
      return true;
    }
    
    // Check for added nodes that might be important
    return Array.from(mutation.addedNodes).some(node => 
      node.nodeType === Node.ELEMENT_NODE && 
      (node.tagName === 'ARTICLE' || 
       node.querySelector('article[data-testid="tweet"]'))
    );
  });
  
  if (!significantChange) return;
  
  // Throttle updates to once per second
  if (!throttleTimer) {
    throttleTimer = setTimeout(() => {
      injectTheme();
      throttleTimer = null;
    }, 1000);
  }
});

// Start observing once DOM is ready
if (document.body) {
  // Only observe the main content area, not the entire body
  const mainContent = document.querySelector('div[data-testid="primaryColumn"]') || document.body;
  observer.observe(mainContent, {
    childList: true,
    subtree: true
  });
  injectTheme();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.querySelector('div[data-testid="primaryColumn"]') || document.body;
    observer.observe(mainContent, {
      childList: true,
      subtree: true
    });
    injectTheme();
  });
}

// Utility functions for style management
const StyleManager = {
  createStyle: (id, css) => {
    const style = document.createElement('style');
    style.id = `twitter-theme-${id}`;
    style.textContent = css;
    return style;
  },

  applyStyle: (id, css) => {
    const existingStyle = document.head.querySelector(`#twitter-theme-${id}`);
    if (existingStyle) {
      existingStyle.remove();
    }
    const style = StyleManager.createStyle(id, css);
    document.head.appendChild(style);
    activeStyles.set(id, style);
  },

  removeAllStyles: () => {
    document.querySelectorAll('style[id^="twitter-theme-"]').forEach(style => {
      style.remove();
    });
    activeStyles.clear();
    
    // Clean up observers
    activeObservers.forEach(observer => observer.disconnect());
    activeObservers.clear();
  }
};

// Feature handlers
const FeatureHandlers = {
  theme: (config, enabled) => {
    if (enabled) {
      const css = Object.entries(config.variables)
        .map(([key, value]) => `${key}: ${value};`)
        .join('\n');
      StyleManager.applyStyle('theme', `:root { ${css} }`);
    }
  },

  hideElements: (config, enabled, key) => {
    if (enabled) {
      const css = config.selectors
        .map(selector => `${selector} { display: none !important; }`)
        .join('\n');
      StyleManager.applyStyle(`hideElements-${key}`, css);
    }
  },

  replaceElements: (config, enabled, key) => {
    if (enabled) {
      let css = '';
      switch (config.type) {
        case 'logoReplace':
          css = `
            ${config.target} svg { display: none !important; }
            ${config.target} .css-1jxf684 {
              background-image: url('data:image/svg+xml;charset=utf-8,${config.replacementData.svg}');
              background-repeat: no-repeat;
              background-position: center;
              width: ${config.replacementData.width} !important;
              height: ${config.replacementData.height} !important;
              display: block !important;
            }
            ${config.replacementData.styles || ''}
          `;
          break;
        case 'buttonReplace':
          css = `
            ${config.target} span.css-1jxf684 span {
              visibility: hidden;
            }
            ${config.target} span.css-1jxf684 span::before {
              content: '${config.replacementData.text}';
              visibility: visible;
              position: absolute;
            }
            ${config.replacementData.styles}
          `;
          break;
      }
      StyleManager.applyStyle(`replaceElements-${key}`, css);
    }
  },

  styleFixes: (config, enabled, key) => {
    if (enabled) {
      const css = config.selectors
        .map(selector => `${selector} { ${config.styles} }`)
        .join('\n');
      StyleManager.applyStyle(`styleFixes-${key}`, css);
    }
  },

  buttonColors: (config, enabled, key) => {
    if (enabled) {
      const css = Object.entries(config.selectors)
        .map(([type, selector]) => `${selector} { ${config.styles[type]} }`)
        .join('\n');
      StyleManager.applyStyle(`buttonColors-${key}`, css);
    }
  },
  
  // New feature handler for LLM filtering
  llmFiltering: (config, enabled) => {
    if (!enabled) return;
    
    // Skip if we already have an active observer
    if (activeObservers.has('llmFiltering')) {
      return;
    }
    
    // Only log once when setting up
    console.log('Setting up LLM tweet filtering');
    
    // Set up tweet observer to catch new tweets as they load
    const tweetObserver = new MutationObserver(async (mutations) => {
      // Only process when we're on a timeline that should be filtered
      const timelineTypes = config.filterSettings?.filterTimelineTypes || ['for-you'];
      const currentTimeline = getCurrentTimeline();
      
      if (!timelineTypes.includes(currentTimeline)) {
        return;
      }
      
      // Get all new tweet elements
      const tweetElements = findNewTweetElements(mutations);
      // Process tweet elements
      for (const tweetElement of tweetElements) {
        // Skip if we've already processed this tweet
        if (tweetElement.dataset.llmProcessed) continue;

        // Immediately hide the tweet and show loading state until processed
        showTweetLoadingState(tweetElement);
        
        // Mark as processed to avoid duplicate API calls
        tweetElement.dataset.llmProcessed = "pending";

        // Get tweet ID for caching
        const tweetId = extractTweetId(tweetElement);

        // Try to get from cache first if enabled
        if (config.filterSettings.cacheResults && tweetFilterCache.has(tweetId)) {
          const shouldShow = tweetFilterCache.get(tweetId);
          if (shouldShow) {
            // Show the tweet if it's allowed
            restoreTweet(tweetElement);
          } else {
            // Keep it hidden if filtered
            hideTweet(tweetElement);
          }
          continue;
        }

        // Process this tweet - use immediately invoked async function
        (async function processTweet(tweet) {
          try {
            // Add a short delay to allow images to fully load in the DOM
            // This helps ensure all images are detected before being sent to the LLM
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Evaluate the tweet with the LLM
            const shouldShow = await evaluateTweetWithLLM(tweet, config);

            // Extract content for logging
            const tweetContent = extractTweetContent(tweet);
            const contentType = tweetContent.contentType;
            const tweetPreview = tweetContent.text.length > 50 ?
              tweetContent.text.substring(0, 50) + '...' : tweetContent.text;

            // Log the decision with content info
            console.log(
              `LLM Filter: ${shouldShow ? '✅ ALLOWED' : '❌ FILTERED'} ${contentType} tweet by ${tweetContent.author.name}: "${tweetPreview}"`
            );

            // Cache the result
            if (config.filterSettings.cacheResults) {
              tweetFilterCache.set(tweetId, shouldShow);
            }

            // Handle tweet visibility based on filtering decision
            if (shouldShow) {
              // The tweet passed the filter, so restore it to visibility
              restoreTweet(tweet);
            } else {
              // The tweet didn't pass the filter, keep it hidden
              hideTweet(tweet);
            }

            // Mark as fully processed
            tweet.dataset.llmProcessed = "complete";
          } catch (error) {
            console.error("Failed to process tweet with LLM:", error);
            // On error, restore the tweet (fail open)
            restoreTweet(tweet);
            tweet.dataset.llmProcessed = "error";
          }
        })(tweetElement); // Pass the current tweet to the immediately invoked function
      }
    });

    // Start observing the timeline
    const timelineElement = document.querySelector('div[aria-label="Timeline: Your Home Timeline"]') || 
                            document.querySelector('section[role="region"][aria-label*="Timeline"]');
    
    if (timelineElement) {
      tweetObserver.observe(timelineElement, { childList: true, subtree: true });
      console.log('LLM filtering observer attached to timeline'); // This only happens once now
    } else {
      console.warn('Timeline element not found for LLM filtering');
    }
    
    // Store observer reference for cleanup
    activeObservers.set('llmFiltering', tweetObserver);
  }
};

// Helper function to determine current timeline
function getCurrentTimeline() {
  const tabElements = document.querySelectorAll('a[role="tab"]');
  for (const tab of tabElements) {
    if (tab.textContent.includes("For you") && tab.getAttribute("aria-selected") === "true") {
      return "for-you";
    }
    if (tab.textContent.includes("Following") && tab.getAttribute("aria-selected") === "true") {
      return "following";
    }
  }
  return "unknown";
}

// Helper function to find new tweet elements from mutations
function findNewTweetElements(mutations) {
  const tweets = [];
  
  mutations.forEach(mutation => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Find tweets by their article elements with data-testid
          const tweetElements = node.querySelectorAll('article[data-testid="tweet"]');
          tweetElements.forEach(tweet => tweets.push(tweet));
          
          // If the node itself is a tweet
          if (node.tagName === 'ARTICLE' && node.getAttribute('data-testid') === 'tweet') {
            tweets.push(node);
          }
        }
      });
    }
  });
  
  return tweets;
}

// Extract text content from a tweet element
function extractTweetText(tweetElement) {
  // Main tweet text is in a div with data-testid="tweetText"
  const tweetTextElement = tweetElement.querySelector('div[data-testid="tweetText"]');
  if (tweetTextElement) {
    return tweetTextElement.textContent;
  }
  return "";
}

// Extract tweet ID for caching
function extractTweetId(tweetElement) {
  // Try to find a link with the tweet ID (usually in the time element)
  const timeElement = tweetElement.querySelector('time');
  if (timeElement) {
    const timeLink = timeElement.closest('a');
    if (timeLink) {
      const href = timeLink.getAttribute('href');
      // Extract tweet ID from URL
      const match = href.match(/\/status\/(\d+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
  }
  
  // Fallback to using a hash of the tweet content
  return hashString(extractTweetText(tweetElement));
}

// Simple string hashing function
function hashString(str) {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

// Show loading state for a tweet while it's being processed
function showTweetLoadingState(tweetElement) {
  // Store original state
  tweetElement.dataset.originalDisplay = tweetElement.style.display || '';
  tweetElement.dataset.originalOpacity = tweetElement.style.opacity || '1';
  
  // Apply dimmed style to indicate loading state
  tweetElement.style.opacity = '0.4';
  tweetElement.style.position = 'relative';
  
  // Add a loading indicator
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'llm-loading-indicator';
  loadingIndicator.style.position = 'absolute';
  loadingIndicator.style.top = '10px';
  loadingIndicator.style.left = '10px';
  loadingIndicator.style.backgroundColor = 'rgba(29, 155, 240, 0.9)'; // Twitter blue with opacity
  loadingIndicator.style.color = 'white';
  loadingIndicator.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  loadingIndicator.style.padding = '2px 8px';
  loadingIndicator.style.borderRadius = '12px';
  loadingIndicator.style.fontSize = '12px';
  loadingIndicator.style.fontWeight = '500';
  loadingIndicator.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.15)';
  loadingIndicator.style.zIndex = '100';
  loadingIndicator.style.pointerEvents = 'none';
  loadingIndicator.textContent = '🤖 Analyzing...';
  tweetElement.appendChild(loadingIndicator);
  
  // Add a class for potential custom styling
  tweetElement.classList.add('llm-loading');
}

// Restore a tweet to its normal state after being approved
function restoreTweet(tweetElement) {
  // Remove loading indicator if present
  const loadingIndicator = tweetElement.querySelector('.llm-loading-indicator');
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
  
  // Remove loading class
  tweetElement.classList.remove('llm-loading');
  
  // Restore original styles
  tweetElement.style.opacity = tweetElement.dataset.originalOpacity || '1';
  
  // Remove any other filtering UI elements
  const filterIndicator = tweetElement.querySelector('.filter-indicator');
  if (filterIndicator) filterIndicator.remove();
  
  const minimizeButton = tweetElement.querySelector('.minimize-button');
  if (minimizeButton) minimizeButton.remove();
  
  const whitelistButton = tweetElement.querySelector('.whitelist-button');
  if (whitelistButton) whitelistButton.remove();
  
  // Remove filtered class
  tweetElement.classList.remove('llm-filtered');
}

// Hide a tweet that doesn't pass the filter
async function hideTweet(tweetElement) {
  // Get settings to check if we should completely hide the tweet
  const { settings } = await chrome.storage.sync.get('settings');
  const completelyHideFiltered = settings?.llmFiltering?.filterSettings?.completelyHideFiltered === true;
  
  // First remove any loading indicator
  const loadingIndicator = tweetElement.querySelector('.llm-loading-indicator');
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
  
  // Remove loading class
  tweetElement.classList.remove('llm-loading');
  
  if (completelyHideFiltered) {
    // Completely hide the tweet
    tweetElement.style.display = 'none';
    tweetElement.classList.add('llm-filtered-hidden');
    return;
  }
  
  // Store original display value for potential toggling
  tweetElement.dataset.originalDisplay = tweetElement.style.display || '';
  
  // Instead of completely hiding, make it compact with a visual indicator
  tweetElement.style.maxHeight = '40px';
  tweetElement.style.overflow = 'hidden';
  tweetElement.style.opacity = '0.5';
  tweetElement.style.position = 'relative';
  tweetElement.style.backgroundImage = 'linear-gradient(rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0.03))'; // Subtle overlay to indicate filtered
  tweetElement.style.borderRadius = '16px';
  tweetElement.style.cursor = 'pointer';
  
  // Add a class for potential custom styling
  tweetElement.classList.add('llm-filtered');
  
  // Add a visual indicator that this tweet was filtered
  const filterIndicator = document.createElement('div');
  filterIndicator.textContent = '🤖 Filtered';
  filterIndicator.className = 'filter-indicator';
  filterIndicator.style.position = 'absolute';
  filterIndicator.style.top = '10px';
  filterIndicator.style.left = '10px';
  filterIndicator.style.backgroundColor = 'rgba(29, 155, 240, 0.9)'; // Twitter blue with opacity
  filterIndicator.style.color = 'white';
  filterIndicator.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  filterIndicator.style.padding = '2px 8px';
  filterIndicator.style.borderRadius = '12px';
  filterIndicator.style.fontSize = '12px';
  filterIndicator.style.fontWeight = '500';
  filterIndicator.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.15)';
  filterIndicator.style.zIndex = '100';
  filterIndicator.style.pointerEvents = 'none';
  tweetElement.appendChild(filterIndicator);
  
  // Add a minimize button that stays in expanded view
  const minimizeButton = document.createElement('div');
  minimizeButton.className = 'minimize-button';
  minimizeButton.textContent = '🔼 Minimize';
  minimizeButton.style.position = 'absolute';
  minimizeButton.style.bottom = '10px';
  minimizeButton.style.right = '10px';
  minimizeButton.style.backgroundColor = 'rgba(29, 155, 240, 0.9)';
  minimizeButton.style.color = 'white';
  minimizeButton.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  minimizeButton.style.padding = '2px 8px';
  minimizeButton.style.borderRadius = '12px';
  minimizeButton.style.fontSize = '12px';
  minimizeButton.style.fontWeight = '500';
  minimizeButton.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.15)';
  minimizeButton.style.zIndex = '100';
  minimizeButton.style.display = 'none'; // Initially hidden
  minimizeButton.style.cursor = 'pointer';
  tweetElement.appendChild(minimizeButton);
  
  // Add whitelist button
  const whitelistButton = document.createElement('div');
  whitelistButton.className = 'whitelist-button';
  whitelistButton.textContent = '⭐ Add to Whitelist';
  whitelistButton.style.position = 'absolute';
  whitelistButton.style.bottom = '10px';
  whitelistButton.style.left = '10px';
  whitelistButton.style.backgroundColor = 'rgba(29, 155, 240, 0.9)';
  whitelistButton.style.color = 'white';
  whitelistButton.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  whitelistButton.style.padding = '2px 8px';
  whitelistButton.style.borderRadius = '12px';
  whitelistButton.style.fontSize = '12px';
  whitelistButton.style.fontWeight = '500';
  whitelistButton.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.15)';
  whitelistButton.style.zIndex = '100';
  whitelistButton.style.display = 'none'; // Initially hidden
  whitelistButton.style.cursor = 'pointer';
  tweetElement.appendChild(whitelistButton);
  
  // Add click handler to toggle visibility
  tweetElement.addEventListener('click', function toggleTweet(e) {
    // Don't trigger if clicking directly on any of our buttons or like button
    if (e.target === minimizeButton || 
        e.target === whitelistButton ||
        e.target.closest('button[data-testid="like"]') ||
        e.target.closest('button[data-testid="unlike"]')) {
      return;
    }
    
    if (this.style.maxHeight === '40px') {
      // Expand
      this.style.maxHeight = 'none';
      this.style.opacity = '0.8';
      filterIndicator.textContent = '🤖 Filtered';
      minimizeButton.style.display = 'block';
      whitelistButton.style.display = 'block';
      e.stopPropagation(); // Prevent tweet interaction on first click
    }
  }, true);
  
  // Add click handler specifically for the minimize button
  minimizeButton.addEventListener('click', (e) => {
    // Minimize
    tweetElement.style.maxHeight = '40px';
    tweetElement.style.opacity = '0.5';
    filterIndicator.textContent = '🤖 Filtered';
    minimizeButton.style.display = 'none';
    whitelistButton.style.display = 'none';
    e.stopPropagation(); // Prevent the tweet's click handler from firing
  });
  
  // Add click handler for the whitelist button
  whitelistButton.addEventListener('click', async (e) => {
    e.stopPropagation(); // Prevent the tweet's click handler from firing
    
    // Get the tweet author info
    const tweetContent = extractTweetContent(tweetElement);
    const authorHandle = tweetContent.author.handle.replace('@', '');
    
    if (!authorHandle) {
      console.error('Could not extract author handle');
      return;
    }
    
    try {
      // Get current settings
      const { settings } = await chrome.storage.sync.get('settings');
      
      // Add to whitelist if not already there
      if (!settings.llmFiltering.filterSettings.whitelist) {
        settings.llmFiltering.filterSettings.whitelist = [];
      }
      
      // Check if already in whitelist
      if (!settings.llmFiltering.filterSettings.whitelist.includes(authorHandle)) {
        // Add to whitelist
        settings.llmFiltering.filterSettings.whitelist.push(authorHandle);
        
        // Save updated settings
        await chrome.storage.sync.set({ settings });
        
        // Update button text to provide feedback
        whitelistButton.textContent = '✅ Added to Whitelist';
        whitelistButton.style.backgroundColor = 'rgba(0, 186, 124, 0.9)'; // Green
        
        // Restore tweet visibility
        setTimeout(() => {
          tweetElement.style.maxHeight = '';
          tweetElement.style.overflow = '';
          tweetElement.style.opacity = '1';
          tweetElement.style.backgroundImage = 'none';
          
          // Remove the filtered class and indicators
          tweetElement.classList.remove('llm-filtered');
          if (filterIndicator) filterIndicator.remove();
          if (minimizeButton) minimizeButton.remove();
          if (whitelistButton) whitelistButton.remove();
        }, 1500);
      } else {
        // Already in whitelist
        whitelistButton.textContent = '✓ Already in Whitelist';
      }
    } catch (error) {
      console.error('Error adding to whitelist:', error);
      whitelistButton.textContent = '❌ Error';
      whitelistButton.style.backgroundColor = 'rgba(244, 33, 46, 0.9)'; // Red
    }
  });
  
  // Prevent like buttons from auto-minimizing the tweet
  const likeButtons = tweetElement.querySelectorAll('button[data-testid="like"], button[data-testid="unlike"]');
  likeButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent the tweet's click handler from firing
    }, true);
  });
}

// Function to evaluate a tweet using the configured LLM

async function evaluateTweetWithLLM(tweetElement, config) {
  // Force image loading by triggering a layout calculation
  // This might help with loading lazy-loaded images before extraction
  tweetElement.getBoundingClientRect();
  
  // Extract all content from the tweet
  const tweetContent = extractTweetContent(tweetElement);
  
  // Get author name for response parsing
  const tweetAuthor = tweetContent.author.name || 'Unknown';
  
  // Check if the author is in the whitelist
  const whitelist = config.filterSettings.whitelist || [];
  const filterMode = config.filterSettings.filterMode || "normal";
  const authorHandle = tweetContent.author.handle.toLowerCase().replace('@', '');
  const isWhitelisted = whitelist.some(handle => handle.toLowerCase().replace('@', '') === authorHandle);
  
  // Handle whitelist modes
  if (isWhitelisted && filterMode === "whitelist-bypass") {
    // Always show whitelisted account tweets
    return true;
  }
  
  if (filterMode === "whitelist-only") {
    // In whitelist-only mode, only show tweets from whitelisted accounts
    return isWhitelisted;
  }
  
  // Apply automatic filters if configured
  if (shouldAutoFilter(tweetContent, config)) {
    return false; // Automatically filter out based on content type
  }
  
  // For empty tweets (no text, images, or video), allow through
  if (tweetContent.contentType === 'empty') {
    return true;
  }
  
  try {
    // If author is whitelisted in normal mode, bypass LLM check
    if (isWhitelisted && filterMode === "normal") {
      return true;
    }
    
    // Check if multimodal model is being used
    const isMultimodal = isMultimodalModel(config.apiSettings.model);
    
    // Process images if this is a multimodal-enabled model and tweet has images
    if (isMultimodal && 
        (tweetContent.hasImages || (tweetContent.hasVideo && tweetContent.videoThumbnail))) {
      
      // Convert images to base64
      if (tweetContent.hasImages) {
        let hasImageProcessingFailure = false;
        const base64Images = [];
        
        for (const url of tweetContent.images) {
          try {
            const base64Image = await getImageAsBase64(url);
            if (base64Image !== null) {
              base64Images.push(base64Image);
            } else {
              hasImageProcessingFailure = true;
              console.log(`Failed to process image: ${url}`);
            }
          } catch (err) {
            hasImageProcessingFailure = true;
            console.log(`Error processing image: ${url}`, err);
          }
        }
        
        tweetContent.images = base64Images;
        
        // If we have image failures and no successfully processed images, reject the tweet
        if (hasImageProcessingFailure && base64Images.length === 0) {
          console.log(`${logPrefix} Rejecting tweet due to complete image processing failure`);
          return false; // Hide the tweet
        }
      }
      
      // Convert video thumbnail to base64 if available
      if (tweetContent.hasVideo && tweetContent.videoThumbnail && 
          tweetContent.videoThumbnail !== "VIDEO_WITHOUT_THUMBNAIL") {
        try {
          const base64Thumbnail = await getImageAsBase64(tweetContent.videoThumbnail);
          if (base64Thumbnail !== null) {
            tweetContent.videoThumbnail = base64Thumbnail;
          } else {
            console.log(`Failed to process video thumbnail: ${tweetContent.videoThumbnail}`);
            
            // If this tweet's only media was a video and the thumbnail failed, reject it
            if (!tweetContent.hasImages || tweetContent.images.length === 0) {
              console.log(`${logPrefix} Rejecting tweet due to video thumbnail processing failure`);
              return false; // Hide the tweet
            }
            
            tweetContent.videoThumbnail = "VIDEO_WITHOUT_THUMBNAIL";
          }
        } catch (err) {
          console.log(`Error processing video thumbnail: ${tweetContent.videoThumbnail}`, err);
          
          // If this tweet's only media was a video and the thumbnail failed, reject it
          if (!tweetContent.hasImages || tweetContent.images.length === 0) {
            console.log(`${logPrefix} Rejecting tweet due to video thumbnail processing failure`);
            return false; // Hide the tweet
          }
          
          tweetContent.videoThumbnail = "VIDEO_WITHOUT_THUMBNAIL";
        }
      }
    }
    
    // Send message to background script to make the API call
    const response = await chrome.runtime.sendMessage({
      type: 'llmApiRequest',
      data: {
        provider: config.apiSettings.provider,
        apiKey: config.apiSettings.apiKey,
        model: config.apiSettings.model,
        prompt: config.filterSettings.prompt,
        tweetContent: tweetContent
      }
    });
    
    if (!response || !response.success) {
      console.log(`${logPrefix} API request failed:`, response?.error || 'Unknown error');
      return false; // Default to hiding tweet on error
    }
    
    // Parse response - looking for YES/NO
    return parseResponse(response.data, tweetAuthor);
  } catch (error) {
    console.error('Error in evaluateTweetWithLLM:', error);
    return false; // Default to hiding tweet on error
  }
}

// Determine if a tweet should be automatically filtered based on content type
function shouldAutoFilter(tweetContent, config) {
  // Check for auto-filtering settings
  const filterSettings = config.filterSettings || {};
  
  // Auto-filter image-only tweets if configured
  if (filterSettings.filterImageOnly && tweetContent.contentType === 'image_only') {
    return true;
  }
  
  // Auto-filter video-only tweets if configured
  if (filterSettings.filterVideoOnly && tweetContent.contentType === 'video_only') {
    return true;
  }
  
  // Auto-filter all media-only posts (no text)
  if (filterSettings.filterAllMediaOnly && 
      (tweetContent.contentType === 'image_only' || tweetContent.contentType === 'video_only')) {
    return true;
  }
  
  return false;
}

// Check if a model supports multimodal inputs
function isMultimodalModel(model) {
  // List of multimodal-capable models
  const multimodalModels = [
    // OpenAI models
    'gpt-4-vision', 'gpt-4o', 'gpt-4o-mini',
    // Claude models
    'claude-3', 'claude-3-5', 'claude-3-7'
  ];
  
  // Check if model name contains any of the multimodal model strings
  return multimodalModels.some(mmModel => model.includes(mmModel));
}






// Parse the LLM response to determine if the tweet should be shown
function parseResponse(response, tweetAuthor = 'Unknown') {
  if (!response) {
    return true; // Default to showing tweet if no response
  }
  
  // Convert to lowercase and trim for consistent comparison
  const normalizedResponse = response.toLowerCase().trim();
  
  // Check for various forms of "no"
  if (normalizedResponse.includes('no') || 
      normalizedResponse === 'n' || 
      normalizedResponse === 'false' || 
      normalizedResponse === '0') {
    return false;
  }
  
  // Check for explicit yes
  if (normalizedResponse.includes('yes') || 
      normalizedResponse === 'y' || 
      normalizedResponse === 'true' || 
      normalizedResponse === '1') {
    return true;
  }
  
  // Default to showing the tweet if we're uncertain
  return true;
}


// Extract all content from a tweet element
function extractTweetContent(tweetElement) {
  // Get basic text content
  const tweetText = extractTweetText(tweetElement);

  // Get author information
  const authorInfo = extractAuthorInfo(tweetElement);
  const authorName = authorInfo.name || "Unknown";

  // Get images
  const images = extractTweetImages(tweetElement);

  // Get video thumbnail if available
  const videoThumbnail = extractVideoThumbnail(tweetElement);

  // Determine tweet content type
  const contentType = determineTweetType(tweetText, images, videoThumbnail, authorName);

  return {
    text: tweetText,
    author: authorInfo,
    images: images,
    videoThumbnail: videoThumbnail,
    contentType: contentType,
    hasText: tweetText.trim().length > 0,
    hasImages: images.length > 0,
    hasVideo: videoThumbnail !== null
  };
}

// Extract author information from a tweet
function extractAuthorInfo(tweetElement) {
  const authorElement = tweetElement.querySelector('[data-testid="User-Name"]');
  if (!authorElement) return { name: 'Unknown', handle: '', verified: false };

  // Get user name (first child element)
  const nameElement = authorElement.querySelector('div:first-child');
  const name = nameElement ? nameElement.textContent.trim() : 'Unknown';

  // Get handle (in second child element)
  const handleElement = authorElement.querySelector('div:nth-child(2) > div:first-child > div:first-child');
  const handle = handleElement ? handleElement.textContent.trim() : '';

  // Check if verified (look for verified icon)
  const verifiedBadge = authorElement.querySelector('svg[aria-label="Verified account"], svg[data-testid="icon-verified"]');
  const verified = !!verifiedBadge;

  return { name, handle, verified };
}

// Extract images from a tweet
function extractTweetImages(tweetElement) {
  const images = [];
  
  // Force layout calculation to ensure images are loaded
  tweetElement.getBoundingClientRect();
  
  // Try using multiple selectors to find image elements
  // We use a more aggressive approach to catch all possible images
  
  // Method 1: Standard way - Find tweetPhoto containers
  const imageContainers = tweetElement.querySelectorAll('div[data-testid="tweetPhoto"]');

  imageContainers.forEach((container, index) => {
    const img = container.querySelector('img[src*="https"]');
    if (img && img.src) {
      // Get the highest resolution version by removing size constraints
      let highResUrl = img.src;

      // Twitter image URLs often end with ?format=jpg&name=small
      // We want to get the original size when possible
      if (highResUrl.includes('?')) {
        // Extract base URL without query parameters
        const baseUrl = highResUrl.split('?')[0];
        // Add back format but request original size
        highResUrl = `${baseUrl}?format=jpg&name=orig`;
      }

      images.push(highResUrl);
    }
  });
  
  // Method 2: Look for any images in the tweet that might be media
  const allImages = tweetElement.querySelectorAll('img[src*="https"][src*="media"]');
  
  allImages.forEach((img, index) => {
    if (img && img.src && !images.some(url => url.includes(img.src))) {
      let highResUrl = img.src;
      if (highResUrl.includes('?')) {
        const baseUrl = highResUrl.split('?')[0];
        highResUrl = `${baseUrl}?format=jpg&name=orig`;
      }
      images.push(highResUrl);
    }
  });
  
  // Method 3: Look for any div that might be an image container
  const possibleContainers = tweetElement.querySelectorAll('div[aria-label*="Image"]');
  
  possibleContainers.forEach((container, index) => {
    const img = container.querySelector('img[src*="https"]');
    if (img && img.src && !images.some(url => url.includes(img.src))) {
      let highResUrl = img.src;
      if (highResUrl.includes('?')) {
        const baseUrl = highResUrl.split('?')[0];
        highResUrl = `${baseUrl}?format=jpg&name=orig`;
      }
      images.push(highResUrl);
    }
  });
  
  // Method 4: Look for any img with width/height that might be a media image
  const largeImages = Array.from(tweetElement.querySelectorAll('img'))
    .filter(img => img.width > 100 && img.height > 100 && img.src.includes('https'));
  
  largeImages.forEach((img, index) => {
    if (img && img.src && !images.some(url => url.includes(img.src))) {
      let highResUrl = img.src;
      if (highResUrl.includes('?')) {
        const baseUrl = highResUrl.split('?')[0];
        highResUrl = `${baseUrl}?format=jpg&name=orig`;
      }
      images.push(highResUrl);
    }
  });
  
  return images;
}

// Extract video thumbnail from a tweet (if present)
function extractVideoThumbnail(tweetElement) {
  // Check for video player
  const videoContainer = tweetElement.querySelector('div[data-testid="videoPlayer"]');
  if (!videoContainer) {
    // Try alternative video detection (X sometimes changes their DOM structure)
    const alternateVideoContainers = tweetElement.querySelectorAll('div[aria-label*="Video"]');
    if (alternateVideoContainers.length > 0) {
      // Try to find a poster image in any of them
      for (const container of alternateVideoContainers) {
        const img = container.querySelector('img[src*="https"]');
        if (img && img.src) {
          return img.src;
        }
      }
      
      // If we found video containers but no thumbnails
      return "VIDEO_WITHOUT_THUMBNAIL";
    }
    
    return null;
  }

  // Try to find the poster/thumbnail image
  const posterImage = videoContainer.querySelector('img[src*="https"]');
  if (posterImage && posterImage.src) {
    return posterImage.src;
  }

  // Fallback method - look for any image inside the video container
  const anyImage = videoContainer.querySelector('img[src*="https"]');
  if (anyImage && anyImage.src) {
    return anyImage.src;
  }

  // If we found a video but no thumbnail, return a placeholder
  return videoContainer ? "VIDEO_WITHOUT_THUMBNAIL" : null;
}

// Determine the type of the tweet based on content
function determineTweetType(text, images, videoThumbnail, authorName = "Unknown") {
  const hasText = text.trim().length > 0;
  const hasImages = images.length > 0;
  const hasVideo = videoThumbnail !== null;

  let contentType;
  if (hasVideo) {
    contentType = hasText ? 'text_and_video' : 'video_only';
  } else if (hasImages) {
    contentType = hasText ? 'text_and_images' : 'image_only';
  } else {
    contentType = hasText ? 'text_only' : 'empty';
  }
  
  return contentType;
}

// Convert image URL to base64 data URL for API submission
async function getImageAsBase64(url) {
  try {
    // Send message to background script to fetch the image
    // This avoids CORS issues
    const response = await chrome.runtime.sendMessage({
      type: 'fetchImage',
      data: { url }
    });

    if (response && response.success) {
      return response.data;
    }

    throw new Error(response?.error || 'Failed to convert image to base64');
  } catch (error) {
    console.error('Error converting image to base64:', error);
    return null;
  }
}
