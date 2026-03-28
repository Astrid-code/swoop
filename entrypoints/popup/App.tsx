import { useState, useEffect, useCallback, useRef } from 'preact/hooks';

interface SearchResult {
  id: string;
  kind: 'tab' | 'history' | 'bookmark';
  title: string;
  url: string;
  subtitle: string;
  icon?: string;
  tabId?: number;
  windowId?: number;
}

interface AppProps {
  mode?: 'popup' | 'overlay';
  onRequestClose?: () => void;
}

export function App({ mode = 'popup', onRequestClose }: AppProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOverlay = mode === 'overlay';

  const runSearch = useCallback(async (query: string) => {
    const searchResults = await browser.runtime.sendMessage({ type: 'searchEverything', query });
    setResults(searchResults || []);
  }, []);

  const openResult = useCallback(async (result: SearchResult) => {
    await browser.runtime.sendMessage({ type: 'openSearchResult', result });
    await closeView();
  }, []);

  const closeView = useCallback(async () => {
    if (onRequestClose) {
      onRequestClose();
      return;
    }

    const currentTab = await browser.tabs.getCurrent();
    if (currentTab?.id) {
      await browser.tabs.remove(currentTab.id);
      return;
    }

    window.close();
  }, []);

  useEffect(() => {
    runSearch('');
    inputRef.current?.focus();
  }, [runSearch]);

  useEffect(() => {
    if (!isOverlay) return;

    const handleOpen = () => {
      setShowSettings(false);
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    window.addEventListener('swoop:open', handleOpen);
    return () => window.removeEventListener('swoop:open', handleOpen);
  }, [isOverlay]);

  useEffect(() => {
    runSearch(searchQuery);
  }, [runSearch, searchQuery]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (showSettings) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) openResult(selected);
      } else if (e.key === 'Escape') {
        closeView();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [closeView, openResult, results, selectedIndex, showSettings]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  return (
    <div class={`app-shell mode-${mode}`}>
      <div class="container">
        <div class="search-box">
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索历史记录、书签和标签页..."
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="tabs-list">
          {results.map((result, index) => (
            <div
              key={result.id}
              class={`tab-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => openResult(result)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div class={`result-icon kind-${result.kind}`}>
                {result.kind === 'tab' && <img class="tab-favicon" src={result.icon || '/icon/16.png'} alt="" />}
                {result.kind === 'history' && <span>H</span>}
                {result.kind === 'bookmark' && <span>B</span>}
              </div>
              <div class="tab-info">
                <div class="tab-title">{result.title || '无标题'}</div>
                <div class="tab-url">{result.url}</div>
              </div>
              <span class={`tab-pinned source-${result.kind}`}>{result.subtitle}</span>
            </div>
          ))}
          {results.length === 0 && <div class="no-results">没有找到匹配的历史记录、书签或标签页</div>}
        </div>

        <div class="footer">
          <span class="hint">↑↓ 选择 · Enter 打开 · Esc 关闭</span>
          <span class="settings-btn" onClick={() => setShowSettings(true)}>
            设置
          </span>
        </div>

        {showSettings && <SettingsPanel isOverlay={isOverlay} onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  );
}

function SettingsPanel({ onClose, isOverlay }: { onClose: () => void; isOverlay: boolean }) {
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
    <div class={`settings-panel ${isOverlay ? 'overlay' : ''}`}>
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
