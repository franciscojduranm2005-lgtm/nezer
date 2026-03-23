// ================================================================
//  NZ TECN — Public Store Logic (store.js)
//  Loads active products from nzt_catalogo and handles cart
// ================================================================

import { supabase, TABLES } from './supabase-client.js';

// ── State ─────────────────────────────────────────────────────
let allProducts   = [];
let filteredProducts = [];
let activeCategory = 'all';
let searchQuery    = '';
let cart           = JSON.parse(localStorage.getItem('nzt_cart') || '[]');

// ── Theme State ───────────────────────────────────────────────
let currentTheme   = localStorage.getItem('nzt_theme') || 'light';
if (currentTheme === 'dark') document.body.classList.add('dark-theme');

// ── DOM References ────────────────────────────────────────────
const themeToggle     = document.getElementById('theme-toggle');
const productsGrid    = document.getElementById('products-grid');
const categoryPills   = document.getElementById('category-pills');
const searchInput     = document.getElementById('search-input');
const productCount    = document.getElementById('product-count');
const cartBadge       = document.getElementById('cart-badge');
const cartOverlay     = document.getElementById('cart-overlay');
const cartSidebar     = document.getElementById('cart-sidebar');
const cartItemsList   = document.getElementById('cart-items');
const cartTotal       = document.getElementById('cart-total');
const cartEmptyMsg    = document.getElementById('cart-empty');
const cartOpenBtn     = document.getElementById('cart-open-btn');
const cartCloseBtn    = document.getElementById('cart-close-btn');
const heroTitle       = document.getElementById('hero-title');
const heroSubtitle    = document.getElementById('hero-subtitle');
const heroCta         = document.getElementById('hero-cta');
const heroBgImg       = document.getElementById('hero-bg-img');

// ── Init ──────────────────────────────────────────────────────
async function init() {
  initTheme();
  await Promise.all([loadBanner(), loadProducts()]);
  renderCart();
  updateCartBadge();
  spawnParticles();
  startBatchCaching();
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
  console.log('[NZT] Starting background image caching...');
  let offset = 0;
  const LIMIT = 1000;
  
  while (true) {
    try {
      const { data, error } = await supabase
        .from(TABLES.catalogo)
        .select('imagen_url')
        .eq('activo', true)
        .not('imagen_url', 'is', null)
        .neq('imagen_url', '')
        .range(offset, offset + LIMIT - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      console.log(`[NZT] Caching batch: ${offset} - ${offset + data.length}`);
      data.forEach(p => {
        const img = new Image();
        img.src = p.imagen_url;
      });

      if (data.length < LIMIT) break;
      offset += LIMIT;
      // Wait a bit between batches to not overload the network
      await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
      console.warn('[NZT] Batch caching error:', e.message);
      break; 
    }
  }
}

// ── Banner ────────────────────────────────────────────────────
async function loadBanner() {
  try {
    const { data, error } = await supabase
      .from(TABLES.banners)
      .select('*')
      .limit(1)
      .single();

    if (error || !data) return;

    if (heroTitle)    heroTitle.textContent    = data.titulo    || 'Bienvenido a NZ TECN';
    if (heroSubtitle) heroSubtitle.textContent = data.subtitulo || 'Tecnología de vanguardia a tu alcance';
    if (heroCta)      heroCta.textContent      = data.cta_texto || 'Ver Catálogo';
    if (heroBgImg && data.imagen_url) {
      heroBgImg.src = data.imagen_url;
      heroBgImg.style.display = 'block';
    }
  } catch (e) {
    console.warn('[NZT] Banner load failed:', e.message);
  }
}

// ── Products ──────────────────────────────────────────────────
async function loadProducts() {
  showSkeletons();

  try {
    const { data, error } = await supabase
      .from(TABLES.catalogo)
      .select('id, nombre, precio, categoria, imagen_url')
      .eq('activo', true)
      .not('imagen_url', 'is', null)
      .neq('imagen_url', '')
      .order('id', { ascending: false });

    if (error) throw error;

    allProducts = data || [];
    buildCategoryPills();
    applyFilters();
  } catch (e) {
    console.error('[NZT] Products load failed:', e.message);
    productsGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Error al cargar productos</h3>
        <p>Verifica tu conexión a Supabase.</p>
      </div>`;
  }
}

function showSkeletons(count = 8) {
  productsGrid.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-line price"></div>
      </div>
    </div>`).join('');
}

function buildCategoryPills() {
  const categories = ['Todos', ...new Set(allProducts.map(p => p.categoria).filter(Boolean))];
  categoryPills.innerHTML = categories.map(cat => {
    const val = cat === 'Todos' ? 'all' : cat;
    return `<button class="category-pill ${val === activeCategory ? 'active' : ''}" data-cat="${val}">${cat}</button>`;
  }).join('');

  categoryPills.querySelectorAll('.category-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      categoryPills.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  });
}

function applyFilters() {
  filteredProducts = allProducts.filter(p => {
    const matchCat = activeCategory === 'all' || p.categoria === activeCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      p.nombre?.toLowerCase().includes(q) ||
      p.categoria?.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });
  renderProducts();
}

function renderProducts() {
  if (productCount) productCount.textContent = `${filteredProducts.length} producto${filteredProducts.length !== 1 ? 's' : ''}`;

  if (!filteredProducts.length) {
    productsGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>No hay productos disponibles</h3>
        <p>${searchQuery ? 'No encontramos resultados para tu búsqueda.' : 'El catálogo está vacío por ahora.'}</p>
      </div>`;
    return;
  }

  productsGrid.innerHTML = filteredProducts.map(p => `
    <div class="product-card" data-id="${p.id}">
      <div class="img-wrapper" id="img-wrap-${p.id}">
        <div class="img-reload-overlay" id="reload-overlay-${p.id}">
          <button class="reload-btn" onclick="window.nztReloadImg('${p.id}', '${p.imagen_url}')">
            <i data-lucide="refresh-cw" style="width:16px;height:16px"></i>
          </button>
          <span style="font-size:0.7rem">Error al cargar</span>
        </div>
        <img src="${p.imagen_url}" alt="${p.nombre}" loading="lazy"
             id="prod-img-${p.id}"
             onload="lucide.createIcons();"
             onerror="window.nztHandleImgError('${p.id}')">
      </div>
      <div class="card-body">
        <span class="category-badge">${p.categoria || 'General'}</span>
        <p class="product-name">${p.nombre}</p>
        <p class="product-price">$${Number(p.precio).toFixed(2)}</p>
        <button class="btn btn-primary add-cart-btn" data-id="${p.id}" data-name="${p.nombre}" data-price="${p.precio}" data-img="${p.imagen_url}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          Añadir al Carrito
        </button>
      </div>
    </div>`).join('');
    
  lucide.createIcons();

  // Bind add-to-cart
  productsGrid.querySelectorAll('.add-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addToCart({
        id:    btn.dataset.id,
        name:  btn.dataset.name,
        price: parseFloat(btn.dataset.price),
        img:   btn.dataset.img,
      });
      btn.textContent = '✓ Añadido';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>Añadir al Carrito`;
        btn.disabled = false;
      }, 1200);
    });
  });

  // Bind image expansion
  productsGrid.querySelectorAll('.product-card .img-wrapper img').forEach(img => {
    img.addEventListener('click', () => {
      const card = img.closest('.product-card');
      const name = card.querySelector('.product-name').textContent;
      Swal.fire({
        imageUrl: img.src,
        imageAlt: name,
        showConfirmButton: false,
        showCloseButton: true,
        backdrop: 'rgba(0,0,0,0.92)',
        background: 'transparent',
        padding: '0',
        width: 'auto',
        customClass: {
          image: 'expanded-product-image',
          popup: 'transparent-swal'
        }
      });
    });
  });
}

// ── Search ────────────────────────────────────────────────────
let searchDebounce;
if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = searchInput.value.trim();
      applyFilters();
    }, 280);
  });
}

// ── Hero CTA scroll ───────────────────────────────────────────
if (heroCta) {
  heroCta.addEventListener('click', () => {
    document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
  });
}

// ── Cart Logic ────────────────────────────────────────────────
function saveCart() {
  localStorage.setItem('nzt_cart', JSON.stringify(cart));
}

function addToCart(product) {
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  saveCart();
  renderCart();
  updateCartBadge();
  openCart();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  renderCart();
  updateCartBadge();
}

function updateQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart();
  renderCart();
  updateCartBadge();
}

function updateCartBadge() {
  const total = cart.reduce((sum, i) => sum + i.qty, 0);
  if (cartBadge) {
    cartBadge.textContent = total;
    cartBadge.classList.toggle('hidden', total === 0);
  }
}

function renderCart() {
  if (!cartItemsList) return;
  const isEmpty = cart.length === 0;
  if (cartEmptyMsg) cartEmptyMsg.style.display = isEmpty ? 'block' : 'none';

  cartItemsList.innerHTML = cart.map(item => `
    <div class="cart-item" data-id="${item.id}">
      <img src="${item.img}" alt="${item.name}"
           onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'60\\' height=\\'60\\'%3E%3Crect fill=\\'%231E1E38\\' width=\\'60\\' height=\\'60\\'/%3E%3C/svg%3E'">
      <div class="cart-item-info">
        <p class="cart-item-name">${item.name}</p>
        <p class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</p>
      </div>
      <div class="qty-controls">
        <button class="qty-btn" onclick="window.nztUpdateQty('${item.id}', -1)">−</button>
        <span class="qty-display">${item.qty}</span>
        <button class="qty-btn" onclick="window.nztUpdateQty('${item.id}', 1)">+</button>
        <button class="qty-btn btn-danger" onclick="window.nztRemoveCart('${item.id}')" title="Eliminar"
          style="background:rgba(201,32,46,0.3);border-color:rgba(201,32,46,0.4)">✕</button>
      </div>
    </div>`).join('');

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  if (cartTotal) cartTotal.innerHTML = `<span>$${total.toFixed(2)}</span>`;
}

// Expose to inline handlers
window.nztUpdateQty  = (id, delta) => updateQty(id, delta);
window.nztRemoveCart = (id) => removeFromCart(id);

window.nztHandleImgError = (id) => {
  const overlay = document.getElementById(`reload-overlay-${id}`);
  if (overlay) overlay.classList.add('show');
};

window.nztReloadImg = (id, url) => {
  const img = document.getElementById(`prod-img-${id}`);
  const overlay = document.getElementById(`reload-overlay-${id}`);
  if (img) {
    img.src = `${url}?t=${Date.now()}`; // Bypass cache to retry
    if (overlay) overlay.classList.remove('show');
  }
};

// ── Cart Sidebar Open/Close ───────────────────────────────────
function openCart() {
  cartOverlay?.classList.add('open');
  cartSidebar?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  cartOverlay?.classList.remove('open');
  cartSidebar?.classList.remove('open');
  document.body.style.overflow = '';
}

cartOpenBtn?.addEventListener('click', openCart);
cartCloseBtn?.addEventListener('click', closeCart);
cartOverlay?.addEventListener('click', closeCart);

// ── Particle Effect ───────────────────────────────────────────
function spawnParticles() {
  const hero = document.querySelector('.hero-section');
  if (!hero) return;
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      bottom: ${Math.random() * 40}%;
      animation-delay: ${Math.random() * 4}s;
      animation-duration: ${3 + Math.random() * 3}s;
      opacity: ${0.3 + Math.random() * 0.7};
      width: ${2 + Math.random() * 4}px;
      height: ${2 + Math.random() * 4}px;
    `;
    hero.appendChild(p);
  }
}

// ── Boot ──────────────────────────────────────────────────────
init();
