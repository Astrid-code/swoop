# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Swoop 是一个 Chrome 扩展，用于：
1. 自动关闭超时未使用的标签页（固定标签页除外）
2. 提供类似 Raycast 的快捷搜索功能（Cmd+T）

## Tech Stack

- **WXT** - Web Extension 框架，支持热更新
- **Preact** - 轻量级 UI 框架（React API，仅 3KB）
- **TypeScript**

## Project Structure

```
swoop/
├── wxt.config.ts          # WXT 配置
├── entrypoints/
│   ├── background.ts      # Service Worker - 标签页超时逻辑
│   └── popup/             # 快捷搜索弹窗
│       ├── App.tsx        # Preact 组件
│       ├── main.tsx
│       └── style.css
└── public/                # 静态资源
```

## Commands

```bash
pnpm dev          # 开发模式，支持热更新
pnpm build        # 构建生产版本
pnpm build:firefox # 构建 Firefox 版本
```

## Architecture

### Background Service Worker (`entrypoints/background.ts`)
- 监听标签页激活事件，更新最后活动时间
- 使用 `browser.alarms` 定时检查超时标签页
- 处理快捷键命令 `open-quick-search`

### Popup (`entrypoints/popup/`)
- Preact 组件实现搜索界面
- 支持键盘导航（↑↓ Enter Esc）
- 设置面板可配置超时时间

### Data Storage
使用 `browser.storage.local`：
- `timeoutMinutes`: 超时时间配置
- `tab_{tabId}`: 每个标签页的最后活动时间戳

## License

GNU AGPL v3