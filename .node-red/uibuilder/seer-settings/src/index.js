
import uibuilder from '/seer-settings/uibuilder.esm.js';

uibuilder.start();


uibuilder.onChange('msg', (msg) => {
  if (!msg || !msg.payload) return;
  const p = msg.payload;
  document.getElementById('hostname').innerText = p.hostname || '';
  document.getElementById('systemversion').innerText = p.systemversion || '';
  document.getElementById('uptime').innerText = p.uptime || '';
  document.getElementById('datentime').innerText = p.datentime || '';
  document.getElementById('timezone').innerText = p.timezone || '';
  document.getElementById('devicemodel').innerText = p.devicemodel || '';
  document.getElementById('cpucapacity').innerText = p.cpucapacity || '';
  document.getElementById('memorycapacity').innerText = p.memorycapacity || '';
  document.getElementById('storagecapacity').innerText = p.storagecapacity || '';
});


function init() {
  const toggle = document.getElementById('umToggle');
  const updateBtn = document.querySelectorAll('.hardware-action-btn-single')[0]; 
  const feedbackUpdate = document.querySelectorAll('.hardware-feedback')[0]; 
  const feedbackRestart = document.getElementById('umFeedback'); 
  const overlayEl = document.getElementById('actionOverlay');
  if (!overlayEl) console.warn('[um] actionOverlay element not found in DOM');

  if (!toggle) {
    console.warn('[um] umToggle missing - some features will be disabled');
    return;
  }


  let forcedDisplayForTransition = false;


  function removeInlineMenuLocks() {
    forcedDisplayForTransition = false;
  }

  function ensureMenuPresentForTransition() {
    forcedDisplayForTransition = false;
  }

  function onMenuTransitionEnd(ev) {
    forcedDisplayForTransition = false;
  }




  let overlayInterval = null;
  let overlayTimeout = null;
  let countdownInterval = null;

  function hideOverlay() {
    const overlay = document.getElementById('actionOverlay');
    if (overlay) {

      overlay.setAttribute('hidden', '');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.display = '';
    }
    awaitingReboot = false;
    if (overlayInterval) {
      clearInterval(overlayInterval);
      overlayInterval = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (overlayTimeout) {
      clearTimeout(overlayTimeout);
      overlayTimeout = null;
    }
  }

 
  function isRebootCompleteMsg(msg) {
    if (!msg) return false;
    const p = msg.payload || {};
    const t = msg.topic || '';
    // uptime present -> system back up
    if (p.uptime) return true;
    // common variants we'll accept
    if (p.reboot === 'done' || p.reboot === 'complete') return true;
    if (p.rebootComplete === true) return true;
    if (p.action === 'restarted' || p.action === 'rebooted') return true;
    if (p.status === 'rebooted' || p.status === 'restarted' || p.status === 'done') return true;
    if (t === 'restarted' || t === 'rebootComplete' || t === 'rebooted') return true;
    return false;
  }

  // Ensure an overlay exists in the DOM; if not, create one so the UI can always show it.
  function createOverlayIfMissing() {
    let overlay = document.getElementById('actionOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'actionOverlay';
    overlay.setAttribute('hidden', '');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.className = 'action-overlay';
    overlay.innerHTML = `
      <div class="action-overlay-content" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <div class="action-overlay-message">Rebooting — waiting for system to come back online</div>
        <div class="subtext" style="display:none">Checking system uptime...</div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  // listen for Node-RED messages so overlay can be dismissed early (especially uptime)
  try {
    uibuilder.onChange('msg', (msg) => {
      console.debug('[um] onChange msg received:', msg && msg.payload ? msg.payload : msg);
      // Always update system info (there's an earlier handler too) and hide overlay if uptime present
      if (msg && msg.payload && msg.payload.uptime) {
        if (awaitingReboot) {
          console.info('[um] uptime seen in msg.payload — hiding overlay');
          hideOverlay();
        }
      } else {
        // fallback: also check other signals
        if (awaitingReboot && isRebootCompleteMsg(msg)) {
          console.info('[um] reboot completion detected from Node-RED message, hiding overlay');
          hideOverlay();
        }
      }
    });
  } catch (err) {
    console.warn('[um] uibuilder.onChange not available for overlay completion detection', err);
  }

  toggle.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const labels = { restart: 'restart the device' };
    if (!confirm(`Are you sure you want to ${labels.restart}?`)) return;

    // Clear any existing countdown
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    let countdown = 6;
    console.info('[um] 6-second countdown started (restart - no overlay yet)');

    // Countdown timer - DON'T show overlay yet
    countdownInterval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;

        // After 6 seconds, NOW show the overlay with rebooting message
        const overlay = createOverlayIfMissing();
        const overlayMessage = overlay.querySelector('.action-overlay-message');
        overlay.removeAttribute('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        try { overlay.style.display = 'flex'; } catch (e) { /* ignore */ }

        overlayMessage && (overlayMessage.textContent = 'Rebooting — waiting for system to come back online');
        console.info('[um] showing rebooting screen after 6-second countdown');

        awaitingReboot = true;
        if (overlayTimeout) { clearTimeout(overlayTimeout); overlayTimeout = null; }
        overlayTimeout = setTimeout(() => {
          if (awaitingReboot) {
            console.info('[um] reboot overlay fallback timeout reached (120s), hiding overlay');
            hideOverlay();
          }
        }, 120000);
      }
    }, 1000);

    // send restart immediately so Node-RED can start the reboot
    try {
      console.info('[um] sending action -> restart (immediate)');
      uibuilder.send({ payload: { action: 'restart' }, topic: 'restart' });
    } catch (err) {
      console.error('[um] uibuilder.send failed for restart', err);
    }

    if (feedbackRestart) {
      feedbackRestart.textContent = 'Restart command sent';
      feedbackRestart.classList.add('visible');
      setTimeout(() => feedbackRestart.classList.remove('visible'), 3000);
    }
  });

  // Update button click handler
  if (updateBtn) {
    updateBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const labels = { update: 'update the system' };
      if (!confirm(`Are you sure you want to ${labels.update}?`)) return;

      // Clear any existing countdown
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }

      let countdown = 6;
      console.info('[um] 6-second countdown started (update - no overlay yet)');

      // Countdown timer - DON'T show overlay yet
      countdownInterval = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          clearInterval(countdownInterval);
          countdownInterval = null;

          // After 6 seconds, NOW show the overlay with updating message
          const overlay = createOverlayIfMissing();
          const overlayMessage = overlay.querySelector('.action-overlay-message');
          overlay.removeAttribute('hidden');
          overlay.setAttribute('aria-hidden', 'false');
          try { overlay.style.display = 'flex'; } catch (e) { /* ignore */ }

          overlayMessage && (overlayMessage.textContent = 'Updating — waiting for update to complete');
          console.info('[um] showing updating screen after 6-second countdown');

          awaitingReboot = true;
          if (overlayTimeout) { clearTimeout(overlayTimeout); overlayTimeout = null; }
          overlayTimeout = setTimeout(() => {
            if (awaitingReboot) {
              console.info('[um] overlay fallback timeout reached (120s), hiding overlay');
              hideOverlay();
            }
          }, 120000);
        }
      }, 1000);

      // send update immediately so Node-RED can start the update
      try {
        console.info('[um] sending action -> update (immediate)');
        uibuilder.send({ payload: { action: 'update' }, topic: 'update' });
      } catch (err) {
        console.error('[um] uibuilder.send failed for update', err);
      }

      if (feedbackUpdate) {
        feedbackUpdate.textContent = 'Update command sent';
        feedbackUpdate.classList.add('visible');
        setTimeout(() => feedbackUpdate.classList.remove('visible'), 3000);
      }
    });
  }

  // Close on outside click
  document.addEventListener('click', (ev) => {
    // Close any open UI
  });

  // Close on Escape
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      // Close any open UI
    }
  });

  // Top-right logout button (outside the pad)
  const logoutTop = document.getElementById('logoutTop');
  if (logoutTop) {
    logoutTop.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!confirm('Are you sure you want to log out?')) return;
      // include topic 'logout' to help Node-RED route this message
      try {
        console.info('[um] sending action -> logout');
        uibuilder.send({ payload: { action: 'logout' }, topic: 'logout' });
      } catch (err) {
        console.error('[um] uibuilder.send failed for logout', err);
      }
      if (feedbackRestart) {
        feedbackRestart.textContent = 'Log out command sent';
        feedbackRestart.classList.add('visible');
        setTimeout(() => feedbackRestart.classList.remove('visible'), 3000);
      }
    });
  }

  // Defensive: if some other script later forcibly toggles inline display/opacity,
  // provide a short interval check to clear inline locks after initial load.
  // This helps in environments where theme scripts run after this script.
  setTimeout(removeInlineMenuLocks, 600);

  // Expose a small debug helper for the console (optional)
  // window.__umDebug = { setOpen, removeInlineMenuLocks, ensureMenuPresentForTransition };

}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// expose a small debug API so you can manually show/hide the overlay from the console
if (!window.__umDebug) window.__umDebug = {};
window.__umDebug.showOverlay = function (msg) {
  try {
    // try to init if not already
    if (typeof init === 'function') init();
  } catch (e) { /* ignore */ }
  const el = (document.getElementById('actionOverlay') || (() => {
    // fallback: create minimal overlay if function not present in closure
    const d = document.createElement('div');
    d.id = 'actionOverlay';
    d.className = 'action-overlay';
    d.innerHTML = `<div class="action-overlay-content"><div class="spinner"></div><div class="action-overlay-message">${(msg && msg.message) || 'Rebooting — waiting for system to come back online'}</div></div>`;
    document.body.appendChild(d);
    return d;
  })());
  el.removeAttribute('hidden'); el.setAttribute('aria-hidden', 'false'); try { el.style.display = 'flex'; } catch (e) { }
  console.info('[um] __umDebug.showOverlay invoked');
  return el;
};

window.__umDebug.hideOverlay = function () {
  const el = document.getElementById('actionOverlay');
  if (!el) return;
  el.setAttribute('hidden', ''); el.setAttribute('aria-hidden', 'true'); el.style.display = '';
  console.info('[um] __umDebug.hideOverlay invoked');
};