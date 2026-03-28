export default defineBackground(() => {
  const DEFAULT_TIMEOUT_MINUTES = 12 * 60;
  const CHECK_INTERVAL_MINUTES = 1;
  const LAST_CHECK_AT_KEY = 'lastCheckAt';
  const SLEEP_GAP_THRESHOLD_MS = 5 * 60 * 1000;
  const CLOSE_CANDIDATE_PREFIX = 'closeCandidate_';

  type SearchResult =
    | {
        id: string;
        kind: 'tab';
        title: string;
        url: string;
        subtitle: string;
        icon?: string;
        tabId: number;
        windowId: number;
      }
    | {
        id: string;
        kind: 'history' | 'bookmark';
        title: string;
        url: string;
        subtitle: string;
      };

  browser.runtime.onInstalled.addListener(async () => {
    const config = await browser.storage.local.get('timeoutMinutes');
    if (!config.timeoutMinutes) {
      await browser.storage.local.set({ timeoutMinutes: DEFAULT_TIMEOUT_MINUTES });
    }
    await initializePeriodicCheck();
    console.log('Swoop installed');
  });

  browser.runtime.onStartup?.addListener(async () => {
    await initializePeriodicCheck();
  });

  browser.tabs.onActivated.addListener(async (activeInfo) => {
    await markTabAsActive(activeInfo.tabId);
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    await clearTabState(tabId);
  });

  browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || typeof changeInfo.url === 'string' || changeInfo.audible === true) {
      await markTabAsActive(tabId);
    }
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'checkTabs') {
      await closeTimeoutTabs();
    }
  });

  async function closeTimeoutTabs() {
    const config = await browser.storage.local.get('timeoutMinutes');
    const timeoutMs = (config.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES) * 60 * 1000;
    const now = Date.now();
    const { [LAST_CHECK_AT_KEY]: lastCheckAt } = await browser.storage.local.get(LAST_CHECK_AT_KEY);

    await browser.storage.local.set({ [LAST_CHECK_AT_KEY]: now });

    if (typeof lastCheckAt === 'number' && now - lastCheckAt > SLEEP_GAP_THRESHOLD_MS) {
      return;
    }

    const tabs = await browser.tabs.query({});
    const activityData = await browser.storage.local.get(null);

    for (const tab of tabs) {
      if (tab.pinned) continue;
      if (tab.active) continue;
      if (tab.audible) continue;
      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://')) continue;

      const lastActive = activityData[`tab_${tab.id}`] || tab.lastAccessed || now;
      const candidateKey = `${CLOSE_CANDIDATE_PREFIX}${tab.id}`;
      const candidateSince = activityData[candidateKey];

      if (now - lastActive <= timeoutMs) {
        if (candidateSince) {
          await browser.storage.local.remove(candidateKey);
        }
        continue;
      }

      if (!candidateSince) {
        await browser.storage.local.set({ [candidateKey]: now });
        continue;
      }

      if (now - candidateSince >= CHECK_INTERVAL_MINUTES * 60 * 1000) {
        try {
          await browser.tabs.remove(tab.id!);
          await clearTabState(tab.id!);
        } catch {}
      }
    }
  }

  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'open-quick-search') {
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });

      if (!activeTab?.id || !canInjectOverlay(activeTab.url)) {
        return;
      }

      const opened = await ensureOverlayOpened(activeTab.id);
      if (!opened) {
        console.warn('Swoop overlay could not be opened on this page.', activeTab.url);
      }
    }
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'getConfig') {
      browser.storage.local.get('timeoutMinutes').then(sendResponse);
      return true;
    }
    if (message.type === 'setConfig') {
      browser.storage.local.set({ timeoutMinutes: message.timeoutMinutes }).then(() => sendResponse({ success: true }));
      return true;
    }
    if (message.type === 'searchTabs') {
      searchTabs(message.query).then(sendResponse);
      return true;
    }
    if (message.type === 'searchEverything') {
      searchEverything(message.query).then(sendResponse);
      return true;
    }
    if (message.type === 'switchTab') {
      browser.tabs.update(message.tabId, { active: true }).then(() => {
        browser.windows.update(message.windowId, { focused: true });
      }).then(() => sendResponse({ success: true }));
      return true;
    }
    if (message.type === 'openSearchResult') {
      openSearchResult(message.result, sender.tab?.id).then(() => sendResponse({ success: true }));
      return true;
    }
    return true;
  });

  async function searchTabs(query: string) {
    const allTabs = await browser.tabs.query({});
    if (!query?.trim()) return allTabs;
    const q = query.toLowerCase();
    return allTabs.filter(t => t.title?.toLowerCase().includes(q) || t.url?.toLowerCase().includes(q));
  }

  async function searchEverything(query: string): Promise<SearchResult[]> {
    const trimmed = query?.trim() || '';
    const [tabs, historyItems, bookmarkItems] = await Promise.all([
      searchOpenTabs(trimmed),
      searchHistory(trimmed),
      searchBookmarks(trimmed),
    ]);

    return [...tabs, ...historyItems, ...bookmarkItems];
  }

  async function searchOpenTabs(query: string): Promise<SearchResult[]> {
    const allTabs = await browser.tabs.query({});
    const filtered = query
      ? allTabs.filter((tab) => {
          const q = query.toLowerCase();
          return tab.title?.toLowerCase().includes(q) || tab.url?.toLowerCase().includes(q);
        })
      : allTabs;

    return filtered.slice(0, 8).map((tab) => ({
      id: `tab-${tab.id}`,
      kind: 'tab' as const,
      title: tab.title || '无标题标签页',
      url: tab.url || '',
      subtitle: '已打开标签页',
      icon: tab.favIconUrl,
      tabId: tab.id!,
      windowId: tab.windowId,
    }));
  }

  async function searchHistory(query: string): Promise<SearchResult[]> {
    const items = await browser.history.search({
      text: query,
      maxResults: query ? 8 : 6,
      startTime: 0,
    });

    return items
      .filter((item) => item.url)
      .slice(0, query ? 8 : 6)
      .map((item) => ({
        id: `history-${item.id}`,
        kind: 'history' as const,
        title: item.title || item.url || '历史记录',
        url: item.url || '',
        subtitle: '历史记录',
      }));
  }

  async function searchBookmarks(query: string): Promise<SearchResult[]> {
    const items = query
      ? await browser.bookmarks.search(query)
      : await browser.bookmarks.getRecent(8);

    return items
      .filter((item) => item.url)
      .slice(0, 8)
      .map((item) => ({
        id: `bookmark-${item.id}`,
        kind: 'bookmark' as const,
        title: item.title || item.url || '书签',
        url: item.url || '',
        subtitle: '书签',
      }));
  }

  async function openSearchResult(result: SearchResult, currentTabId?: number) {
    if (result.kind === 'tab') {
      await browser.tabs.update(result.tabId, { active: true });
      await browser.windows.update(result.windowId, { focused: true });
      return;
    }

    if (currentTabId) {
      await browser.tabs.update(currentTabId, { url: result.url, active: true });
      return;
    }

    await browser.tabs.create({ url: result.url });
  }

  function canInjectOverlay(url?: string) {
    if (!url) return false;

    return !(
      url.startsWith('chrome://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('moz-extension://') ||
      url.startsWith('view-source:')
    );
  }

  async function ensureOverlayOpened(tabId: number) {
    if (await tryToggleOverlay(tabId)) {
      return true;
    }

    const contentScriptFiles = browser.runtime.getManifest().content_scripts?.find((script) =>
      script.matches?.includes('<all_urls>')
    )?.js;

    if (!contentScriptFiles?.length) {
      return false;
    }

    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: contentScriptFiles,
      });
    } catch {
      return false;
    }

    return tryToggleOverlay(tabId);
  }

  async function tryToggleOverlay(tabId: number) {
    try {
      await browser.tabs.sendMessage(tabId, { type: 'toggle-overlay' });
      return true;
    } catch {
      return false;
    }
  }

  async function initializePeriodicCheck() {
    await browser.alarms.create('checkTabs', { periodInMinutes: CHECK_INTERVAL_MINUTES });

    const { [LAST_CHECK_AT_KEY]: lastCheckAt } = await browser.storage.local.get(LAST_CHECK_AT_KEY);
    if (typeof lastCheckAt !== 'number') {
      await browser.storage.local.set({ [LAST_CHECK_AT_KEY]: Date.now() });
    }
  }

  async function markTabAsActive(tabId: number) {
    await browser.storage.local.set({
      [`tab_${tabId}`]: Date.now(),
    });
    await browser.storage.local.remove(`${CLOSE_CANDIDATE_PREFIX}${tabId}`);
  }

  async function clearTabState(tabId: number) {
    await browser.storage.local.remove([`tab_${tabId}`, `${CLOSE_CANDIDATE_PREFIX}${tabId}`]);
  }
});
