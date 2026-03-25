export default defineBackground(() => {
  const DEFAULT_TIMEOUT_MINUTES = 30;
  const CHECK_INTERVAL_MINUTES = 1;

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
      browser.action.openPopup();
    }
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
    if (message.type === 'switchTab') {
      browser.tabs.update(message.tabId, { active: true }).then(() => {
        browser.windows.update(message.windowId, { focused: true });
      }).then(() => sendResponse({ success: true }));
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
});