import { supabase, TABLES, getUser, signIn, signOut } from './supabase-client.js';

// ── Global Error Handler ──────────────────────────────────────
window.onerror = function(msg, url, line, col, error) {
  console.error('[NZT] Critical Admin Error:', { msg, url, line, col, error });
  // Fallback if Swal is not loaded yet
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'error',
      title: 'Error de Aplicación',
      text: 'Ha ocurrido un error inesperado al cargar el panel.',
      footer: `<small>${msg} (Línea ${line})</small>`
    });
  } else {
    alert('Error crítico NZ TECN: ' + msg);
  }
};

// ── Constants ─────────────────────────────────────────────────
const PAGE_SIZE = 1000; // Load 1000 products per page

// ── State ─────────────────────────────────────────────────────
let currentUser        = null;
let inventoryPage      = 1;
let inventoryTotal     = 0;
let inventorySearch    = '';
let inventoryData      = [];
let catalogData        = [];

// ── Theme State ───────────────────────────────────────────────
let currentTheme       = localStorage.getItem('nzt_theme') || 'light';
if (currentTheme === 'dark') document.body.classList.add('dark-theme');

// ── DOM References ────────────────────────────────────────────
const themeToggle      = document.getElementById('theme-toggle');
const loginScreen      = document.getElementById('login-screen');
const adminWrapper     = document.getElementById('admin-wrapper');
const loginForm        = document.getElementById('login-form');
const loginEmail       = document.getElementById('login-email');
const loginPassword    = document.getElementById('login-password');
const loginError       = document.getElementById('login-error');
const loginBtn         = document.getElementById('login-btn');
const logoutBtn        = document.getElementById('logout-btn');
const adminUserEmail   = document.getElementById('admin-user-email');

// Nav items & Tab Panes (initial queries)
let navItems = document.querySelectorAll('.admin-nav-item');
let tabPanes = document.querySelectorAll('.tab-pane');

function refreshDOMReferences() {
  navItems = document.querySelectorAll('.admin-nav-item');
  tabPanes = document.querySelectorAll('.tab-pane');
  console.log(`[NZT] DOM Refresh: ${navItems.length} nav items, ${tabPanes.length} tab panes.`);
}

// Tab 1 — Inventory Sync
const invSearchInput   = document.getElementById('inv-search');
const invTableBody     = document.getElementById('inv-table-body');
const invPagination    = document.getElementById('inv-pagination');
const invTotal         = document.getElementById('inv-total');
const invReloadBtn     = document.getElementById('inv-reload-btn');

// Tab 2 — Catalog Manager
const catalogGrid      = document.getElementById('catalog-grid');
const statTotal        = document.getElementById('stat-total');
const statActive       = document.getElementById('stat-active');
const statPending      = document.getElementById('stat-pending');

// Tab 3 — Banner Editor
const bannerTitle      = document.getElementById('banner-title-input');
const bannerSubtitle   = document.getElementById('banner-subtitle-input');
const bannerImg        = document.getElementById('banner-img-input');
const bannerCta        = document.getElementById('banner-cta-input');
const saveBannerBtn    = document.getElementById('save-banner-btn');
const previewTitle     = document.getElementById('preview-title');
const previewSubtitle  = document.getElementById('preview-subtitle');

// ── Auth Gate ─────────────────────────────────────────────────
function checkAuth() {
  console.log('[NZT] Boot: Checking authentication...');
  initTheme();
  
  try {
    currentUser = getUser(); // sync — reads sessionStorage
    console.log('[NZT] Current user:', currentUser ? currentUser.usuario : 'None');
    
    if (currentUser) {
      showAdminPanel();
      startBatchCaching();
    } else {
      showLoginScreen();
    }
  } catch (err) {
    console.error('[NZT] Auth check failed:', err);
    showLoginScreen();
  }
}

function initTheme() {
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      currentTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.body.classList.toggle('dark-theme', currentTheme === 'dark');
      localStorage.setItem('nzt_theme', currentTheme);
    });
  }
}

// ── Batch Caching ─────────────────────────────────────────────
async function startBatchCaching() {
  console.log('[NZT] Starting admin background image caching...');
  let offset = 0;
  const LIMIT = 1000;
  
  while (true) {
    try {
      // Fetch from both catalog and inventory if needed, but catalog is priority
      const { data, error } = await supabase
        .from(TABLES.catalogo)
        .select('imagen_url')
        .not('imagen_url', 'is', null)
        .neq('imagen_url', '')
        .range(offset, offset + LIMIT - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      console.log(`[NZT] Admin caching batch: ${offset} - ${offset + data.length}`);
      data.forEach(p => {
        const img = new Image();
        img.src = p.imagen_url;
      });

      if (data.length < LIMIT) break;
      offset += LIMIT;
      await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
      console.warn('[NZT] Admin batch caching error:', e.message);
      break; 
    }
  }
}

function showLoginScreen() {
  loginScreen?.classList.remove('hidden');
  adminWrapper?.classList.add('hidden');
}

function showAdminPanel() {
  console.log('[NZT] Showing admin panel...');
  loginScreen?.classList.add('hidden');
  adminWrapper?.classList.remove('hidden');
  
  if (!adminWrapper) {
    console.error('[NZT] Critical: #admin-wrapper not found in DOM!');
    return;
  }

  if (adminUserEmail) adminUserEmail.textContent = currentUser?.usuario || 'Admin';
  
  // Robust tab loading
  refreshDOMReferences();
  if (navItems.length === 0) {
    console.error('[NZT] No nav items found! Re-trying in 100ms...');
    setTimeout(showAdminPanel, 100);
    return;
  }

  requestAnimationFrame(() => {
    loadActiveTab();
  });
}

// ── Login ─────────────────────────────────────────────────────
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError?.classList.remove('show');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Iniciando sesión...';

  try {
    const usuarioInput  = document.getElementById('login-usuario');
    const passwordInput = document.getElementById('login-password');
    currentUser = await signIn(usuarioInput.value.trim(), passwordInput.value);
    showAdminPanel();
  } catch (err) {
    loginError.textContent = err.message || 'Usuario o contraseña incorrectos.';
    loginError?.classList.add('show');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Iniciar Sesión';
  }
});

// ── Logout ────────────────────────────────────────────────────
logoutBtn?.addEventListener('click', () => {
  signOut(); // sync — borra sessionStorage
  currentUser = null;
  showLoginScreen();
  Swal.fire({
    icon: 'info',
    title: 'Sesión cerrada',
    text: 'Has cerrado sesión exitosamente.',
    timer: 1500,
    showConfirmButton: false,
  });
});

// ── Tab Navigation ────────────────────────────────────────────
navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const target = item.dataset.tab;
    console.log('[NZT] Nav Click: switching to', target);
    
    // Ensure we have current references
    refreshDOMReferences(); 
    
    tabPanes.forEach(pane => {
      const isTarget = pane.id === `tab-${target}`;
      pane.classList.toggle('hidden', !isTarget);
    });
    
    if (target === 'sync')    loadInventory();
    if (target === 'catalog') loadCatalog();
    if (target === 'banners') loadBannerForm();
  });
});

function loadActiveTab() {
  refreshDOMReferences();
  const activeNav = document.querySelector('.admin-nav-item.active') || navItems[0];
  console.log('[NZT] loadActiveTab activeNav:', activeNav ? activeNav.id : 'NONE');
  
  if (activeNav) {
    const target = activeNav.dataset.tab;
    console.log('[NZT] Switching to tab:', target);
    
    tabPanes.forEach(pane => {
      const isTarget = pane.id === `tab-${target}`;
      pane.classList.toggle('hidden', !isTarget);
      console.log(`[NZT] Tab ${pane.id} visibility: ${!isTarget ? 'HIDDEN' : 'VISIBLE'}`);
    });

    if (target === 'sync')    loadInventory();
    if (target === 'catalog') loadCatalog();
    if (target === 'banners') loadBannerForm();
  } else {
    console.warn('[NZT] No active nav item found for loadActiveTab');
  }
}

// ── TAB 1: Inventory Sync ─────────────────────────────────────
// Reads from the SECOND Supabase project (inventorySupabase)
// Table: products  Columns: id, nombre, descripcion, departamento,
//                           precio_cliente, precio_mayor, precio_gmayor,
//                           stock, imagen_url, codigo, estado

async function loadInventory(page = 1) {
  inventoryPage = page;
  invTableBody.innerHTML = `
    <tr>
      <td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">
        <div class="spinner" style="margin:auto;margin-bottom:16px"></div>
        <div style="font-size:0.85rem">Cargando productos (${PAGE_SIZE} por página)…</div>
      </td>
    </tr>`;

  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  try {
    let query = supabase
      .from(TABLES.inventario)
      .select(
        'id, nombre, descripcion, departamento, precio_cliente, precio_mayor, precio_gmayor, stock, imagen_url, codigo, estado',
        { count: 'exact' }
      )
      .range(from, to)
      .order('nombre', { ascending: true });

    if (inventorySearch) {
      query = query.or(`nombre.ilike.%${inventorySearch}%,codigo.ilike.%${inventorySearch}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    inventoryData  = data || [];
    inventoryTotal = count || 0;

    if (invTotal) {
      const pageStart = from + 1;
      const pageEnd   = Math.min(from + inventoryData.length, inventoryTotal);
      invTotal.textContent = `Mostrando ${pageStart}–${pageEnd} de ${inventoryTotal.toLocaleString()} productos`;
    }

    renderInventoryTable();
    renderInventoryPagination();
  } catch (e) {
    invTableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center;color:#f87171;padding:32px">
          <div style="font-size:1.5rem;margin-bottom:8px">⚠</div>
          <strong>Error al conectar con el inventario</strong><br>
          <span style="font-size:0.82rem;color:var(--text-muted)">${e.message}</span><br>
          <span style="font-size:0.78rem;color:var(--text-muted);margin-top:8px;display:block">
            Verifica que INVENTORY_URL y INVENTORY_ANON_KEY estén configurados en supabase-client.js
          </span>
        </td>
      </tr>`;
  }
}

function renderInventoryTable() {
  if (!inventoryData.length) {
    invTableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">
          <div style="font-size:2rem;margin-bottom:12px">📦</div>
          No se encontraron productos en el inventario.
        </td>
      </tr>`;
    return;
  }

  invTableBody.innerHTML = inventoryData.map(p => {
    const stockColor = p.stock > 10 ? '#4ade80' : p.stock > 0 ? '#facc15' : '#f87171';
    const stockLabel = p.stock > 0 ? p.stock : 'Agotado';
    const imgThumb   = p.imagen_url
      ? `<div style="position:relative;width:40px;height:40px">
           <div class="img-reload-overlay" id="reload-overlay-inv-${p.id}" style="border-radius:6px">
             <button class="reload-btn" onclick="window.nztReloadImgInv('${p.id}', '${p.imagen_url}')" style="width:24px;height:24px">
               <i data-lucide="refresh-cw" style="width:12px;height:12px"></i>
             </button>
           </div>
           <img src="${p.imagen_url}" alt="" id="inv-img-${p.id}"
                style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color)"
                onerror="window.nztHandleImgErrorInv('${p.id}')">
         </div>`
      : `<div style="width:40px;height:40px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border-color);display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:var(--text-muted)">N/A</div>`;

    return `
      <tr>
        <td style="padding:10px 8px">${imgThumb}</td>
        <td style="font-family:monospace;font-size:0.78rem;color:var(--text-muted)">${p.codigo || '—'}</td>
        <td style="font-weight:600;max-width:200px">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.nombre}</div>
          ${p.descripcion ? `<div style="font-size:0.73rem;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.descripcion.substring(0, 60)}${p.descripcion.length > 60 ? '…' : ''}</div>` : ''}
        </td>
        <td style="font-size:0.82rem;color:var(--text-muted)">${p.departamento || '—'}</td>
        <td style="font-weight:700;color:#a78bfa">$${Number(p.precio_cliente || 0).toFixed(2)}</td>
        <td style="color:#60a5fa">$${Number(p.precio_mayor || 0).toFixed(2)}</td>
        <td style="color:#34d399">$${Number(p.precio_gmayor || 0).toFixed(2)}</td>
        <td>
          <span style="font-weight:700;color:${stockColor}">${stockLabel}</span>
        </td>
        <td>
          <button class="btn btn-primary btn-sm import-btn"
            data-id="${p.id}"
            data-nombre="${encodeURIComponent(p.nombre)}"
            data-descripcion="${encodeURIComponent(p.descripcion || '')}"
            data-departamento="${encodeURIComponent(p.departamento || 'General')}"
            data-precio-cliente="${p.precio_cliente || 0}"
            data-precio-mayor="${p.precio_mayor || 0}"
            data-precio-gmayor="${p.precio_gmayor || 0}"
            data-stock="${p.stock || 0}"
            data-codigo="${encodeURIComponent(p.codigo || '')}"
            data-imagen="${encodeURIComponent(p.imagen_url || '')}"
            style="white-space:nowrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Al Catálogo
          </button>
        </td>
      </tr>`;
  }).join('');

  invTableBody.querySelectorAll('.import-btn').forEach(btn => {
    btn.addEventListener('click', () => importProduct({
      id:             btn.dataset.id,
      nombre:         decodeURIComponent(btn.dataset.nombre),
      descripcion:    decodeURIComponent(btn.dataset.descripcion),
      departamento:   decodeURIComponent(btn.dataset.departamento),
      precio_cliente: btn.dataset.precioCliente,
      precio_mayor:   btn.dataset.precioMayor,
      precio_gmayor:  btn.dataset.precioGmayor,
      stock:          btn.dataset.stock,
      codigo:         decodeURIComponent(btn.dataset.codigo),
      imagen_url:     decodeURIComponent(btn.dataset.imagen),
    }));
  });
}

function renderInventoryPagination() {
  const totalPages = Math.ceil(inventoryTotal / PAGE_SIZE);
  if (!invPagination) return;
  if (totalPages <= 1) { invPagination.innerHTML = ''; return; }

  const pages = [];
  if (inventoryPage > 1) pages.push(`<button class="page-btn" data-page="${inventoryPage - 1}">← Anterior</button>`);

  // Page number pills: show first, current±2, last
  const range = new Set([1, totalPages]);
  for (let i = Math.max(1, inventoryPage - 2); i <= Math.min(totalPages, inventoryPage + 2); i++) range.add(i);
  let prev = 0;
  [...range].sort((a, b) => a - b).forEach(i => {
    if (prev && i - prev > 1) pages.push(`<span style="padding:0 4px;color:var(--text-muted)">…</span>`);
    pages.push(`<button class="page-btn ${i === inventoryPage ? 'active' : ''}" data-page="${i}">${i}</button>`);
    prev = i;
  });

  if (inventoryPage < totalPages) pages.push(`<button class="page-btn" data-page="${inventoryPage + 1}">Siguiente →</button>`);

  invPagination.innerHTML = pages.join('');
  invPagination.querySelectorAll('.page-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => loadInventory(parseInt(btn.dataset.page)));
  });
}

// ── Import Product ────────────────────────────────────────────
async function importProduct(product) {
  const hasExistingImage = product.imagen_url && product.imagen_url !== '';

  const result = await Swal.fire({
    title: `<span style="font-size:1.1rem">Añadir al Catálogo</span>`,
    html: `
      <div style="text-align:left;font-size:0.87rem;color:var(--text-secondary)">
        ${hasExistingImage
          ? `<div style="display:flex;justify-content:center;margin-bottom:12px">
               <img src="${product.imagen_url}" style="max-height:100px;border-radius:8px;border:1px solid var(--border-color)">
             </div>`
          : ''}
        <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
          <tr><td style="color:var(--text-muted);padding:3px 0;width:40%">Código</td><td style="font-family:monospace;color:var(--text-primary)">${product.codigo || '—'}</td></tr>
          <tr><td style="color:var(--text-muted);padding:3px 0">Producto</td><td style="font-weight:600;color:var(--text-primary)">${product.nombre}</td></tr>
          <tr><td style="color:var(--text-muted);padding:3px 0">Depto.</td><td>${product.departamento || '—'}</td></tr>
        </table>
        <p style="font-size:0.85rem;color:var(--text-primary);margin-bottom:4px;font-weight:600">Precio de venta:</p>
        <input type="number" id="swal-input-price" class="swal2-input" style="margin-top:0;margin-bottom:12px;width:100%" step="0.01" value="${product.precio_cliente || 0}">
        
        <p style="font-size:0.85rem;color:var(--text-primary);margin-bottom:4px;font-weight:600">URL de la imagen:</p>
        <input type="url" id="swal-input-url" class="swal2-input" style="margin-top:0;width:100%" placeholder="https://i.ibb.co/..." value="${product.imagen_url || ''}">
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'Añadir al Catálogo',
    cancelButtonText: 'Cancelar',
    preConfirm: () => {
      const price = document.getElementById('swal-input-price').value;
      const url   = document.getElementById('swal-input-url').value;
      if (!price || isNaN(price)) {
        Swal.showValidationMessage('Ingresa un precio válido');
        return false;
      }
      return { price, url };
    },
    didOpen: () => {
      // Automáticamente enfoca la URL para facilitar el pegado
      const urlInput = document.getElementById('swal-input-url');
      if (urlInput) {
        urlInput.focus();
        urlInput.select();
      }
    }
  });

  if (!result || !result.value) return;
  const { price: priceInput, url: finalImage } = result.value;
  const finalValue = parseFloat(priceInput) || 0;

  try {
    const { error } = await supabase.from(TABLES.catalogo).insert({
      origin_id:      String(product.id),
      nombre:         product.nombre,
      descripcion:    product.descripcion,
      precio:         finalValue,
      precio_mayor:   finalValue,
      precio_gmayor:  finalValue,
      categoria:      product.departamento || 'General',
      codigo:         product.codigo,
      stock:          parseInt(product.stock) || 0,
      imagen_url:     finalImage || null,
      activo:         true,
    });
    if (error) throw error;

    await Swal.fire({
      icon: 'success',
      title: '¡Importado con éxito!',
      html: `<p style="font-size:0.9rem;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">${product.nombre}</strong> fue añadido al catálogo.<br>
        Actívalo en <strong>Gestionar Catálogo</strong>.
      </p>`,
      timer: 2800,
      timerProgressBar: true,
      showConfirmButton: false,
    });
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'Error', text: e.message });
  }
}

// ── Inventory Search & Reload ─────────────────────────────────
let invSearchDebounce;
invSearchInput?.addEventListener('input', () => {
  clearTimeout(invSearchDebounce);
  invSearchDebounce = setTimeout(() => {
    inventorySearch = invSearchInput.value.trim();
    loadInventory(1);
  }, 400);
});

invReloadBtn?.addEventListener('click', () => {
  inventorySearch = '';
  if (invSearchInput) invSearchInput.value = '';
  loadInventory(1);
});

// ── TAB 2: Catalog Manager ────────────────────────────────────
async function loadCatalog() {
  catalogGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px"><div class="spinner spinner-lg" style="margin:auto"></div></div>`;

  try {
    const { data, error } = await supabase
      .from(TABLES.catalogo)
      .select('*')
      .order('id', { ascending: false });
    if (error) throw error;

    catalogData = data || [];
    updateCatalogStats();
    renderCatalogGrid();
  } catch (e) {
    catalogGrid.innerHTML = `<div style="grid-column:1/-1;color:#f87171;padding:24px">Error: ${e.message}</div>`;
  }
}

function updateCatalogStats() {
  if (statTotal)   statTotal.textContent   = catalogData.length;
  if (statActive)  statActive.textContent  = catalogData.filter(p => p.activo && p.imagen_url).length;
  if (statPending) statPending.textContent = catalogData.filter(p => !p.activo || !p.imagen_url).length;
}

function renderCatalogGrid() {
  if (!catalogData.length) {
    catalogGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:64px;color:var(--text-muted)">
        <div style="font-size:3rem;margin-bottom:16px;opacity:0.4">📦</div>
        <h3 style="color:var(--text-secondary);margin-bottom:8px">Catálogo vacío</h3>
        <p style="font-size:0.9rem">Importa productos desde la pestaña "Sincronizar Inventario".</p>
      </div>`;
    return;
  }

  catalogGrid.innerHTML = catalogData.map(p => {
    const hasImage    = p.imagen_url && p.imagen_url.trim() !== '';
    const statusClass = hasImage && p.activo ? 'active' : (!hasImage ? 'no-image' : 'inactive');
    const statusLabel = hasImage && p.activo ? '● Activo' : (!hasImage ? '⚠ Sin imagen' : '○ Inactivo');

    return `
      <div class="catalog-card" id="ccard-${p.id}">
        ${hasImage
          ? `<div style="position:relative;width:100%;aspect-ratio:1/1">
               <div class="img-reload-overlay" id="reload-overlay-cat-${p.id}">
                 <button class="reload-btn" onclick="window.nztReloadImgCat('${p.id}', '${p.imagen_url}')">
                   <i data-lucide="refresh-cw" style="width:16px;height:16px"></i>
                 </button>
                 <span style="font-size:0.6rem">Error</span>
               </div>
               <img class="catalog-card-img" src="${p.imagen_url}" alt="${p.nombre}" loading="lazy" id="cat-img-${p.id}"
                    style="width:100%;height:100%;object-fit:cover"
                    onerror="window.nztHandleImgErrorCat('${p.id}')">
             </div>`
          : `<div class="catalog-card-img no-image">
               <span style="font-size:0.8rem;color:var(--text-muted)">Sin imagen</span>
             </div>`}
        <div class="catalog-card-body">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px">
            <p class="catalog-card-name">${p.nombre}</p>
            <span class="status-badge ${statusClass}">${statusLabel}</span>
          </div>
          ${p.codigo ? `<p style="font-family:monospace;font-size:0.72rem;color:var(--text-muted);margin-bottom:4px">${p.codigo}</p>` : ''}
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:8px">
            <div style="background:rgba(167,139,250,0.1);border-radius:6px;padding:4px 6px;text-align:center">
              <div style="font-size:0.65rem;color:var(--text-muted)">Cliente</div>
              <div style="font-size:0.82rem;font-weight:700;color:#a78bfa">$${Number(p.precio || 0).toFixed(2)}</div>
            </div>
            <div style="background:rgba(96,165,250,0.1);border-radius:6px;padding:4px 6px;text-align:center">
              <div style="font-size:0.65rem;color:var(--text-muted)">Mayor</div>
              <div style="font-size:0.82rem;font-weight:700;color:#60a5fa">$${Number(p.precio_mayor || 0).toFixed(2)}</div>
            </div>
            <div style="background:rgba(52,211,153,0.1);border-radius:6px;padding:4px 6px;text-align:center">
              <div style="font-size:0.65rem;color:var(--text-muted)">G. Mayor</div>
              <div style="font-size:0.82rem;font-weight:700;color:#34d399">$${Number(p.precio_gmayor || 0).toFixed(2)}</div>
            </div>
          </div>
          <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px">
            Stock: <strong style="color:${(p.stock||0) > 0 ? '#4ade80' : '#f87171'}">${p.stock || 0}</strong>
            · <span>${p.categoria || 'General'}</span>
          </p>
          <input class="url-input" id="url-${p.id}" type="url"
            placeholder="https://i.ibb.co/xxxxx/imagen.jpg"
            value="${p.imagen_url || ''}">
          <div class="catalog-card-actions">
            <button class="btn btn-accent btn-sm save-url-btn" data-id="${p.id}">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Guardar
            </button>
            <label class="toggle-switch" title="${p.activo ? 'Desactivar' : 'Activar'}">
              <input type="checkbox" class="toggle-active" data-id="${p.id}" ${p.activo ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <button class="btn btn-danger btn-sm delete-btn" data-id="${p.id}" title="Eliminar del catálogo">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
      </div>`;
  }).join('');

  // Save URL
  catalogGrid.querySelectorAll('.save-url-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id  = btn.dataset.id;
      const url = document.getElementById(`url-${id}`).value.trim();

      if (url && !(function() { try { new URL(url); return true; } catch { return false; } })()) {
        Swal.fire({ icon: 'warning', title: 'URL inválida', text: 'Por favor ingresa una URL de imagen válida.', timer: 2000, showConfirmButton: false });
        return;
      }

      btn.disabled = true;
      btn.textContent = '...';
      try {
        const { error } = await supabase.from(TABLES.catalogo).update({ imagen_url: url || null }).eq('id', id);
        if (error) throw error;
        const idx = catalogData.findIndex(p => p.id == id);
        if (idx !== -1) catalogData[idx].imagen_url = url || null;
        showToast('Imagen actualizada ✓', 'success');
        loadCatalog();
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: e.message });
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Toggle active
  catalogGrid.querySelectorAll('.toggle-active').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const id = toggle.dataset.id;
      const newState = toggle.checked;
      try {
        const { error } = await supabase.from(TABLES.catalogo).update({ activo: newState }).eq('id', id);
        if (error) throw error;
        const idx = catalogData.findIndex(p => p.id == id);
        if (idx !== -1) catalogData[idx].activo = newState;
        updateCatalogStats();
        showToast(newState ? 'Producto activado ✓' : 'Producto desactivado', newState ? 'success' : 'info');
      } catch (e) {
        toggle.checked = !newState;
        Swal.fire({ icon: 'error', title: 'Error', text: e.message });
      }
    });
  });

  // Delete
  catalogGrid.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id   = btn.dataset.id;
      const item = catalogData.find(p => p.id == id);

      const result = await Swal.fire({
        icon: 'warning',
        title: '¿Eliminar producto?',
        html: `<p style="font-size:0.9rem;color:var(--text-secondary)"><strong style="color:var(--text-primary)">${item?.nombre}</strong> será eliminado del catálogo público.<br>No afecta al inventario original.</p>`,
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText:  'Cancelar',
      });

      if (!result.isConfirmed) return;

      try {
        const { error } = await supabase.from(TABLES.catalogo).delete().eq('id', id);
        if (error) throw error;
        catalogData = catalogData.filter(p => p.id != id);
        updateCatalogStats();
        renderCatalogGrid();
        showToast('Producto eliminado del catálogo', 'info');
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: e.message });
      }
    });
  });
}

// ── TAB 3: Banner Editor ──────────────────────────────────────
async function loadBannerForm() {
  try {
    const { data } = await supabase.from(TABLES.banners).select('*').limit(1).single();
    if (data) {
      if (bannerTitle)    { bannerTitle.value    = data.titulo    || ''; updatePreview(); }
      if (bannerSubtitle) { bannerSubtitle.value = data.subtitulo || ''; updatePreview(); }
      if (bannerImg)      bannerImg.value        = data.imagen_url || '';
      if (bannerCta)      bannerCta.value        = data.cta_texto  || '';
    }
  } catch (e) {
    console.warn('[NZT] Banner form load:', e.message);
  }
}

function updatePreview() {
  if (previewTitle)    previewTitle.textContent    = bannerTitle?.value    || 'Bienvenido a NZ TECN';
  if (previewSubtitle) previewSubtitle.textContent = bannerSubtitle?.value || 'Tecnología de vanguardia a tu alcance';
}

bannerTitle?.addEventListener('input', updatePreview);
bannerSubtitle?.addEventListener('input', updatePreview);

saveBannerBtn?.addEventListener('click', async () => {
  saveBannerBtn.disabled = true;
  saveBannerBtn.textContent = 'Guardando...';

  try {
    const { data: existing } = await supabase.from(TABLES.banners).select('id').limit(1).single();
    const payload = {
      titulo:     bannerTitle?.value    || '',
      subtitulo:  bannerSubtitle?.value || '',
      imagen_url: bannerImg?.value      || '',
      cta_texto:  bannerCta?.value      || 'Ver Catálogo',
    };

    let err;
    if (existing?.id) {
      ({ error: err } = await supabase.from(TABLES.banners).update(payload).eq('id', existing.id));
    } else {
      ({ error: err } = await supabase.from(TABLES.banners).insert(payload));
    }
    if (err) throw err;

    Swal.fire({
      icon: 'success',
      title: '¡Banner guardado!',
      text: 'Los cambios se verán en la tienda pública.',
      timer: 2000,
      showConfirmButton: false,
    });
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'Error', text: e.message });
  } finally {
    saveBannerBtn.disabled = false;
    saveBannerBtn.textContent = 'Guardar Banner';
  }
});

// ── Toast Helper ──────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const colors = { success: '#4ade80', error: '#f87171', info: 'var(--primary-light)', warning: '#facc15' };
  const icons  = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const toast  = document.createElement('div');
  toast.className = 'toast';
  toast.style.borderColor = colors[type] + '44';
  toast.innerHTML = `
    <span style="color:${colors[type]};font-size:1.1rem">${icons[type]}</span>
    <span>${msg}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Expose to inline handlers
window.nztHandleImgErrorInv = (id) => {
  const overlay = document.getElementById(`reload-overlay-inv-${id}`);
  if (overlay) overlay.classList.add('show');
};

window.nztReloadImgInv = (id, url) => {
  const img = document.getElementById(`inv-img-${id}`);
  const overlay = document.getElementById(`reload-overlay-inv-${id}`);
  if (img) {
    img.src = `${url}?t=${Date.now()}`;
    if (overlay) overlay.classList.remove('show');
  }
};

window.nztHandleImgErrorCat = (id) => {
  const overlay = document.getElementById(`reload-overlay-cat-${id}`);
  if (overlay) overlay.classList.add('show');
};

window.nztReloadImgCat = (id, url) => {
  const img = document.getElementById(`cat-img-${id}`);
  const overlay = document.getElementById(`reload-overlay-cat-${id}`);
  if (img) {
    img.src = `${url}?t=${Date.now()}`;
    if (overlay) overlay.classList.remove('show');
  }
};

// ── Boot ──────────────────────────────────────────────────────
window.__NZT_BOOTED = true;
checkAuth();
