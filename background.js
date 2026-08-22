let running = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "startAuto") {
    startAutomation()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "stopAuto") {
    stopAutomation()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "saveSelector") {
    saveSelector(message.hostname, message.selector).then(() =>
      sendResponse({ ok: true }),
    );
    return true;
  }
  if (message?.type === "forgetSelector") {
    forgetSelector(message.hostname).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "pickerStatus") {
    handlePickerStatus(message, sender)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function saveSelector(hostname, selector) {
  const { docsToReadmeSelectors: selectors = {} } =
    await chrome.storage.local.get("docsToReadmeSelectors");
  selectors[hostname] = selector;
  await chrome.storage.local.set({ docsToReadmeSelectors: selectors });
}
async function forgetSelector(hostname) {
  const { docsToReadmeSelectors: selectors = {} } =
    await chrome.storage.local.get("docsToReadmeSelectors");
  delete selectors[hostname];
  await chrome.storage.local.set({ docsToReadmeSelectors: selectors });
}
async function handlePickerStatus(message, sender) {
  const url = sender.tab?.url || "";
  if (!/^https?:/i.test(url))
    throw new Error("Picker messages require an HTTP(S) tab.");
  const hostname = new URL(url).hostname;
  const status = {
    status: message.status || "error",
    hostname,
    message: message.message || "",
    updatedAt: Date.now(),
  };
  if (status.status === "selected") {
    if (typeof message.selector !== "string" || !message.selector)
      throw new Error("Picker returned an invalid selector.");
    await saveSelector(hostname, message.selector);
  }
  await chrome.storage.local.set({ docsToReadmePicker: status });
  const { docsToReadmePendingAuto: pending } =
    await chrome.storage.local.get("docsToReadmePendingAuto");
  const matchesPending =
    pending?.tabId === sender.tab?.id && pending?.hostname === hostname;
  if (!matchesPending || status.status === "active") return;
  await chrome.storage.local.remove("docsToReadmePendingAuto");
  if (status.status !== "selected") return;
  await chrome.storage.local.set({
    docsToReadmePicker: {
      ...status,
      message: "Next button saved. Auto capture is starting…",
    },
  });
  await startAutomation(sender.tab);
}

async function startAutomation(preferredTab = null) {
  const {
    docsToReadmeSession: session,
    docsToReadmeAutomation: persistedAutomation,
  } = await chrome.storage.local.get([
    "docsToReadmeSession",
    "docsToReadmeAutomation",
  ]);
  if (running || persistedAutomation?.active)
    throw new Error("Auto capture is already running.");
  if (!session?.active)
    throw new Error("Start a session before starting auto capture.");
  const [tab] = preferredTab
    ? [preferredTab]
    : await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/i.test(tab.url || ""))
    throw new Error("Open an HTTP(S) documentation page first.");
  const runId = crypto.randomUUID();
  running = true;
  await setAutomation({
    active: true,
    runId,
    tabId: tab.id,
    status: "Auto capture starting…",
  });
  runAutomation(runId, tab.id).catch(async (error) => {
    const { docsToReadmeAutomation: current } = await chrome.storage.local.get(
      "docsToReadmeAutomation",
    );
    if (current?.active && current.runId === runId)
      await setAutomation({
        active: false,
        runId,
        status: `Auto capture stopped: ${error.message}`,
      });
    running = false;
  });
}

async function stopAutomation() {
  const { docsToReadmeAutomation: state } = await chrome.storage.local.get(
    "docsToReadmeAutomation",
  );
  if (state?.active)
    await setAutomation({
      ...state,
      active: false,
      status: "Auto capture stopped.",
    });
  running = false;
}
async function setAutomation(value) {
  await chrome.storage.local.set({ docsToReadmeAutomation: value });
}
async function currentState(runId) {
  const { docsToReadmeAutomation: state } = await chrome.storage.local.get(
    "docsToReadmeAutomation",
  );
  if (!state?.active || state.runId !== runId)
    throw new Error("Auto capture stopped.");
  return state;
}
async function runAutomation(runId, tabId) {
  const visitedIdentities = new Set();
  const visitedUrls = new Set();
  while (true) {
    await currentState(runId);
    const tab = await chrome.tabs.get(tabId);
    if (!tab) throw new Error("Documentation tab closed.");
    const selectorStore = await chrome.storage.local.get(
      "docsToReadmeSelectors",
    );
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractAndFindNext,
      args: [
        selectorStore.docsToReadmeSelectors?.[new URL(tab.url).hostname] ||
          null,
      ],
    });
    const [{ result: media }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectMedia,
    });
    result.page.media = media || [];
    result.page.markdown += result.page.media
      .map((x) =>
        x.kind === "video"
          ? `\n\n[Video: ${x.url}](${x.downloadable ? x.token : x.url})`
          : `\n\n![${x.alt || "Image"}](${x.token})`,
      )
      .join("");
    if (!result?.page?.markdown)
      throw new Error("No readable content found on this page.");
    const { docsToReadmeSession: session } = await chrome.storage.local.get(
      "docsToReadmeSession",
    );
    if (!session?.active) throw new Error("Session ended.");
    const identity = pageIdentity(result.page);
    if (visitedIdentities.has(identity))
      throw new Error("Duplicate page detected; auto capture stopped.");
    visitedIdentities.add(identity);
    visitedUrls.add(result.page.url);
    if (!session.pages.some((page) => pageIdentity(page) === identity)) {
      session.pages.push(result.page);
      await chrome.storage.local.set({ docsToReadmeSession: session });
    }
    if (result.clicked) {
      const delay = await getNavigationDelay();
      await setAutomation({
        active: true,
        runId,
        tabId,
        status: `Captured ${session.pages.length} page${session.pages.length === 1 ? "" : "s"}. ${delay ? `Clicking chosen button in ~${formatDelay(delay)}…` : "Clicking chosen button now…"}`,
      });
      if (delay) await wait(delay);
      await currentState(runId);
      const [{ result: clicked }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (selector) => {
          const element = document.querySelector(selector);
          if (!element)
            throw new Error(
              "The chosen next button is no longer on this page.",
            );
          element.click();
          return true;
        },
        args: [result.selector],
      });
      if (!clicked) throw new Error("Unable to click the chosen next button.");
      await waitForNavigationReady(
        tabId,
        result.page.url,
        result.marker,
        runId,
        false,
      );
      continue;
    }
    if (!result.next) {
      await setAutomation({
        active: false,
        runId,
        status: "Auto capture finished: no next page found.",
      });
      running = false;
      return;
    }
    if (visitedUrls.has(result.next))
      throw new Error("Cycle detected; auto capture stopped.");
    const delay = await getNavigationDelay();
    await setAutomation({
      active: true,
      runId,
      tabId,
      status: `Captured ${session.pages.length} page${session.pages.length === 1 ? "" : "s"}. ${delay ? `Opening next page in ~${formatDelay(delay)}…` : "Opening next page now…"}`,
    });
    if (delay) await wait(delay);
    await currentState(runId);
    await chrome.tabs.update(tabId, { url: result.next });
    await waitForNavigationReady(
      tabId,
      result.page.url,
      pageMarker(result.page),
      runId,
      true,
    );
  }
}
function pageIdentity(page) {
  return `${page?.url || ""}\n${page?.title || ""}\n${page?.markdown || ""}`;
}
function pageMarker(page) {
  return `${page?.title || ""}|${(page?.markdown || "").slice(0, 240)}`;
}
function collectMedia() {
  const out = [];
  let i = 0;
  const root =
    document.querySelector('article,main,[role="main"]') || document.body;
  const add = (kind, url, alt, svg, downloadable = false) => {
    if (!url && !svg) return;
    out.push({
      kind,
      url: url || "",
      alt: alt || "",
      svg: svg || "",
      token: `@@BASORA_MEDIA_${i++}@@`,
      downloadable,
    });
  };
  root.querySelectorAll("img").forEach((img) => {
    if (
      (img.naturalWidth &&
        img.naturalWidth < 24 &&
        img.naturalHeight < 24 &&
        !img.alt) ||
      (!img.currentSrc && !img.src)
    )
      return;
    add("image", img.currentSrc || img.src, img.alt, "");
  });
  root.querySelectorAll("svg").forEach((svg) => {
    const text = svg.textContent.trim();
    const label =
      svg.getAttribute("aria-label") || svg.getAttribute("role") === "img";
    if (label || text.length > 40 || svg.getBoundingClientRect().width > 80)
      add(
        "svg",
        "",
        typeof label === "string" ? label : "Diagram",
        new XMLSerializer().serializeToString(svg),
      );
  });
  root
    .querySelectorAll("iframe[src],video source[src],video[src]")
    .forEach((node) => {
      const url = node.src || node.getAttribute("src");
      if (/youtube|youtu\.be|vimeo|\.(mp4|webm|ogg)(\?|$)/i.test(url || ""))
        add("video", url, "", "", node.tagName.toLowerCase() !== "iframe");
    });
  return out;
}
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function getNavigationDelay() {
  const { docsToReadmeTiming: value } =
    await chrome.storage.local.get("docsToReadmeTiming");
  if (value?.mode === "instant") return 0;
  const min = Math.min(60, Math.max(0.5, Number(value?.minSeconds) || 1));
  const max = Math.min(60, Math.max(min, Number(value?.maxSeconds) || 3));
  return Math.round((min + Math.random() * (max - min)) * 1000);
}
function formatDelay(milliseconds) {
  const seconds = milliseconds / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}
async function waitForNavigationReady(
  tabId,
  previousUrl,
  previousMarker,
  runId,
  requireUrlChange,
) {
  const deadline = Date.now() + 45000;
  let lastMarker = "";
  let stable = 0;
  while (Date.now() < deadline) {
    await currentState(runId);
    const tab = await chrome.tabs.get(tabId);
    if (!tab) throw new Error("Documentation tab closed.");
    let sample = null;
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const root =
            document.querySelector('article,main,[role="main"]') ||
            document.body;
          const text = (root?.innerText || "").replace(/\s+/g, " ").trim();
          return {
            ready:
              document.readyState === "interactive" ||
              document.readyState === "complete",
            marker: `${document.title}|${text.slice(0, 400)}`,
            meaningful: text.length >= 80,
          };
        },
      });
      sample = result;
    } catch (_) {
      /* transient navigation injection failure; poll again */
    }
    if (sample?.ready && sample.meaningful) {
      if (sample.marker === lastMarker) stable++;
      else {
        lastMarker = sample.marker;
        stable = 1;
      }
      const urlChanged = Boolean(tab.url && tab.url !== previousUrl);
      const contentChanged = sample.marker !== previousMarker;
      if (stable >= 3 && (requireUrlChange ? urlChanged : contentChanged))
        return;
    }
    await wait(600);
  }
  throw new Error("Timed out waiting for the next page to become ready (45s).");
}

function extractAndFindNext(selector) {
  const root =
    document.querySelector('article,main,[role="main"]') || document.body;
  const clone = root.cloneNode(true);
  clone
    .querySelectorAll(
    'script,style,noscript,nav,header,footer,aside,form,button,[aria-hidden="true"],.header-anchor,.VPDocFooter,.lang',
    )
    .forEach((n) => n.remove());
  clone.querySelector("h1")?.remove();
  const cleanInline = (v) =>
    v
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const inline = (n) => {
    if (n.nodeType === Node.TEXT_NODE) return n.nodeValue;
    if (n.nodeType !== Node.ELEMENT_NODE) return "";
    const t = n.tagName.toLowerCase();
    if (["img", "svg", "video", "iframe"].includes(t)) return "";
    if (t === "br") return "\n";
    const x = [...n.childNodes].map(inline).join("");
    if (t === "a" && n.href)
      return x.trim() ? `[${cleanInline(x)}](${n.href})` : "";
    if (t === "code" && n.parentElement?.tagName.toLowerCase() !== "pre") {
      const code = x.trim();
      const fence = code.includes("`") ? "``" : "`";
      return `${fence}${code}${fence}`;
    }
    if (t === "strong" || t === "b") return `**${cleanInline(x)}**`;
    if (t === "em" || t === "i") return `*${cleanInline(x)}*`;
    if (t === "del" || t === "s") return `~~${cleanInline(x)}~~`;
    return x;
  };
  const list = (n, depth = 0) =>
    [...n.children]
      .filter((x) => x.tagName.toLowerCase() === "li")
      .map((li, i) => {
        const nested = [...li.children].filter((x) =>
          ["ul", "ol"].includes(x.tagName.toLowerCase()),
        );
        const own = [...li.childNodes]
          .filter((x) => !nested.includes(x))
          .map(inline)
          .join("");
        const marker = n.tagName.toLowerCase() === "ol" ? `${i + 1}.` : "-";
        const first = `${"  ".repeat(depth)}${marker} ${cleanInline(own)}`;
        const children = nested.map((x) => list(x, depth + 1)).join("\n");
        return children ? `${first}\n${children}` : first;
      })
      .join("\n");
  const table = (n) => {
    const rows = [...n.querySelectorAll("tr")]
      .map((r) =>
        [...r.children]
          .filter((c) => /^(TH|TD)$/.test(c.tagName))
          .map((c) =>
            cleanInline([...c.childNodes].map(inline).join("")).replace(
              /\|/g,
              "\\|",
            ),
          ),
      )
      .filter((r) => r.length);
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r) => [...r, ...Array(width - r.length).fill("")];
    const header = pad(rows[0]);
    return `| ${header.join(" | ")} |\n| ${header.map(() => "---").join(" | ")} |\n${rows
      .slice(1)
      .map((r) => `| ${pad(r).join(" | ")} |`)
      .join("\n")}\n\n`;
  };
  const block = (n) => {
    if (n.nodeType === Node.TEXT_NODE) return n.nodeValue;
    if (n.nodeType !== Node.ELEMENT_NODE) return "";
    const t = n.tagName.toLowerCase();
    if (/^h[1-6]$/.test(t))
      return `${"#".repeat(Number(t[1]))} ${cleanInline([...n.childNodes].map(inline).join(""))}\n\n`;
    if (t === "pre") {
      const code = (
        n.querySelector("code")?.textContent ||
        n.textContent ||
        ""
      ).replace(/\n$/, "");
      const language =
        n.parentElement?.className.match(/(?:^|\s)language-([\w+-]+)/)?.[1] ||
        "";
      const fence = code.includes("```") ? "````" : "```";
      return `${fence}${language}\n${code}\n${fence}\n\n`;
    }
    if (t === "ul" || t === "ol") return `${list(n)}\n\n`;
    if (t === "table") return table(n);
    if (n.classList.contains("custom-block")) {
      const title = n.querySelector(":scope > .custom-block-title");
      const body = [...n.childNodes]
        .filter((x) => x !== title)
        .map(block)
        .join("")
        .trim();
      const value = `**${cleanInline(title?.textContent || "Note")}**\n\n${body}`;
      return `${value
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`;
    }
    if (t === "blockquote") {
      const value = [...n.childNodes].map(block).join("").trim();
      return `${value
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`;
    }
    if (t === "hr") return "---\n\n";
    if (t === "p")
      return `${cleanInline([...n.childNodes].map(inline).join(""))}\n\n`;
    if (t === "details") {
      const summary = n.querySelector(":scope > summary");
      const body = [...n.childNodes]
        .filter((x) => x !== summary)
        .map(block)
        .join("")
        .trim();
      return `**${cleanInline(summary?.textContent || "Details")}**\n\n${body}\n\n`;
    }
    return [...n.childNodes].map(block).join("");
  };
  const markdown = block(clone)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const page = {
    title:
      document.querySelector("h1")?.innerText.replace(/\u200b/g, "").trim() ||
      document.title.trim(),
    url: location.href,
    markdown,
  };
  const chosen = selector ? document.querySelector(selector) : null;
  if (chosen) {
    if (chosen.href) return { page, next: chosen.href };
    const markerRoot =
      document.querySelector('article,main,[role="main"]') || document.body;
    const marker = `${document.title}|${(markerRoot.innerText || "").replace(/\s+/g, " ").trim().slice(0, 400)}`;
    return { page, clicked: true, selector, marker, next: null };
  }
  const links = [...document.querySelectorAll("a[href]")];
  const candidate =
    links.find((a) => a.rel === "next") ||
    links.find((a) => /^(next|next page|›|→)$/i.test(a.textContent.trim())) ||
    links.find((a) => /\bnext\b/i.test(a.getAttribute("aria-label") || ""));
  return { page, next: candidate?.href || null };
}
