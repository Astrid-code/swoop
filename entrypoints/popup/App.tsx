import { useState, useEffect, useCallback, useRef } from 'preact/hooks';

interface TabInfo {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  pinned: boolean;
}

export function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredTabs = tabs.filter((tab) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return tab.title.toLowerCase().includes(q) || tab.url.toLowerCase().includes(q);
  });

  const loadTabs = useCallback(async () => {
    const result = await browser.tabs.query({});
    setTabs(
      result.map((tab) => ({
        id: tab.id!,
        windowId: tab.windowId,
        title: tab.title || '',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl,
        pinned: tab.pinned,
      }))
    );
  }, []);

  const switchTab = useCallback(async (tab: TabInfo) => {
    await browser.tabs.update(tab.id, { active: true });
    await browser.windows.update(tab.windowId, { focused: true });
    window.close();
  }, []);

  useEffect(() => {
    loadTabs();
    inputRef.current?.focus();
  }, [loadTabs]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (showSettings) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredTabs.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredTabs[selectedIndex];
        if (selected) switchTab(selected);
      } else if (e.key === 'Escape') {
        window.close();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [filteredTabs, selectedIndex, showSettings, switchTab]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  return (
    <div class="container">
      <div class="search-box">
        <input
          ref={inputRef}
          type="text"
          placeholder="搜索标签页..."
          value={searchQuery}
          onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="tabs-list">
        {filteredTabs.map((tab, index) => (
          <div
            key={tab.id}
            class={`tab-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => switchTab(tab)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <img class="tab-favicon" src={tab.favIconUrl || '/icon/16.png'} alt="" />
            <div class="tab-info">
              <div class="tab-title">{tab.title || '无标题'}</div>
              <div class="tab-url">{tab.url}</div>
            </div>
            {tab.pinned && <span class="tab-pinned">固定</span>}
          </div>
        ))}
        {filteredTabs.length === 0 && <div class="no-results">没有找到匹配的标签页</div>}
      </div>

      <div class="footer">
        <span class="hint">↑↓ 选择 · Enter 切换 · Esc 关闭</span>
        <span class="settings-btn" onClick={() => setShowSettings(true)}>
          ⚙️ 设置
        </span>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [timeoutMinutes, setTimeoutMinutes] = useState(30);

  useEffect(() => {
    browser.storage.local.get('timeoutMinutes').then((config) => {
      if (config.timeoutMinutes) setTimeoutMinutes(config.timeoutMinutes);
    });
  }, []);

  const saveSettings = async () => {
    if (timeoutMinutes > 0 && timeoutMinutes <= 1440) {
      await browser.storage.local.set({ timeoutMinutes });
      onClose();
    }
  };

  return (
    <div class="settings-panel">
      <div class="settings-header">
        <span>设置</span>
        <span class="close-btn" onClick={onClose}>
          ×
        </span>
      </div>
      <div class="settings-content">
        <label for="timeout-input">标签页超时时间（分钟）</label>
        <input
          id="timeout-input"
          type="number"
          min="1"
          max="1440"
          value={timeoutMinutes}
          onInput={(e) => setTimeoutMinutes(parseInt((e.target as HTMLInputElement).value) || 30)}
        />
        <small>超过此时间未活动的标签页将被自动关闭（固定标签页除外）</small>
        <button onClick={saveSettings}>保存</button>
      </div>
    </div>
  );
}