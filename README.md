# Basora - Docs to README

Basora - Docs to README is a Manifest V3 Chrome extension for collecting documentation pages into one Markdown file.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.

The supplied Basora logo and Chrome icon sizes are bundled under `assets/` and are included automatically when the folder is loaded.

## Use

1. Open the first documentation page and click the extension icon.
2. Choose an output filename, then click **Start session**.
3. Click **Capture page** for each page. Sessions accept unlimited unique pages until you end the session. **Open next page** detects common `rel="next"`, “Next”, and “Next page” links and opens the following page; reopen the popup (or use the sticky panel) to capture it.
4. Click **End & download**. The assembled Markdown is saved with the chosen filename.

Images and inline SVG diagrams are preserved as tokenized media. When accessible image assets can be localized, Basora downloads a ZIP containing the Markdown file and an `assets/` folder; failed image fetches remain as their original remote links. YouTube, Vimeo, and public HTML5 video references are always kept as links and are never downloaded.

To crawl a documentation sequence automatically, start a session, open its first page, and click **Start auto capture**. The background worker captures each page, follows detected next links with a randomized 1–3 second pause, waits for each page to load, and reports progress in the popup or sticky panel. Click **Stop auto capture** at any time; auto capture also stops on cycles, missing next links, tab errors, or when the session ends. It never downloads automatically.

If a site uses a custom next control, click **Choose next button** and then select it on the page. Basora remembers the robust selector per hostname and prefers it for manual and automatic navigation. **Forget chosen button** removes only the current site's saved selector. Picker selection can be cancelled with Escape.

For a persistent capture workflow, click **Open sticky panel** in the popup. Chrome 116+ opens the same interface in the side panel, where it remains available while you move through documentation pages. Close it with Chrome’s panel close button.

The session is stored locally in Chrome storage so it survives page navigation. The extractor prefers `article`, `main`, or `[role="main"]` and removes navigation, scripts, forms, and other page chrome before converting headings, links, lists, code, and paragraphs to Markdown.
