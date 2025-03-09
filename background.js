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


// Message handler for image fetching requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle image fetch requests (avoiding CORS issues)
  if (message.type === 'fetchImage') {
    fetchAndEncodeImage(message.data.url)
      .then(dataUrl => sendResponse({ success: true, data: dataUrl }))
      .catch(error => sendResponse({
        success: false,
        error: error.message || 'Unknown error fetching image'
      }));
    return true; // Keep message channel open for async response
  }

  // ... existing message handlers ...
});

// Function to fetch an image and convert it to a data URL
async function fetchAndEncodeImage(url) {
  try {
    // Fetch the image
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit', // Avoid sending cookies
      referrerPolicy: 'no-referrer' // Don't send referrer
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    // Convert to blob
    const blob = await response.blob();

    // Convert to base64 data URL
    return await blobToDataURL(blob);
  } catch (error) {
    console.error('Error fetching image:', error);
    throw error;
  }
}

// Helper function to convert blob to data URL
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
    reader.readAsDataURL(blob);
  });
}

// Update OpenAI API call to handle images
async function callOpenAI(apiKey, model, prompt, tweetContent) {
  try {
    // Format the messages array based on content type
    const messages = [
      {
        role: "system",
        content: prompt
      }
    ];

    // Check if the model supports image input
    const supportsImages = [
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-vision'
    ].some(supportedModel => model.includes(supportedModel));

    // For text-only tweets, or non-vision models, just use text
    if (!supportsImages || (!tweetContent.hasImages && !tweetContent.hasVideo)) {
      messages.push({
        role: "user",
        content: formatTextOnlyContent(tweetContent)
      });
    }
    // For tweets with media and vision-capable models
    else {
      messages.push({
        role: "user",
        content: formatMultimodalContent(tweetContent)
      });
    }

    // Make the API request
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
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

// Update Anthropic API call to handle images
async function callAnthropic(apiKey, model, prompt, tweetContent) {
  try {
    // Check if the model supports image input
    const supportsImages = [
      'claude-3', 'claude-3-5', 'claude-3-7'
    ].some(supportedModel => model.includes(supportedModel));

    // Format the message content
    let messages;

    // For text-only tweets or non-vision models, just use text
    if (!supportsImages || (!tweetContent.hasImages && !tweetContent.hasVideo)) {
      messages = [{
        role: "user",
        content: formatTextOnlyContent(tweetContent)
      }];
    }
    // For tweets with media and vision-capable models
    else {
      messages = [{
        role: "user",
        content: formatClaudeMultimodalContent(tweetContent)
      }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model,
        system: prompt,
        messages: messages,
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

// Format text-only content for LLM submission
function formatTextOnlyContent(tweetContent) {
  let content = '';

  // Add author info
  content += `Tweet by: ${tweetContent.author.name}`;
  if (tweetContent.author.handle) {
    content += ` (${tweetContent.author.handle})`;
  }
  if (tweetContent.author.verified) {
    content += ' [Verified]';
  }
  content += '\n\n';

  // Add tweet text
  content += tweetContent.text || '[No text content]';

  // Mention if there are images or videos (even though we're not showing them)
  if (tweetContent.hasImages) {
    content += `\n\n[This tweet contains ${tweetContent.images.length} image(s) that cannot be displayed in this format]`;
  }
  if (tweetContent.hasVideo) {
    content += '\n\n[This tweet contains a video that cannot be displayed in this format]';
  }

  return content;
}

// Format multimodal content for OpenAI
function formatMultimodalContent(tweetContent) {
  // OpenAI uses an array of content parts
  const contentParts = [];

  // Add text part
  let textContent = `Tweet by: ${tweetContent.author.name}`;
  if (tweetContent.author.handle) {
    textContent += ` (${tweetContent.author.handle})`;
  }
  if (tweetContent.author.verified) {
    textContent += ' [Verified]';
  }
  textContent += '\n\n';

  // Add tweet text if available
  if (tweetContent.text) {
    textContent += tweetContent.text;
  } else {
    textContent += '[No text content]';
  }

  contentParts.push({ type: "text", text: textContent });

  // Add images if available
  if (tweetContent.hasImages) {
    tweetContent.images.forEach((imageUrl, index) => {
      if (imageUrl && imageUrl.startsWith('data:')) {
        contentParts.push({
          type: "image_url",
          image_url: { url: imageUrl }
        });
      }
    });
  }

  // Add video thumbnail if available
  if (tweetContent.hasVideo && tweetContent.videoThumbnail && tweetContent.videoThumbnail.startsWith('data:')) {
    contentParts.push({
      type: "image_url",
      image_url: {
        url: tweetContent.videoThumbnail,
        detail: "low"
      }
    });

    // Add note about this being a video thumbnail
    contentParts.push({
      type: "text",
      text: "[Note: This is a thumbnail from a video tweet]"
    });
  }

  return contentParts;
}

// Format multimodal content for Claude
function formatClaudeMultimodalContent(tweetContent) {
  // Claude uses a single content array with mixed types
  const contentParts = [];

  // Add text part
  let textContent = `Tweet by: ${tweetContent.author.name}`;
  if (tweetContent.author.handle) {
    textContent += ` (${tweetContent.author.handle})`;
  }
  if (tweetContent.author.verified) {
    textContent += ' [Verified]';
  }
  textContent += '\n\n';

  // Add tweet text if available
  if (tweetContent.text) {
    textContent += tweetContent.text;
  } else {
    textContent += '[No text content]';
  }

  contentParts.push({ type: "text", text: textContent });

  // Add images if available
  if (tweetContent.hasImages) {
    tweetContent.images.forEach((imageUrl, index) => {
      if (imageUrl && imageUrl.startsWith('data:')) {
        contentParts.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: imageUrl.split(',')[1] }
        });
      }
    });
  }

  // Add video thumbnail if available
  if (tweetContent.hasVideo && tweetContent.videoThumbnail && tweetContent.videoThumbnail.startsWith('data:')) {
    contentParts.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: tweetContent.videoThumbnail.split(',')[1]
      }
    });

    // Add note about this being a video thumbnail
    contentParts.push({
      type: "text",
      text: "[Note: This is a thumbnail from a video tweet]"
    });
  }

  return contentParts;
}

// Update the handleLLMApiRequest function to handle the new content format
async function handleLLMApiRequest(requestData) {
  const { provider, apiKey, model, prompt, tweetContent } = requestData;

  if (!apiKey) {
    throw new Error('API key is required');
  }

  if (provider === 'openai') {
    return await callOpenAI(apiKey, model, prompt, tweetContent);
  } else if (provider === 'anthropic') {
    return await callAnthropic(apiKey, model, prompt, tweetContent);
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}
