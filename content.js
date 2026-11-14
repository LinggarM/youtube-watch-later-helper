function getVideoId(href) {
  const url = new URL(href, window.location.origin);
  if (url.pathname === '/watch') {
    return url.searchParams.get('v');
  }

  const shortMatch = url.pathname.match(/^\/shorts\/([^/]+)/);
  return shortMatch ? shortMatch[1] : null;
}

function createWatchLaterButton(videoId, className = '') {
  const btn = document.createElement('button');
  btn.className = `custom-watch-later-btn ${className}`.trim();
  btn.innerText = '⏱️ Tonton Nanti';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.innerText = '⏳ Menyimpan...';

    chrome.runtime.sendMessage({ action: 'addToWatchLater', videoId }, (response) => {
      if (response && response.status === 'success') {
        btn.innerText = '✅ Ditambahkan';
      } else {
        btn.innerText = '❌ Gagal';
      }
      setTimeout(() => { btn.innerText = '⏱️ Tonton Nanti'; }, 2000);
    });
  });

  return btn;
}

function addWatchLaterButtons() {
  document.querySelectorAll('ytd-rich-item-renderer').forEach(item => {
    const shortLink = item.querySelector('a[href^="/shorts/"]');
    const videoId = shortLink && getVideoId(shortLink.href);
    if (videoId && !item.querySelector('.custom-watch-later-btn')) {
      item.style.position = 'relative';
      item.appendChild(createWatchLaterButton(videoId));
    }
  });

  document.querySelectorAll('ytd-notification-renderer').forEach(notification => {
    if (notification.querySelector('.custom-watch-later-btn')) return;

    const videoLink = notification.querySelector('a[href*="/watch"], a[href*="/shorts/"]');
    const videoId = videoLink && getVideoId(videoLink.href);
    if (!videoId) return;

    const thumbnail = notification.querySelector('#thumbnail');
    const buttonParent = thumbnail || notification;
    buttonParent.style.position = 'relative';
    buttonParent.appendChild(createWatchLaterButton(videoId, 'notification-watch-later-btn'));
  });
}

const observer = new MutationObserver(() => {
  addWatchLaterButtons();
});

observer.observe(document.body, { childList: true, subtree: true });
addWatchLaterButtons();