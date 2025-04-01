<h1>Promptable-Twitter-Feed</h1>

A Chrome extension that sends all incoming tweets through an LLM before displaying them on your feed. Built on top of BlueRaven.

---

## What you get

- **Your feed, your rules**: Write custom prompts like "only show me tweets with actionable advice" or "filter out political hot takes" - the AI follows your instructions
- **Skip the fluff**: Tell it to hide thirst traps, memes without substance, rage bait, and other time-wasters
- **The good stuff rises**: Let interesting ideas, useful information, and thoughtful takes bubble to the top
- **Image awareness**: It actually "sees" the images too, not just text (with multimodal models)
- **Keep your favs**: Whitelist accounts you always want to see, no matter what

Plus all the original BlueRaven goodies: blue bird icon, "Tweet" instead of "Post," cleaner UI, and other sanity-preserving tweaks.

---

## Get started in 2 minutes

### Chrome/Edge
1. Grab the repo
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

First thing: **you need your own API key** from OpenAI or Anthropic. This isn't free, but a few bucks goes a long way (and isn't your time worth it?).

Click the extension icon and enable "LLM Tweet Filtering" to reveal all the options:

### The essentials

- Pick your **LLM Provider** (OpenAI or Anthropic)
- Paste your **API Key**
- Choose your **Model** (cheaper/faster vs. smarter/costlier)
- Write your **Filter Prompt** - this is where the magic happens!

### Example prompts to try

- "Hide tweets that are low-effort, repetitive, or clearly engagement-bait. Keep informative threads, original insights, or genuinely funny content."
- "I'm interested in tech, science, and thoughtful analysis. Hide political rage bait, doom posting, and shallow takes."
- "Only show me tweets with concrete ideas, specific recommendations, or links to substantial resources. Hide vague inspirational posts."

### Fine-tuning options

- **Timeline Types**: Apply to For You, Following, or both?
- **Auto-filter media-only tweets**: Skip tweets that are just an image or video with no text
- **Display option**: Completely hide filtered tweets or show them minimized
- **Whitelist**: Add accounts you never want filtered out

---

## The other good stuff

Promptable-Twitter-Feed also keeps all the BlueRaven quality-of-life improvements:

- Twitter bird logo instead of that X nonsense
- "Tweet" instead of "Post" (because we're not corporate rebrand enthusiasts)
- Hide Grok or other distractions
- Center the feed for better reading
- Fix badge colors to that sweet Twitter blue

---

## Contribute

Found a bug? Have an idea? PRs welcome!

Just make sure to test on both browsers - Firefox and Chrome/Edge can be finicky.

---

<div align="center">
🩵 Make Twitter tolerable again 🩵
</div>