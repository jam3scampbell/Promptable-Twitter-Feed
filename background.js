chrome.runtime.onInstalled.addListener(async () => {
  try {
    // Clear old settings
    await chrome.storage.sync.clear();

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
          filterTimelineTypes: ["for-you"]
        }
      }
    };

    await chrome.storage.sync.set({ settings: defaultSettings });
  } catch (error) {
    console.error('Failed to initialize settings:', error);
  }
});

// Update the message listener to use new settings format
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle theme refresh requests
  if (message.type === 'refreshTheme') {
    // Notify content script to update theme
    chrome.tabs.query({ url: ['*://twitter.com/*', '*://x.com/*'] }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'refreshTheme' });
      });
    });
    return true; // Keep message channel open for async response
  }
  
  // Handle LLM API requests (new functionality)
  if (message.type === 'llmApiRequest') {
    handleLLMApiRequest(message.data)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message || 'Unknown error in API request' 
      }));
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

// Updated Anthropic API function for the background script
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
