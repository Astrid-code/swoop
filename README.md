# swoop

一个 Chrome 扩展，自动关闭超时未使用的标签页，并提供快捷搜索功能。

## 功能

- **自动关闭超时标签页**: 自动关闭超过设定时间未活动的标签页，固定的标签页会被保留
- **快捷搜索**: 按 `Cmd+T` (Mac) 或 `Ctrl+Shift+Space` (Windows/Linux) 快速搜索并切换标签页

## 开发

```bash
pnpm install       # 安装依赖
pnpm dev           # 开发模式（支持热更新）
pnpm build         # 构建
pnpm build:firefox # 构建 Firefox 版本
```

## 安装

1. 运行 `pnpm build`
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `.output/chrome-mv3` 目录

## 使用说明

### 快捷搜索

- `↑↓` 选择标签页
- `Enter` 切换到选中的标签页
- `Esc` 关闭搜索框
- 点击设置图标可调整超时时间

### 超时设置

默认超时时间为 30 分钟。可以在扩展弹窗的设置中修改（1-1440 分钟）。

## 注意事项

- Command+T 快捷键可能会与浏览器默认的"新建标签页"冲突。安装后请在 `chrome://extensions/shortcuts` 中确认快捷键设置
- 固定的标签页（Pinned Tabs）不会被自动关闭

## Tech Stack

- [WXT](https://wxt.dev/) - Web Extension 框架
- [Preact](https://preactjs.com/) - 轻量级 React 替代方案
- TypeScript