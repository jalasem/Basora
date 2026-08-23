# Basora - Docs to README

![Basora logo](assets/basora-logo.png)

Basora is a Chrome extension that turns multi-page documentation into a clean, portable Markdown document. Capture pages as you browse, or let Basora follow a documentation site's **Next** control automatically. When supported media is available, Basora packages the Markdown and local assets together in a ZIP file.

Everything is processed locally in Chrome. Basora has no account system, analytics, advertising, or developer-operated server.

## Features

- Capture any number of unique documentation pages in one session
- Preserve headings, paragraphs, links, lists, tables, callouts, inline code, and fenced code blocks
- Capture pages manually while you navigate at your own pace
- Automatically follow detected or user-selected **Next** controls
- Choose instant navigation or a randomized delay range (1–3 seconds by default)
- Keep Basora open in Chrome's sticky side panel
- Choose a custom Markdown filename
- Package accessible images and SVG diagrams in an `assets/` folder
- Download accessible direct HTML5 video files up to 50 MB each
- Preserve public embedded videos, such as YouTube and Vimeo, as links
- Keep sessions and preferences in local Chrome extension storage

## Install locally

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder—the folder containing `manifest.json`.
6. Pin Basora from Chrome's Extensions menu for easy access.

Basora requires Chrome 116 or newer because its persistent workspace uses the Chrome side panel.

## Capture documentation manually

1. Open the first documentation page you want to save.
2. Open Basora from the Chrome toolbar.
3. Enter an output filename and click **Start session**.
4. Click **Capture page**.
5. Navigate to another page yourself, or click **Open next page**.
6. Repeat capture and navigation for as many pages as you need.
7. Click **End & download** when finished.

There is no page-count setting. A session continues until you end it, and Basora ignores duplicate page URLs.

If the site includes accessible media, Basora downloads a ZIP containing your Markdown file and an `assets/` folder. Otherwise, it downloads the Markdown file directly.

## Capture documentation automatically

1. Start a session on the first documentation page.
2. Expand **Automatic crawl**.
3. Choose a navigation speed:
   - **Wait between pages** uses a configurable randomized delay; the default is 1–3 seconds.
   - **Instant** navigates without an intentional delay.
4. Click **Start auto capture**.

Basora captures the current page, waits for navigation and page content to become ready, then follows the next page. Progress remains visible in the popup or sticky panel. You can click **Stop auto capture** at any time.

Auto capture stops safely when Basora encounters a missing next control, a repeated page, a navigation cycle, a tab error, or the end of the session. It never downloads a result without you clicking **End & download**.

### Choose a site's Next button

Basora detects common next-page links, including `rel="next"`, **Next**, and **Next page**. If a documentation site uses a custom control:

1. Click **Choose next button**.
2. Click the site's next-page control directly on the page.
3. Start auto capture again.

Basora stores a robust selector for that hostname and uses it for both manual and automatic navigation. Press **Escape** to cancel selection. Use **Forget chosen button** to remove the saved selector for the current site.

If you start auto capture without a usable next control, Basora prompts you to choose one instead of failing silently.

## Use the sticky panel

Click **Open sticky panel** to move the Basora interface into Chrome's side panel. Unlike the toolbar popup, the panel stays open while you click and navigate in the page. You can return to popup mode at any time by closing the side panel and opening the extension normally.

## Markdown and media export

Basora prefers the page's `article`, `main`, or `[role="main"]` region. It removes common navigation, scripts, forms, and surrounding page chrome before converting the remaining content to Markdown.

During export:

- Accessible images and inline SVG diagrams are downloaded into `assets/` and their Markdown references are rewritten to local relative paths.
- Direct public HTML5 video files are downloaded when accessible and no larger than 50 MB each.
- Embedded public video providers such as YouTube and Vimeo remain external links.
- Media that cannot be fetched remains linked to its original public URL, so one unavailable asset does not prevent the document from downloading.

Some sites block cross-origin asset downloads or render important content in custom components. Always review the generated Markdown before treating it as an authoritative offline copy.

## Privacy and permissions

Basora reads a page only when you explicitly capture it or start auto capture. Captured pages, selected Next controls, and navigation preferences stay in Chrome's local extension storage. Data is not sent to the developer.

The extension requests:

- `activeTab` and `scripting` to extract the active documentation page and let you select a Next control
- `storage` to preserve the current session and preferences across navigation
- `downloads` to save the Markdown or ZIP package
- `sidePanel` to provide the optional sticky workspace
- `<all_urls>` so user-started capture sessions can work across documentation hosts and fetch referenced public media

See the full [Privacy Policy](PRIVACY.md) for retention and data-handling details.

## Troubleshooting

### “No ‘next’ page link was found”

Use **Choose next button**, then click the correct Next control on the documentation page. Basora remembers it for that hostname.

### “Could not establish connection. Receiving end does not exist.”

The page was probably open before Basora was installed or reloaded. Refresh the documentation tab and try again. Chrome also prevents extensions from running on protected pages such as `chrome://` URLs and the Chrome Web Store.

### Auto capture stops while a page is loading

Keep the tab open and active long enough for the destination page to load. Basora retries while navigation settles, but a site that continuously replaces its content or blocks extension access may still require manual capture.

### A media file is missing from the ZIP

The host may block direct downloads, require authentication, or serve a file larger than Basora's limit. Basora keeps the original remote reference whenever possible.

## Project structure

```text
Basora/
├── manifest.json       # Chrome extension manifest
├── popup.html          # Popup and side-panel interface
├── popup.css           # Responsive extension UI
├── popup.js            # Sessions, extraction, export, and UI logic
├── background.js       # Automatic capture and navigation worker
├── next-picker.js      # In-page Next-control selector
├── panel-mode.js       # Side-panel mode setup
├── zip.js              # Local ZIP writer
├── assets/             # Logo and extension icons
└── store-assets/       # Chrome Web Store promotional artwork
```

Basora is a dependency-free Manifest V3 extension. Changes can be tested by reloading it from `chrome://extensions`, refreshing the documentation tab, and starting a new capture session.

## Chrome Web Store release

The repository includes the public [Privacy Policy](PRIVACY.md) and prepared [store listing copy and reviewer instructions](STORE_LISTING.md). Create an upload ZIP with the runtime files at the archive root—`manifest.json` must not be nested inside another directory—and upload it through the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).

## License

No open-source license has been added yet. Until one is provided, the repository's contents remain under the copyright holder's default rights.
