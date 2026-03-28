export default defineBackground(() => {
  const DEFAULT_TIMEOUT_MINUTES = 30;
  const CHECK_INTERVAL_MINUTES = 1;
  const QUICK_SEARCH_PATH = '/popup.html';

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
    browser.alarms.create('checkTabs', { periodInMinutes: CHECK_INTERVAL_MINUTES });
    console.log('Swoop installed');
  });

  browser.tabs.onActivated.addListener(async (activeInfo) => {
    await browser.storage.local.set({ [`tab_${activeInfo.tabId}`]: Date.now() });
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    await browser.storage.local.remove(`tab_${tabId}`);
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

    const tabs = await browser.tabs.query({});
    const activityData = await browser.storage.local.get(null);

    for (const tab of tabs) {
      if (tab.pinned) continue;
      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://')) continue;

      const lastActive = activityData[`tab_${tab.id}`] || tab.lastAccessed || now;
      if (now - lastActive > timeoutMs) {
        try {
          await browser.tabs.remove(tab.id!);
          await browser.storage.local.remove(`tab_${tab.id}`);
        } catch {}
      }
    }
  }

  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'open-quick-search') {
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });

      if (activeTab?.id) {
        try {
          await browser.tabs.sendMessage(activeTab.id, { type: 'toggle-overlay' });
          return;
        } catch {}
      }

      await browser.tabs.create({ url: browser.runtime.getURL(QUICK_SEARCH_PATH) });
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
});
