import { render } from 'preact';
import { App } from './popup/App';
import styleText from './popup/style.css?inline';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    const mountNode = document.createElement('div');

    host.id = 'swoop-overlay-host';
    host.style.display = 'none';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';

    style.textContent = styleText;
    shadowRoot.append(style, mountNode);
    document.documentElement.appendChild(host);

    const closeOverlay = () => {
      host.style.display = 'none';
      document.body?.style.removeProperty('overflow');
    };

    const openOverlay = () => {
      host.style.display = 'block';
      document.body?.style.setProperty('overflow', 'hidden');
      window.dispatchEvent(new CustomEvent('swoop:open'));
    };

    render(<App mode="overlay" onRequestClose={closeOverlay} />, mountNode);

    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'toggle-overlay') {
        const isVisible = host.style.display === 'block';
        if (isVisible) {
          closeOverlay();
        } else {
          openOverlay();
        }
      }
    });
  },
});
