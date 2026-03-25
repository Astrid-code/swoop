import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: 'Swoop',
    description: '自动关闭超时未使用的标签页，并提供快捷搜索功能',
    permissions: ['tabs', 'storage', 'alarms'],
    commands: {
      'open-quick-search': {
        suggested_key: {
          default: 'Ctrl+Shift+Space',
          mac: 'Command+T',
        },
        description: '打开快捷搜索',
      },
    },
  },
});