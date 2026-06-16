import { start } from './ui.js';

start();

// PWA: 오프라인 캐시 (지원 시)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
