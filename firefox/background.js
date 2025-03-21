// Firefox-compatible background script
browser.runtime.onInstalled.addListener(() => {
  // Clear old settings
  browser.storage.local.clear().then(() => {
    // Set new default settings
    const defaultSettings = {
      hideElements: {
        sidebar: { enabled: false },
        trending: { enabled: false }
      },
      replaceElements: {
        xLogo: { enabled: false }
      },
      styleFixes: {
        centerLayout: { enabled: false }
      },
      theme: { enabled: false },
      llmFiltering: {
        enabled: false,
        apiSettings: {
          provider: "openai",
          apiKey: "",
          model: "gpt-3.5-turbo",
          maxTokens: 100
        },
        filterSettings: {
          prompt: "Evaluate if this tweet is high quality and informative. Only respond with YES or NO.",
          cacheResults: true,
          filterTimelineTypes: ["for-you"],
          whitelist: [], // Array of account handles to always show
          filterMode: "normal" // "normal", "whitelist-only", "whitelist-bypass"
        }
      }
    };

    return browser.storage.local.set({ settings: defaultSettings });
  }).catch(error => {
    console.error('Failed to initialize settings:', error);
  });
});

// Update the message listener to handle theme refresh and API requests
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'refreshTheme') {
    // Notify content script to update theme
    browser.tabs.query({ url: ['*://twitter.com/*', '*://x.com/*'] }).then(tabs => {
      tabs.forEach(tab => {
        browser.tabs.sendMessage(tab.id, { type: 'refreshTheme' });
      });
    });
    return true;
  }
  
  // Handle LLM API requests
  if (message.type === 'llmApiRequest') {
    handleLLMApiRequest(message.data)
      .then(response => {
        return { success: true, data: response };
      })
      .catch(error => {
        return { 
          success: false, 
          error: error.message || 'Unknown error in API request' 
        };
      })
      .then(sendResponse);
    return true; // Keep message channel open for async response
  }
});

// Function to handle LLM API requests
async function handleLLMApiRequest(requestData) {
  const { provider, apiKey, model, prompt, tweetText } = requestData;
  
  if (!apiKey) {
    throw new Error('API key is required');
  }
  
  if (provider === 'openai') {
    return await callOpenAI(apiKey, model, prompt, tweetText);
  } else if (provider === 'anthropic') {
    return await callAnthropic(apiKey, model, prompt, tweetText);
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Call OpenAI API
async function callOpenAI(apiKey, model, prompt, tweetText) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: prompt
          },
          {
            role: "user",
            content: tweetText
          }
        ],
        max_tokens: 100
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    }
    throw new Error('Invalid API response format');
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
}

// Call Anthropic API
async function callAnthropic(apiKey, model, prompt, tweetText) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true' // Added this required header
      },
      body: JSON.stringify({
        model: model,
        system: prompt,
        messages: [
          {
            role: "user",
            content: tweetText
          }
        ],
        max_tokens: 100
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Anthropic API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    if (data.content && data.content.length > 0) {
      return data.content[0].text;
    }
    throw new Error('Invalid API response format');
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw error;
  }
}
