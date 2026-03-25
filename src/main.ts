import { onAuthStateChanged, signOut } from 'firebase/auth';
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
          <a href="#profile" class="nav-link nav-profile-link" data-tab="#profile" style="text-decoration:none;display:flex;align-items:center;gap:.35rem;">
            ${photo ? `<img src="${esc(photo)}" alt="" style="width:28px;height:28px;border-radius:50%;">` : ''}
            <small>${displayName}</small>
          </a>
          <a href="#" id="logout-btn" class="nav-logout" style="font-size:.8rem;">Salir</a>
          <button id="menu-toggle" class="menu-toggle" aria-label="Menú">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
      <ul class="nav-tabs" id="nav-tabs">
        <li><a href="#feed" class="nav-link" data-tab="#feed">Explorar</a></li>
        <li><a href="#new" class="nav-link" data-tab="#new">Publicar</a></li>
        <li><a href="#deals" class="nav-link" data-tab="#deals">Tratos</a></li>
        <li><a href="#mine" class="nav-link" data-tab="#mine">Mis avisos</a></li>
        <li id="nav-support" style="display:none;"><a href="#support" class="nav-link" data-tab="#support">Soporte</a></li>
        <li id="nav-admin" style="display:none;"><a href="#admin" class="nav-link" data-tab="#admin">Admin</a></li>
        <li class="nav-mobile-only"><a href="#profile" class="nav-link" data-tab="#profile">Perfil</a></li>
        <li class="nav-mobile-only"><a href="#" id="logout-btn-mobile" style="font-size:.85rem;">Salir</a></li>
      </ul>
    </nav>
    <main id="view" class="container-fluid"></main>
  `;

  document.getElementById('logout-btn')!.addEventListener('click', (e) => {
    e.preventDefault();
    signOut(auth);
  });
  document.getElementById('logout-btn-mobile')?.addEventListener('click', (e) => {
    e.preventDefault();
    signOut(auth);
  });

  // Hamburger toggle
  const menuToggle = document.getElementById('menu-toggle')!;
  const navTabs = document.getElementById('nav-tabs')!;
  menuToggle.addEventListener('click', () => {
    const open = navTabs.classList.toggle('open');
    menuToggle.classList.toggle('open', open);
  });
  // Close menu on nav link click (mobile)
  navTabs.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) {
      navTabs.classList.remove('open');
      menuToggle.classList.remove('open');
    }
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
