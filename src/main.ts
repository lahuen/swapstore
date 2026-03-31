import { onAuthStateChanged, signOut, getRedirectResult } from 'firebase/auth';
import { auth } from './lib/firebase';
import { renderLogin } from './components/login';
import { ensureUserProfile } from './lib/users';
import { initStore, destroyStore, subscribe, getProfile, isAdmin, isSupport } from './lib/store';
import { esc } from './lib/sanitize';
import './style.css';

const root = document.getElementById('app')!;
let cleanup: (() => void) | null = null;
let layoutReady = false;

// Auto-recover corrupted Firestore cache
window.addEventListener('unhandledrejection', (e) => {
  if (sessionStorage.getItem('sw_cache_cleared')) return;
  const msg = e.reason?.message || '';
  if (msg.includes('INTERNAL ASSERTION FAILED')) {
    e.preventDefault();
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'swap-store-mkplace';
    try { indexedDB.deleteDatabase(`firestore/[DEFAULT]/${projectId}/main`); } catch {}
    sessionStorage.setItem('sw_cache_cleared', '1');
    location.reload();
  }
});

root.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;min-height:100vh;"><p aria-busy="true">Cargando...</p></div>`;

// Wait for redirect result before listening to auth state
// This prevents showing login briefly when returning from Google
let redirectHandled = false;
getRedirectResult(auth).catch(() => {}).finally(() => {
  redirectHandled = true;
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const profile = await ensureUserProfile(user);
    if (profile.suspended) {
      root.innerHTML = `
        <div style="display:flex;justify-content:center;align-items:center;min-height:100vh;text-align:center;padding:1rem;">
          <div>
            <h2>Cuenta suspendida</h2>
            <p style="color:var(--color-text-muted);max-width:400px;">Tu cuenta fue suspendida por un administrador. Si crees que es un error, usa la seccion de soporte o contacta al equipo.</p>
            <a href="#" id="logout-suspended" role="button" class="outline">Cerrar sesion</a>
          </div>
        </div>`;
      document.getElementById('logout-suspended')!.addEventListener('click', (e) => { e.preventDefault(); signOut(auth); });
      return;
    }
    initStore();
    if (!layoutReady) {
      renderLayout();
      layoutReady = true;
      window.addEventListener('hashchange', navigateToHash);
    }
    navigateToHash();
  } else {
    // Don't show login until redirect result is processed
    if (!redirectHandled) {
      await getRedirectResult(auth).catch(() => {});
      redirectHandled = true;
      // If user signed in via redirect, onAuthStateChanged will fire again with user
      if (auth.currentUser) return;
    }
    layoutReady = false;
    window.removeEventListener('hashchange', navigateToHash);
    if (cleanup) { cleanup(); cleanup = null; }
    destroyStore();
    renderLogin(root);
  }
});

function renderLayout() {
  const displayName = esc(auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || '');
  const photo = auth.currentUser?.photoURL;

  root.innerHTML = `
    <nav class="container-fluid app-nav">
      <div class="nav-top">
        <a href="#feed" style="text-decoration:none;"><strong>Swap Store</strong></a>
        <div style="display:flex;align-items:center;gap:.5rem;">
          <a href="#wallet" class="nav-link shimmer shimmer-light" data-tab="#wallet" style="text-decoration:none;font-weight:600;color:var(--color-coral);padding:.15rem .5rem;border-radius:.25rem;" id="wallet-badge" title="Tus gestos">✦--</a>
          <a href="#profile" class="nav-link" data-tab="#profile" style="text-decoration:none;display:flex;align-items:center;gap:.35rem;">
            ${photo ? `<img src="${esc(photo)}" alt="" style="width:28px;height:28px;border-radius:50%;">` : ''}
            <small class="nav-desktop-only">${displayName}</small>
          </a>
          <a href="#" id="logout-btn" class="nav-desktop-only" style="font-size:.8rem;">Salir</a>
        </div>
      </div>
      <ul class="nav-tabs">
        <li><a href="#feed" class="nav-link" data-tab="#feed">Inicio</a></li>
        <li><a href="#new" class="nav-link" data-tab="#new">Publicar</a></li>
        <li><a href="#deals" class="nav-link" data-tab="#deals">Tratos</a></li>
        <li><a href="#mine" class="nav-link" data-tab="#mine">Mis avisos</a></li>
        <li id="nav-support" style="display:none;"><a href="#support" class="nav-link" data-tab="#support">Soporte</a></li>
        <li id="nav-admin" style="display:none;"><a href="#admin" class="nav-link" data-tab="#admin">Admin</a></li>
      </ul>
    </nav>
    <main id="view" class="container-fluid"></main>
    <nav class="bottom-bar" id="bottom-bar">
      <a href="#feed" class="bottom-tab nav-link" data-tab="#feed">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3.5 10.2c.2-.3 4-6.8 8.3-7 4.5-.2 8.7 6.5 8.7 6.5"/>
          <path d="M5.2 9.5l-.3 10c0 .8.5 1.2 1.2 1.2h2.8l.2-4.5c.1-.7.6-1 1.2-1h3.5c.6 0 1 .4 1.1 1l.1 4.5h2.8c.8 0 1.3-.5 1.2-1.2l-.2-10"/>
        </svg>
        <span>Inicio</span>
      </a>
      <a href="#new" class="bottom-tab nav-link" data-tab="#new">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.2 5.5c-.1 0-.2 5.7 0 12.8"/>
          <path d="M5.5 11.8c0 .1 5.8.3 13 .2"/>
        </svg>
        <span>Publicar</span>
      </a>
      <a href="#deals" class="bottom-tab nav-link" data-tab="#deals">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4.5 13c.5-.3 2-1.5 3.8-1.3 1.5.2 2.2 1 3.5 1s2.2-.8 3.5-1c1.8-.2 3.3 1 3.8 1.3"/>
          <path d="M6.5 13.2c-.2 1.5-.3 3.5.8 5 1 1.2 2.5 1.5 4.5 1.5s3.5-.3 4.5-1.5c1.1-1.5 1-3.5.8-5"/>
          <path d="M9 10.5c-.5-2 .5-4 1.5-4.5.8-.4 1.5-.2 2.2.5.5.5.8 1.8.3 3.5"/>
        </svg>
        <span>Tratos</span>
      </a>
      <a href="#mine" class="bottom-tab nav-link" data-tab="#mine">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 5.5c-.1 0 13.5-.2 14 0"/>
          <path d="M5.2 5.5l-.2 13.5c0 .5.3.8.8.8"/>
          <path d="M5 10.2h14"/>
          <path d="M10 10v9.8"/>
          <path d="M19 5.5v14c0 .5-.3.8-.8.8H5.8"/>
        </svg>
        <span>Avisos</span>
      </a>
      <a href="#profile" class="bottom-tab nav-link" data-tab="#profile">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 11.5c-2.2 0-3.5-1.8-3.5-3.8S9.8 4 12 4s3.5 1.7 3.5 3.7-1.3 3.8-3.5 3.8z"/>
          <path d="M5.5 20.5c.2-3.5 3-5.8 6.5-5.8s6.3 2.3 6.5 5.8"/>
        </svg>
        <span>Perfil</span>
      </a>
    </nav>
  `;

  document.getElementById('logout-btn')!.addEventListener('click', (e) => {
    e.preventDefault();
    signOut(auth);
  });

  // Live-update wallet badge + nav role links
  function updateProfileUI() {
    const badge = document.getElementById('wallet-badge');
    if (badge) {
      const p = getProfile();
      badge.textContent = `✦${p?.walletBalance ?? '--'}`;
    }
    // Show/hide role-based nav links
    const supportLink = document.getElementById('nav-support');
    const adminLink = document.getElementById('nav-admin');
    if (supportLink) supportLink.style.display = isSupport() ? '' : 'none';
    if (adminLink) adminLink.style.display = isAdmin() ? '' : 'none';
  }
  subscribe(updateProfileUI, ['profile']);
  updateProfileUI();
}

function navigateToHash() {
  if (cleanup) { cleanup(); cleanup = null; }
  const hash = window.location.hash || '#feed';
  const view = document.getElementById('view');
  if (!view) return;

  // Active tab
  document.querySelectorAll('.nav-link').forEach(a => {
    const tab = a.getAttribute('data-tab') || '';
    a.classList.toggle('active-link', hash === tab || (hash.startsWith('#listing/') && tab === '#feed') || (hash.startsWith('#edit/') && tab === '#mine'));
  });

  if (hash.startsWith('#listing/')) {
    const id = hash.split('/')[1];
    import('./components/listing-detail').then(({ renderListingDetail }) => {
      renderListingDetail(view, id).then(c => { cleanup = c || null; });
    });
  } else if (hash.startsWith('#edit/')) {
    const id = hash.split('/')[1];
    import('./components/listing-form').then(({ renderListingForm }) => {
      cleanup = renderListingForm(view, id) || null;
    });
  } else {
    switch (hash) {
      case '#new':
        import('./components/listing-form').then(({ renderListingForm }) => {
          cleanup = renderListingForm(view) || null;
        });
        break;
      case '#deals':
        import('./components/my-deals').then(({ renderMyDeals }) => {
          cleanup = renderMyDeals(view) || null;
        });
        break;
      case '#mine':
        import('./components/my-listings').then(({ renderMyListings }) => {
          cleanup = renderMyListings(view) || null;
        });
        break;
      case '#wallet':
        import('./components/wallet-view').then(({ renderWalletView }) => {
          cleanup = renderWalletView(view) || null;
        });
        break;
      case '#profile':
        import('./components/profile').then(({ renderProfile }) => {
          cleanup = renderProfile(view) || null;
        });
        break;
      case '#support':
        import('./components/support-panel').then(({ renderSupportPanel }) => {
          cleanup = renderSupportPanel(view) || null;
        });
        break;
      case '#admin':
        import('./components/admin-dashboard').then(({ renderAdminDashboard }) => {
          cleanup = renderAdminDashboard(view) || null;
        });
        break;
      default:
        import('./components/feed').then(({ renderFeed }) => {
          cleanup = renderFeed(view) || null;
        });
        break;
    }
  }
}
