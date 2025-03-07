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
      
      for (const tweetElement of tweetElements) {
        // Skip if we've already processed this tweet
        if (tweetElement.dataset.llmProcessed) continue;
        
        // Mark as processed to avoid duplicate API calls
        tweetElement.dataset.llmProcessed = "pending";
        
        // Try to get from cache first if enabled
        const tweetText = extractTweetText(tweetElement);
        const tweetId = extractTweetId(tweetElement);
        
        if (config.filterSettings.cacheResults && tweetFilterCache.has(tweetId)) {
          const shouldShow = tweetFilterCache.get(tweetId);
          if (!shouldShow) {
            hideTweet(tweetElement);
          }
          continue;
        }
        
        try {
          // Send to LLM for evaluation
          const shouldShow = await evaluateTweetWithLLM(tweetText, config);
          
          // Log the decision with a snippet of the tweet text for debugging
          const tweetPreview = tweetText.length > 50 ? tweetText.substring(0, 50) + '...' : tweetText;
          const authorElement = tweetElement.querySelector('[data-testid="User-Name"]');
          const authorName = authorElement ? authorElement.textContent.trim() : 'Unknown';
          console.log(`LLM Filter: ${shouldShow ? '✅ ALLOWED' : '❌ FILTERED'} tweet by ${authorName}: "${tweetPreview}"`);
          
          // Cache the result
          if (config.filterSettings.cacheResults) {
            tweetFilterCache.set(tweetId, shouldShow);
          }
          
          // Hide tweet if it doesn't pass the filter
          if (!shouldShow) {
            hideTweet(tweetElement);
          }
          
          // Mark as fully processed
          tweetElement.dataset.llmProcessed = "complete";
        } catch (error) {
          console.error("Failed to process tweet with LLM:", error);
          // On error, show the tweet (fail open)
          tweetElement.dataset.llmProcessed = "error";
        }
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

// Hide a tweet that doesn't pass the filter
function hideTweet(tweetElement) {
  // Store original display value for potential toggling in debug mode
  tweetElement.dataset.originalDisplay = tweetElement.style.display || '';
  
  // Instead of completely hiding, make it compact with a visual indicator
  // This makes it easier to see which tweets were filtered
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
  
  // Add click handler to toggle visibility (for debug purposes)
  tweetElement.addEventListener('click', (e) => {
    if (tweetElement.style.maxHeight === '40px') {
      tweetElement.style.maxHeight = 'none';
      tweetElement.style.opacity = '0.8';
      filterIndicator.textContent = '🤖 Filtered (tap to collapse)';
      filterIndicator.style.backgroundColor = 'rgba(29, 155, 240, 0.9)';
      e.stopPropagation(); // Prevent tweet interaction
    } else {
      tweetElement.style.maxHeight = '40px';
      tweetElement.style.opacity = '0.5';
      filterIndicator.textContent = '🤖 Filtered';
    }
  }, true);
}

// Function to evaluate a tweet using the configured LLM
async function evaluateTweetWithLLM(tweetText, config) {
  if (!tweetText || tweetText.trim() === '') {
    return true; // Allow empty tweets through
  }
  
  try {
    // Send message to background script to make the API call
    const response = await chrome.runtime.sendMessage({
      type: 'llmApiRequest',
      data: {
        provider: config.apiSettings.provider,
        apiKey: config.apiSettings.apiKey,
        model: config.apiSettings.model,
        prompt: config.filterSettings.prompt,
        tweetText: tweetText
      }
    });
    
    if (!response || !response.success) {
      console.error('LLM API request failed:', response?.error || 'Unknown error');
      return true; // Default to showing tweet on error
    }
    
    // Parse response - looking for YES/NO
    return parseResponse(response.data);
  } catch (error) {
    console.error('Error in evaluateTweetWithLLM:', error);
    return true; // Default to showing tweet on error
  }
}

// Parse the LLM response to determine if the tweet should be shown
function parseResponse(response) {
  if (!response) {
    return true;
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
