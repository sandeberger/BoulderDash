let deferredPrompt: Event | null = null;

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

export function setupInstallPrompt() {
  const btn = document.getElementById('btn-install') as HTMLButtonElement;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.style.display = 'inline-block';
  });

  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    (deferredPrompt as any).prompt();
    const result = await (deferredPrompt as any).userChoice;
    if (result.outcome === 'accepted') {
      btn.style.display = 'none';
    }
    deferredPrompt = null;
  });
}
