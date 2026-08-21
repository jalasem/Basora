let running = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'startAuto') { startAutomation().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
  if (message?.type === 'stopAuto') { stopAutomation().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
  if (message?.type === 'saveSelector') { saveSelector(message.hostname, message.selector).then(() => sendResponse({ ok: true })); return true; }
  if (message?.type === 'forgetSelector') { forgetSelector(message.hostname).then(() => sendResponse({ ok: true })); return true; }
  if (message?.type === 'pickerStatus') { handlePickerStatus(message, sender).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
});

async function saveSelector(hostname, selector) { const { docsToReadmeSelectors: selectors = {} } = await chrome.storage.local.get('docsToReadmeSelectors'); selectors[hostname] = selector; await chrome.storage.local.set({ docsToReadmeSelectors: selectors }); }
async function forgetSelector(hostname) { const { docsToReadmeSelectors: selectors = {} } = await chrome.storage.local.get('docsToReadmeSelectors'); delete selectors[hostname]; await chrome.storage.local.set({ docsToReadmeSelectors: selectors }); }
async function handlePickerStatus(message, sender) { const url = sender.tab?.url || ''; if (!/^https?:/i.test(url)) throw new Error('Picker messages require an HTTP(S) tab.'); const hostname = new URL(url).hostname; const status = { status: message.status || 'error', hostname, message: message.message || '', updatedAt: Date.now() }; if (status.status === 'selected') { if (typeof message.selector !== 'string' || !message.selector) throw new Error('Picker returned an invalid selector.'); await saveSelector(hostname, message.selector); } await chrome.storage.local.set({ docsToReadmePicker: status }); }

async function startAutomation() {
  const { docsToReadmeSession: session, docsToReadmeAutomation: persistedAutomation } = await chrome.storage.local.get(['docsToReadmeSession', 'docsToReadmeAutomation']);
  if (running || persistedAutomation?.active) throw new Error('Auto capture is already running.');
  if (!session?.active) throw new Error('Start a session before starting auto capture.');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/i.test(tab.url || '')) throw new Error('Open an HTTP(S) documentation page first.');
  const runId = crypto.randomUUID(); running = true;
  await setAutomation({ active: true, runId, tabId: tab.id, status: 'Auto capture starting…' });
  runAutomation(runId, tab.id).catch(async (error) => { const { docsToReadmeAutomation: current } = await chrome.storage.local.get('docsToReadmeAutomation'); if (current?.active && current.runId === runId) await setAutomation({ active: false, runId, status: `Auto capture stopped: ${error.message}` }); running = false; });
}

async function stopAutomation() { const { docsToReadmeAutomation: state } = await chrome.storage.local.get('docsToReadmeAutomation'); if (state?.active) await setAutomation({ ...state, active: false, status: 'Auto capture stopped.' }); running = false; }
async function setAutomation(value) { await chrome.storage.local.set({ docsToReadmeAutomation: value }); }
async function currentState(runId) { const { docsToReadmeAutomation: state } = await chrome.storage.local.get('docsToReadmeAutomation'); if (!state?.active || state.runId !== runId) throw new Error('Auto capture stopped.'); return state; }
async function runAutomation(runId, tabId) {
  const visitedIdentities = new Set(); const visitedUrls = new Set();
  while (true) {
    await currentState(runId);
    const tab = await chrome.tabs.get(tabId); if (!tab) throw new Error('Documentation tab closed.');
    const selectorStore = await chrome.storage.local.get('docsToReadmeSelectors');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: extractAndFindNext, args: [selectorStore.docsToReadmeSelectors?.[new URL(tab.url).hostname] || null] });
    if (!result?.page?.markdown) throw new Error('No readable content found on this page.');
    const { docsToReadmeSession: session } = await chrome.storage.local.get('docsToReadmeSession');
    if (!session?.active) throw new Error('Session ended.');
    const identity = pageIdentity(result.page); if (visitedIdentities.has(identity)) throw new Error('Duplicate page detected; auto capture stopped.');
    visitedIdentities.add(identity); visitedUrls.add(result.page.url);
    if (!session.pages.some((page) => pageIdentity(page) === identity)) { session.pages.push(result.page); await chrome.storage.local.set({ docsToReadmeSession: session }); }
    if (result.clicked) { const delay = Math.floor(Math.random() * 2001) + 1000; await setAutomation({ active: true, runId, tabId, status: `Captured ${session.pages.length} page${session.pages.length === 1 ? '' : 's'}. Clicking chosen button in ~${Math.ceil(delay / 1000)}s…` }); await wait(delay); await currentState(runId); const [{ result: clicked }] = await chrome.scripting.executeScript({ target: { tabId }, func: (selector) => { const element = document.querySelector(selector); if (!element) throw new Error('The chosen next button is no longer on this page.'); element.click(); return true; }, args: [result.selector] }); if (!clicked) throw new Error('Unable to click the chosen next button.'); await waitForPageChange(tabId, result.page.url, result.marker, runId); continue; }
    if (!result.next) { await setAutomation({ active: false, runId, status: 'Auto capture finished: no next page found.' }); running = false; return; }
    if (visitedUrls.has(result.next)) throw new Error('Cycle detected; auto capture stopped.');
    const delay = Math.floor(Math.random() * 2001) + 1000;
    await setAutomation({ active: true, runId, tabId, status: `Captured ${session.pages.length} page${session.pages.length === 1 ? '' : 's'}. Opening next page in ~${Math.ceil(delay / 1000)}s…` });
    await wait(delay); await currentState(runId); await chrome.tabs.update(tabId, { url: result.next }); await waitForLoad(tabId, runId);
  }
}
function pageIdentity(page) { return `${page?.url || ''}\n${page?.title || ''}\n${page?.markdown || ''}`; }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitForPageChange(tabId, previousUrl, previousMarker, runId) { const deadline = Date.now() + 30000; while (Date.now() < deadline) { await currentState(runId); const tab = await chrome.tabs.get(tabId); if (!tab) throw new Error('Documentation tab closed.'); if (tab.url && tab.url !== previousUrl) return; const [{ result: marker }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => `${document.title}|${(document.body?.innerText || '').slice(0, 240)}` }).catch(() => [{ result: null }]); if (marker && marker !== previousMarker) return; await wait(500); } throw new Error('Timed out waiting for the chosen button to advance.'); }
function waitForLoad(tabId, runId) { return new Promise((resolve, reject) => { let done = false; const finish = (error) => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(listener); clearTimeout(timer); error ? reject(error) : resolve(); }; const listener = (id, info) => { if (id === tabId && info.status === 'complete') finish(); }; const timer = setTimeout(() => finish(new Error('Timed out waiting for the next page to load.')), 30000); chrome.tabs.onUpdated.addListener(listener); currentState(runId).catch((error) => finish(error)); }); }

function extractAndFindNext(selector) { const root = document.querySelector('article, main, [role="main"]') || document.body; const clone = root.cloneNode(true); clone.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,[aria-hidden="true"]').forEach((node) => node.remove()); const clean = (value) => value.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); const inline = (node) => { if (node.nodeType === Node.TEXT_NODE) return node.nodeValue; if (node.nodeType !== Node.ELEMENT_NODE) return ''; const tag = node.tagName.toLowerCase(); const text = [...node.childNodes].map(inline).join(''); if (tag === 'a' && node.href) return `[${clean(text)}](${node.href})`; if (tag === 'strong' || tag === 'b') return `**${clean(text)}**`; if (tag === 'em' || tag === 'i') return `*${clean(text)}*`; if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') return `\`${text.trim()}\``; return text; }; const block = (node) => { if (node.nodeType === Node.TEXT_NODE) return node.nodeValue; if (node.nodeType !== Node.ELEMENT_NODE) return ''; const tag = node.tagName.toLowerCase(); if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${clean([...node.childNodes].map(inline).join(''))}\n\n`; if (tag === 'pre') return `\n\n    ${node.innerText.trim().replace(/\n/g, '\n    ')}\n\n`; if (tag === 'li') return `- ${clean([...node.childNodes].map(inline).join(''))}\n`; if (['p','div','section','article','blockquote','table','tr'].includes(tag)) return `${[...node.childNodes].map(block).join('')}\n`; return [...node.childNodes].map(block).join(''); }; const markdown = clean(block(clone)); const chosen = selector ? document.querySelector(selector) : null; if (chosen) { if (chosen.href) return { page: { title: document.querySelector('h1')?.innerText.trim() || document.title.trim(), url: location.href, markdown }, next: chosen.href }; const marker = `${document.title}|${(document.body?.innerText || '').slice(0, 240)}`; return { page: { title: document.querySelector('h1')?.innerText.trim() || document.title.trim(), url: location.href, markdown }, clicked: true, selector, marker, next: null }; } const links = [...document.querySelectorAll('a[href]')]; const candidate = links.find((a) => a.rel === 'next') || links.find((a) => /^(next|next page|›|→)$/i.test(a.textContent.trim())) || links.find((a) => /\bnext\b/i.test(a.getAttribute('aria-label') || '')); return { page: { title: document.querySelector('h1')?.innerText.trim() || document.title.trim(), url: location.href, markdown }, next: candidate?.href || null }; }
