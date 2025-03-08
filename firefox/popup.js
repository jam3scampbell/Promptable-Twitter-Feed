const browserAPI = browser;

console.log('Popup script starting...');
console.log('TWITTER_MODS:', typeof TWITTER_MODS !== 'undefined' ? TWITTER_MODS : 'Not loaded');

document.addEventListener('DOMContentLoaded', async () => {
  const settingsDiv = document.getElementById('settings');

  try {
    const { settings } = await browserAPI.storage.local.get('settings');
    console.log('Retrieved settings:', settings);

    // Section order and titles
    const sections = [
      { id: 'buttonColors', title: 'Button Colors' },
      { id: 'replaceElements', title: 'UI Elements' },
      { id: 'styleFixes', title: 'Style Fixes' },
      {
        id: 'hideElements',
        title: 'Grok',
        filter: key => key === 'grok'
      },
      { 
        id: 'hideElements', 
        title: 'Side Tabs',
        filter: key => ['allTabs',
                        'communities',
                        'premium',
                        'home',
                        'lists',
                        'bookmarks',
                        'profile',
                        'jobs',
                        'articles',
                        'explore',
                        'notifications',
                        'messages',
                        'business',
                        'communityNotes',
                        'moreMenu'].includes(key)
      },
      {
        id: 'hideElements',
        title: 'Elements',
        filter: key => ['leftSidebar',
                        'rightSidebar',
                        'bothSidebars',
                        'trending',
                        'brokenSpacer',
                        'hidePremiumBadge',
                        'messageDrawer',
                        'shareButton',
                        'moreButton',
                        'socialContext',
                        'accountSuggestions',
                        'trendingNews',
                        'newPostsBanner'].includes(key)
      },
      {
        id: 'hideElements',
        title: 'User Info',
        filter: key => ['userAvatar',
                        'userName',
                        'userHandle',
                        'userNameAndHandle',
                        'userInfo'].includes(key)
      },
      {
        id: 'hideElements',
        title: 'Engagement Metrics',
        filter: key => ['replyCounts',
                        'retweetCounts',
                        'likeCounts',
                        'viewCounts',
                        'bookmarkCounts',
                        'shareCounts'].includes(key)
      },
      { id: 'llmFiltering', title: 'LLM Filtering' }
    ];

    // Create sections in order
    sections.forEach(({ id, title, filter }) => {
      if (id === 'llmFiltering') {
        // Skip LLM here, it's handled separately
        return;
      }
      
      if (TWITTER_MODS[id]) {
        const sectionDiv = document.createElement('div');

        // Add section title
        const titleDiv = document.createElement('div');
        titleDiv.className = 'section-title';
        titleDiv.textContent = title;
        sectionDiv.appendChild(titleDiv);

        // Add section content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'mod-section';

        // Add toggles for each sub-setting
        Object.entries(TWITTER_MODS[id]).forEach(([key, config]) => {
          // Skip if there's a filter and this key doesn't match
          if (filter && !filter(key)) return;
          
          // For replaceElements, skip any entry that has a parent property
          if (id === 'replaceElements' && config.parent) {
            return;
          }

          if (typeof config === 'object' && 'enabled' in config) {
            const item = createToggle(
              `${id}-${key}`,
              config.description,
              settings?.[id]?.[key]?.enabled ?? config.enabled,
              (checked) => updateSetting(id, key, checked)
            );
            contentDiv.appendChild(item);
          }
        });

        sectionDiv.appendChild(contentDiv);
        settingsDiv.appendChild(sectionDiv);
      }
    });
    
    // Initialize LLM filtering UI
    initializeLLMFilteringUI();
  } catch (error) {
    console.error('Error in popup initialization:', error);
  }
});

function createToggle(id, label, checked, onChange) {
  const div = document.createElement('div');
  div.className = 'mod-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  checkbox.checked = checked;
  checkbox.addEventListener('change', (e) => onChange(e.target.checked));

  const labelElement = document.createElement('label');
  labelElement.htmlFor = id;
  labelElement.textContent = label;

  div.appendChild(checkbox);
  div.appendChild(labelElement);
  return div;
}

async function updateSetting(modType, key, value) {
  try {
    console.log(`Updating setting: ${modType}.${key} = ${value}`);
    const { settings = {} } = await browserAPI.storage.local.get('settings');

    if (!settings[modType]) settings[modType] = {};
    if (!settings[modType][key]) settings[modType][key] = {};
    settings[modType][key].enabled = value;

    // If this is a parent in replaceElements, update any children as well
    if (modType === 'replaceElements') {
      const children = Object.entries(TWITTER_MODS.replaceElements)
        .filter(([childKey, childConfig]) => childConfig.parent === key)
        .map(([childKey]) => childKey);

      children.forEach(childKey => {
        if (!settings[modType][childKey]) settings[modType][childKey] = {};
        settings[modType][childKey].enabled = value;
      });
    }

    console.log('New settings:', settings);
    await browserAPI.storage.local.set({ settings });

    // Notify content scripts to refresh
    const tabs = await browserAPI.tabs.query({ url: ['*://twitter.com/*', '*://x.com/*'] });
    console.log('Found tabs to update:', tabs);

    const updatePromises = tabs.map(tab =>
      browserAPI.tabs.sendMessage(tab.id, {
        type: 'refreshTheme',
        modType,
        key,
        value
      }).catch(err => console.error(`Failed to update tab ${tab.id}:`, err))
    );

    // If modType is replaceElements, also send messages for its children
    if (modType === 'replaceElements') {
      const children = Object.entries(TWITTER_MODS.replaceElements)
        .filter(([childKey, childConfig]) => childConfig.parent === key)
        .map(([childKey]) => childKey);

      children.forEach(childKey => {
        tabs.forEach(tab => {
          updatePromises.push(
            browserAPI.tabs.sendMessage(tab.id, {
              type: 'refreshTheme',
              modType,
              key: childKey,
              value
            }).catch(err => console.error(`Failed to update tab ${tab.id}:`, err))
          );
        });
      });
    }

    await Promise.all(updatePromises);

    // Visual feedback
    const checkbox = document.getElementById(`${modType}-${key}`);
    if (checkbox) {
      checkbox.classList.add('updated');
      setTimeout(() => checkbox.classList.remove('updated'), 500);
    }
  } catch (error) {
    console.error('Failed to update setting:', error);
    alert('Failed to update setting. Check console for details.');
  }
}

// Function to initialize LLM filtering UI
function initializeLLMFilteringUI() {
  const settingsDiv = document.getElementById('settings');
  
  // Add LLM filtering template to the page
  const templateContent = document.getElementById('llm-ui-template').innerHTML;
  const llmSection = document.createElement('div');
  llmSection.innerHTML = templateContent;
  settingsDiv.appendChild(llmSection);
  
  // Get LLM filtering settings from storage
  browserAPI.storage.local.get('settings', ({ settings = {} }) => {
    const llmSettings = settings.llmFiltering || TWITTER_MODS.llmFiltering;
    
    // Initialize checkbox state
    const enabledCheckbox = document.getElementById('llmFiltering-enabled');
    enabledCheckbox.checked = llmSettings.enabled || false;
    
    // Show/hide config section based on enabled state
    const configSection = document.getElementById('llm-config-section');
    configSection.style.display = enabledCheckbox.checked ? 'block' : 'none';
    
    // Initialize form values
    if (llmSettings.apiSettings) {
      document.getElementById('llm-provider').value = llmSettings.apiSettings.provider || 'openai';
      document.getElementById('llm-api-key').value = llmSettings.apiSettings.apiKey || '';
      document.getElementById('llm-model').value = llmSettings.apiSettings.model || 'gpt-4o-mini-2024-07-18';
    }
    
    if (llmSettings.filterSettings) {
      document.getElementById('llm-prompt').value = llmSettings.filterSettings.prompt || '';
      document.getElementById('cache-results').checked = llmSettings.filterSettings.cacheResults !== false;
      
      const timelineTypes = llmSettings.filterSettings.filterTimelineTypes || ['for-you'];
      document.getElementById('filter-for-you').checked = timelineTypes.includes('for-you');
      document.getElementById('filter-following').checked = timelineTypes.includes('following');
    }
    
    // Set up event listeners
    enabledCheckbox.addEventListener('change', (e) => {
      configSection.style.display = e.target.checked ? 'block' : 'none';
      updateLLMSettings();
    });
    
    // Toggle API key visibility
    const toggleVisibilityBtn = document.querySelector('.toggle-visibility');
    toggleVisibilityBtn.addEventListener('click', () => {
      const apiKeyInput = document.getElementById('llm-api-key');
      if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleVisibilityBtn.textContent = '🔒';
      } else {
        apiKeyInput.type = 'password';
        toggleVisibilityBtn.textContent = '👁️';
      }
    });
    
    // Update provider-specific model options when provider changes
    document.getElementById('llm-provider').addEventListener('change', (e) => {
      const modelSelect = document.getElementById('llm-model');
      modelSelect.innerHTML = '';
      
      if (e.target.value === 'openai') {
        addOption(modelSelect, 'gpt-4o-mini-2024-07-18', 'GPT-4o Mini');
        addOption(modelSelect, 'gpt-4o', 'GPT-4o');
      } else if (e.target.value === 'anthropic') {
        addOption(modelSelect, 'claude-3-7-sonnet-latest', 'Claude 3.7 Sonnet');
        addOption(modelSelect, 'claude-3-5-latest', 'Claude 3.5 Haiku');
      }
    });
    
    // Save button
    document.getElementById('save-llm-config').addEventListener('click', () => {
      updateLLMSettings();
      
      // Show success message
      const apiStatus = document.getElementById('api-status');
      apiStatus.textContent = 'Configuration saved!';
      apiStatus.className = 'api-status success';
      
      setTimeout(() => {
        apiStatus.textContent = '';
        apiStatus.className = 'api-status';
      }, 3000);
    });
    
    // Handle changes to other form elements
    const formElements = configSection.querySelectorAll('input, select, textarea');
    formElements.forEach(element => {
      if (element.id !== 'llmFiltering-enabled') {
        element.addEventListener('change', updateLLMSettings);
      }
    });
  });
}

// Helper function to add options to select elements
function addOption(selectElement, value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  selectElement.appendChild(option);
}

// Function to update LLM settings in storage
function updateLLMSettings() {
  browserAPI.storage.local.get('settings', ({ settings = {} }) => {
    if (!settings.llmFiltering) {
      settings.llmFiltering = {};
    }
    
    // Update enabled state
    settings.llmFiltering.enabled = document.getElementById('llmFiltering-enabled').checked;
    
    // Update API settings
    settings.llmFiltering.apiSettings = {
      provider: document.getElementById('llm-provider').value,
      apiKey: document.getElementById('llm-api-key').value,
      model: document.getElementById('llm-model').value,
      maxTokens: 100 // Fixed value for now
    };
    
    // Update filter settings
    const timelineTypes = [];
    if (document.getElementById('filter-for-you').checked) timelineTypes.push('for-you');
    if (document.getElementById('filter-following').checked) timelineTypes.push('following');
    
    settings.llmFiltering.filterSettings = {
      prompt: document.getElementById('llm-prompt').value,
      cacheResults: document.getElementById('cache-results').checked,
      filterTimelineTypes: timelineTypes
    };
    
    // Save settings
    browserAPI.storage.local.set({ settings }, () => {
      // Notify tabs to update
      browserAPI.tabs.query({ url: ['*://twitter.com/*', '*://x.com/*'] }, (tabs) => {
        tabs.forEach(tab => {
          browserAPI.tabs.sendMessage(tab.id, {
            type: 'refreshTheme',
            modType: 'llmFiltering'
          }).catch(err => console.error(`Failed to update tab ${tab.id}:`, err));
        });
      });
    });
  });
}
