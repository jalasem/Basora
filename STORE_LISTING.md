# Chrome Web Store listing

## Product details

**Name:** Basora - Docs to README

**Summary:** Capture documentation pages into a clean Markdown README with Basora.

**Category:** Developer Tools

**Language:** English

## Detailed description

Basora turns multi-page documentation into a clean, portable Markdown file.

Start a capture session, collect pages manually or let Basora follow the documentation's Next control, and download the result as a README. When a page includes accessible images, diagrams, or direct public video files, Basora can package them beside the Markdown in an assets folder.

Key features:

- Capture an unlimited number of documentation pages in one session
- Convert headings, links, lists, tables, callouts, inline code, and fenced code blocks to Markdown
- Navigate automatically using a detected or user-chosen Next button
- Choose instant navigation or a custom delay range
- Keep the interface open in Chrome's side panel
- Package accessible images, SVG diagrams, and direct public videos into a ZIP
- Choose a custom Markdown filename
- Process sessions locally without accounts, analytics, advertising, or a developer-operated server

Basora reads pages only when you capture them or start auto-capture. Captured content and settings stay in Chrome's local extension storage until the session ends or the extension data is cleared.

## Privacy practices

**Single purpose:** Convert documentation pages explicitly selected by the user into a downloadable Markdown document and related local media assets.

**Data handled:**

- Website content: page text, structure, links, code, and media references selected for capture
- Web browsing activity: the URLs of documentation pages captured or visited during a user-started automatic crawl

All processing is local. No data is transmitted to the developer, sold, used for advertising, or used for credit-related purposes.

**Privacy policy URL:** https://github.com/jalasem/Basora/blob/main/PRIVACY.md

## Permission justifications

**activeTab:** Accesses the current documentation tab after the user clicks Capture page, Open next page, Choose next button, or Start auto capture.

**scripting:** Runs Basora's bundled extractor and next-button picker in the documentation page. No remotely hosted code is used.

**storage:** Stores the active session, captured pages, site-specific Next selector, and navigation timing preference locally so the workflow survives page navigation.

**downloads:** Saves the user-requested Markdown or ZIP package to the device.

**sidePanel:** Provides the optional sticky Basora workspace while the user navigates documentation.

**Host access (`<all_urls>`):** Allows a user-started automatic crawl to keep extracting content after documentation navigation, including documentation hosted on any domain, and allows referenced public media assets to be fetched for the exported ZIP. Access is used only during an explicit Basora workflow.

## Distribution

- Free
- Public
- All regions
- Recommended first release: deferred publishing after review

## Reviewer test instructions

No account or credentials are required.

1. Install the extension and open https://vuejs.org/guide/essentials/application.html.
2. Open Basora and start a session using the default README filename.
3. Click Capture page and confirm the page count becomes 1.
4. Expand Automatic crawl. The default delay is 1-3 seconds and can be changed to Instant or a custom range.
5. To test the chosen navigation control, click Choose next button and select the page's Next link. Alternatively, click Start auto capture without a saved control and Basora will prompt for it.
6. Stop auto capture after one or more pages.
7. Click End & download. Basora displays a loading indicator and downloads the Markdown or a ZIP when accessible media is present.
8. Open the sticky side panel to confirm the same session interface remains available during navigation.

All captured data remains local to Chrome. No network service, login, payment, or test credential is required.
