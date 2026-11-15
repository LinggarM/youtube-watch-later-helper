let saveQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addToWatchLater") {
    const videoId = request.videoId;

    const operation = saveQueue.then(() => new Promise(resolve => {
      chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}`, active: false }, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          console.error("Failed to open YouTube tab:", chrome.runtime.lastError);
          resolve({ status: "failed" });
          return;
        }
      
      // Tunggu 3 detik agar halaman dasar YouTube termuat
      setTimeout(() => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async () => {
            // Fungsi bantu: menunggu elemen muncul (maksimal 4 detik)
            const waitForElement = (selector, timeout = 4000) => {
              return new Promise(resolve => {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                
                const observer = new MutationObserver(() => {
                  const found = document.querySelector(selector);
                  if (found) {
                    observer.disconnect();
                    resolve(found);
                  }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => { observer.disconnect(); resolve(document.querySelector(selector)); }, timeout);
              });
            };

            // 1. Cari tombol "Simpan" langsung (lebih stabil daripada titik tiga)
            let saveBtn = await waitForElement('button[aria-label="Simpan"], button[aria-label="Save"], ytd-button-renderer[aria-label="Simpan"], ytd-button-renderer[aria-label="Save"]');
            
            // 2. Fallback: Jika tidak ketemu, coba via menu titik tiga
            if (!saveBtn) {
              const menuBtn = await waitForElement('ytd-menu-renderer #button, button[aria-label*="Tindakan lainnya"], button[aria-label*="More actions"]', 2000);
              if (menuBtn) {
                menuBtn.click();
                await new Promise(r => setTimeout(r, 400));
                
                const items = document.querySelectorAll('ytd-menu-service-item-renderer, yt-collection-item-view-model, [role="menuitem"]');
                for (let item of items) {
                  if (item.textContent.toLowerCase().includes('simpan') || item.textContent.toLowerCase().includes('save')) {
                    saveBtn = item.closest('button, div[role="menuitem"], ytd-menu-service-item-renderer, yt-collection-item-view-model');
                    break;
                  }
                }
              }
            }

            // 3. Jika tombol Simpan ditemukan, klik dan cari "Tonton Nanti"
            if (saveBtn) {
              saveBtn.click();
              await new Promise(r => setTimeout(r, 600)); // Tunggu panel playlist muncul
              
              const readCheckedState = element => {
                if (!element) return null;
                const ariaChecked = element.getAttribute('aria-checked');
                if (ariaChecked === 'true') return true;
                if (ariaChecked === 'false') return false;
                const ariaPressed = element.getAttribute('aria-pressed');
                if (ariaPressed === 'true') return true;
                if (ariaPressed === 'false') return false;
                if (element.hasAttribute('checked') ||
                    element.classList.contains('checked') ||
                    element.classList.contains('is-checked')) {
                  return true;
                }
                if ('checked' in element && typeof element.checked === 'boolean') {
                  return element.checked;
                }
                return null;
              };

              let watchLaterOption = null;
              let watchLaterChecked = null;
              for (let attempt = 0; attempt < 10; attempt++) {
                const options = Array.from(document.querySelectorAll(
                  'ytd-playlist-add-to-option-renderer, yt-collection-item-view-model, [role="menuitem"]'
                )).filter(option => {
                  const text = option.textContent.toLowerCase();
                  return text.includes('tonton nanti') || text.includes('watch later');
                }).sort((a, b) => a.textContent.length - b.textContent.length);

                watchLaterOption = options[0];
                if (watchLaterOption) {
                  const checkboxStates = Array.from(watchLaterOption.querySelectorAll(
                    '#checkbox, tp-yt-paper-checkbox, [role="checkbox"], [aria-checked], [aria-pressed], input[type="checkbox"]'
                  )).map(readCheckedState);
                  const optionState = readCheckedState(watchLaterOption);
                  watchLaterChecked = checkboxStates.includes(true) || optionState === true
                    ? true
                    : checkboxStates.includes(false) || optionState === false
                      ? false
                      : null;

                  if (watchLaterChecked !== null) break;
                }

                await new Promise(r => setTimeout(r, 250));
              }

              if (!watchLaterOption) return false;
              if (watchLaterChecked === true) return true;
              if (watchLaterChecked !== false) return false;

              const clickable = watchLaterOption.closest(
                'button, div[role="menuitem"], ytd-playlist-add-to-option-renderer, yt-collection-item-view-model'
              ) || watchLaterOption;
              clickable.click();
              return true;
            }
            return false; // Gagal
          }
        }).then((results) => {
          const success = results[0]?.result;
          
          // Beri waktu 1.5 detik lagi agar klik "Tonton Nanti" benar-benar terdaftar di server YouTube
          setTimeout(() => {
            chrome.tabs.remove(tab.id);
            resolve({ status: success ? "success" : "failed" });
          }, 1500);
        }).catch(err => {
          console.error("Background script error:", err);
          chrome.tabs.remove(tab.id);
          resolve({ status: "failed" });
        });
      }, 3000); // Delay awal 3 detik
      });
    }));

    saveQueue = operation.catch(error => {
      console.error("Watch Later operation failed:", error);
      return { status: "failed" };
    });
    saveQueue.then(sendResponse);
    return true; // Wajib untuk sendResponse asinkron
  }
});