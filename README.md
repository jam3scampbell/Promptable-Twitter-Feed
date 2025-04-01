<h1>Promptable-Twitter-Feed</h1>

A Chrome extension that sends all incoming tweets through an LLM before displaying them on your feed. Built on top of BlueRaven.

---

## What you get

- **Your feed, your rules**: Write custom prompts like "only show me tweets with actionable advice" or "filter out political hot takes" - the AI follows your instructions
- **Skip the fluff**: Tell it to hide thirst traps, memes without substance, rage bait, and other time-wasters
- **The good stuff rises**: Let interesting ideas, useful information, and thoughtful takes bubble to the top
- **Image awareness**: It actually "sees" the images too, not just text (with multimodal models)
- **Keep your favs**: Whitelist accounts you always want to see, no matter what


---

## Get started in 2 minutes

### Chrome/Edge
1. Clone the repo
2. Hit up `chrome://extensions/`
3. Flip on "Developer mode"
4. Click "Load unpacked" and point to the folder
5. Pin the extension to your toolbar

### Firefox
1. Visit `about:debugging#/runtime/this-firefox`
2. Load temporary add-on
3. Navigate to the `firefox` folder and select `manifest.json`

For permanent Firefox install, check Mozilla's [instructions on unsigned extensions](https://wiki.mozilla.org/Add-ons/Extension_Signing#Unbranded_Builds).

---

## Setting up your filter

First thing: **you need your own API key** from OpenAI or Anthropic.

Click the extension icon and enable "LLM Tweet Filtering" to reveal all the options:

### The essentials

- Pick your **LLM Provider** (OpenAI or Anthropic)
- Paste your **API Key**
- Choose your **Model** (cheaper/faster vs. smarter/costlier)
- Write your **Filter Prompt** - Instruct the model to respond YES to keep the tweet and NO to filter it.

### Fine-tuning options

- **Timeline Types**: Apply to For You, Following, or both?
- **Auto-filter media-only tweets**: Skip tweets that are just an image or video with no text
- **Display option**: Completely hide filtered tweets or show them minimized
- **Whitelist**: Add accounts you never want filtered out

Promptable-Twitter-Feed also keeps all the BlueRaven quality-of-life improvements.
