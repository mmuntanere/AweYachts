// Shared logic for the brochure generator: default data, page rendering and image upload.
// Rendering mirrors the broker spec-sheet PDFs; styles live in src/styles/brochure.css.

export const PAGE_W = 1480;
export const PAGE_H = 812;
const SIDE_W = 365;

export const PAGE_TYPES = {
  cover: 'Cover',
  specs: 'Particulars & Key Features',
  about: 'About',
  photos: 'Photos',
  plan: 'General Arrangement',
  text: 'Text (Specifications, Refits...)',
  closing: 'Closing',
};

export const PHOTO_LAYOUTS = {
  full: { label: 'Full page (1 photo)', count: 1 },
  split: { label: 'Side by side (2 photos)', count: 2 },
  collage: { label: 'Collage (3 photos)', count: 3 },
  grid: { label: 'Grid (4 photos)', count: 4 },
  portraits: { label: 'Two portraits (vertical photos)', count: 2 },
};

const DEFAULT_SPECS = [
  ['Price'], ['Year Built'], ['Refits'],
  ['Builder'], ['Naval Architect'], ['Interior Designer'],
  ['LOA'], ['Beam'], ['Draft'],
  ['Displacement'], ['Hull Colour'], ['Construction'],
  ['Classification', 'wide'], ['Flag'],
  ['Accommodation', 'wide'], ['Crew'],
];

export const emptyImage = () => ({ url: '', focus: 'center' });

export function newPage(type) {
  switch (type) {
    case 'cover': return { type, image: emptyImage() };
    case 'specs': return {
      type, image: emptyImage(), features: [''],
      specs: DEFAULT_SPECS.map(([label, width = 'normal']) => ({ label, value: '', width })),
    };
    case 'about': return { type, image: emptyImage(), lead: '', body: '' };
    case 'photos': return { type, layout: 'full', caption: '', images: [emptyImage()] };
    case 'plan': return { type, title: 'General Arrangement', images: [emptyImage()] };
    case 'text': return { type, title: 'Specifications', style: 'list', image: emptyImage(), sections: [{ title: '', items: [{ label: '', value: '' }] }] };
    case 'closing': return { type, image: emptyImage() };
  }
}

export function newBrochure() {
  const refits = newPage('text');
  refits.title = 'Refits & Upgrades';
  return {
    name: '', price: '', length: '', builder: '', year: '',
    branding: true,
    contact: { name: 'AWE Yachts', email: 'alex@aweyachts.com', phone: '+34 614 582 862', web: 'aweyachts.com' },
    pages: [newPage('cover'), newPage('specs'), newPage('about'), newPage('photos'), newPage('plan'), newPage('text'), refits, newPage('closing')],
  };
}

const imageUrl = (src) => (!src ? '' : src.startsWith('http') ? src : `/${src}`);

// ---------- Photo orientation ----------

const WHITE = 232;
const analyses = new Map();

// Some photos come padded with white bands (e.g. a vertical photo saved as a landscape file).
// Returns the image's real size once those bands are trimmed, and a cropped copy to print.
const analyze = (url) => {
  if (!analyses.has(url)) {
    analyses.set(url, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => trimWhite(img, url).then(resolve);
      img.onerror = () => resolve(null);
      img.src = url;
    }));
  }
  return analyses.get(url);
};

async function trimWhite(img, url) {
  const { naturalWidth: w, naturalHeight: h } = img;
  try {
    // Look for the bands on a small copy, then crop the original.
    const scale = Math.min(1, 400 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const white = (x, y) => { const i = (y * c.width + x) * 4; return d[i] > WHITE && d[i + 1] > WHITE && d[i + 2] > WHITE; };
    // A band line is (almost) all white; a few stray pixels from compression are tolerated.
    const col = (x) => { let n = 0; for (let y = 0; y < c.height; y++) n += white(x, y); return n >= c.height * 0.98; };
    const row = (y) => { let n = 0; for (let x = 0; x < c.width; x++) n += white(x, y); return n >= c.width * 0.98; };

    let l = 0, r = c.width - 1, t = 0, b = c.height - 1;
    while (l < r && col(l)) l++;
    while (r > l && col(r)) r--;
    while (t < b && row(t)) t++;
    while (b > t && row(b)) b--;
    const cw = r - l + 1, ch = b - t + 1;
    const trimmed = cw < c.width * 0.97 || ch < c.height * 0.97;
    if (!trimmed || cw < c.width * 0.25 || ch < c.height * 0.25) return { w, h, src: url };

    // Skip one extra pixel on trimmed sides to avoid a light seam from the resampling.
    const sx = (l > 0 ? l + 1 : 0) / scale, sy = (t > 0 ? t + 1 : 0) / scale;
    const sw = (r < c.width - 1 ? r : r + 1) / scale - sx, sh = (b < c.height - 1 ? b : b + 1) / scale - sy;
    const out = Math.min(1, 2400 / Math.max(sw, sh));
    const oc = document.createElement('canvas');
    oc.width = Math.round(sw * out);
    oc.height = Math.round(sh * out);
    oc.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, oc.width, oc.height);
    const blob = await new Promise(res => oc.toBlob(res, 'image/jpeg', 0.9));
    return { w: oc.width, h: oc.height, src: blob ? URL.createObjectURL(blob) : url };
  } catch {
    // Canvas unavailable (e.g. image served without CORS): use the photo as is.
    return { w, h, src: url };
  }
}

const isPortrait = async (url) => {
  const size = url && await analyze(url);
  return !!size && size.h > size.w * 1.05;
};

// Turns a list of images into photo pages: each vertical photo is paired with the next
// vertical one on a "portraits" page, everything else gets a full page.
export async function photoPages(images) {
  const portrait = await Promise.all(images.map(i => isPortrait(i.url)));
  const used = new Set();
  const pages = [];
  for (let n = 0; n < images.length; n++) {
    if (used.has(n)) continue;
    const partner = portrait[n] ? portrait.findIndex((p, m) => m > n && p && !used.has(m)) : -1;
    if (partner !== -1) {
      used.add(partner);
      pages.push({ type: 'photos', layout: 'portraits', caption: '', images: [images[n], images[partner]] });
    } else {
      pages.push({ type: 'photos', layout: 'full', caption: '', images: [images[n]] });
    }
  }
  return pages;
}

// Prefill a brochure from a yacht of the fleet (yachts table).
export async function brochureFromYacht(y) {
  const b = newBrochure();
  const loa = y.length_sort ? `${(y.length_sort * 0.0254).toFixed(2)}M` : '';
  Object.assign(b, { name: y.name || '', price: y.price || '', length: loa, builder: y.type || '', year: y.year || '' });

  const [cover, specs, about] = b.pages;
  cover.image.url = imageUrl(y.main_image);
  const values = { 'Price': y.price, 'Year Built': y.year, 'Builder': y.type, 'LOA': loa, 'Accommodation': y.guests, 'Crew': y.crew_cabins };
  specs.specs.forEach(s => { s.value = values[s.label] || ''; });
  about.body = y.description || '';

  const gallery = await photoPages((y.gallery || []).map(src => ({ url: imageUrl(src), focus: 'center' })));
  if (gallery.length) {
    specs.image.url = imageUrl(y.gallery[0]);
    b.pages.splice(3, 1, ...gallery);
  }
  return b;
}

// Pages left without content are skipped when the brochure is rendered.
const filled = (v) => String(v ?? '').trim() !== '';
const hasImage = (p) => (p.images || []).some(i => i?.url);
export function isEmptyPage(p) {
  switch (p.type) {
    case 'specs': return !(p.specs || []).some(s => filled(s.value)) && !(p.features || []).some(filled);
    case 'about': return !filled(p.lead) && !filled(p.body);
    case 'photos':
    case 'plan': return !hasImage(p);
    case 'text': return !(p.sections || []).some(s => (s.items || []).some(i => filled(i.label) || filled(i.value)));
    default: return false; // cover and closing always print
  }
}

// ---------- Rendering ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Escaped text with **bold** support.
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const paragraphs = (s) => String(s || '').split(/\n\s*\n/).filter(p => p.trim()).map(p => `<p>${rich(p.trim())}</p>`).join('');
const slash = '<span class="bp-slash">/</span>';

function img(image, cls = 'bp-bg') {
  if (!image?.url) return `<div class="${cls === 'bp-bg' ? 'bp-placeholder' : cls + ' bp-ph'}"></div>`;
  return `<img class="${cls}" src="${esc(image.url)}" style="object-position:center ${image.focus || 'center'}" alt="">`;
}

function pageEl(html) {
  const el = document.createElement('section');
  el.className = 'bp-page';
  el.innerHTML = html;
  return el;
}

const logo = (data, cls) => (data.branding ? `<img class="${cls}" src="/logo.png" alt="AWE Yachts">` : '');

const renderers = {
  cover(p, d) {
    const meta = [d.price && `<strong>Price:</strong>${esc(d.price)}`, esc(d.length), esc(d.builder), esc(d.year)].filter(Boolean).join(slash);
    return pageEl(`${img(p.image)}${d.branding ? '<div class="bp-cover-fade"></div>' : ''}${logo(d, 'bp-cover-logo')}
      <div class="bp-band"><div class="bp-band-row"><div class="bp-band-name">${esc(d.name)}</div><div class="bp-band-meta">${meta}</div></div><div class="bp-band-line"></div></div>`);
  },
  specs(p, d) {
    const specs = (p.specs || []).filter(s => s.label || s.value).map(s =>
      `<div class="bp-spec ${s.width !== 'normal' ? s.width : ''}"><div class="bp-spec-label">${esc(s.label)}</div><div class="bp-spec-value">${esc(s.value)}</div></div>`).join('');
    const features = (p.features || []).filter(f => f.trim()).map(f => `<div class="bp-feature">${esc(f)}</div>`).join('');
    return pageEl(`${img(p.image)}<div class="bp-shade"></div>
      <div class="bp-specs"><div class="bp-specs-head"><h2>${esc(d.name)}</h2>${features ? '<h2>Key Features</h2>' : ''}</div>
      <div class="bp-specs-body"><div class="bp-spec-grid">${specs}</div><div class="bp-features">${features}</div></div></div>`);
  },
  about(p, d) {
    const hasSide = !!p.image?.url;
    const el = pageEl(`${hasSide ? img(p.image, 'bp-side') : ''}
      <div class="bp-about" style="right:${hasSide ? SIDE_W + 45 : 55}px; overflow:hidden">
        <h2 class="bp-title">About ${esc(d.name)}</h2>
        ${p.lead ? `<div class="bp-about-lead">${rich(p.lead)}</div>` : '<div style="height:26px"></div>'}
        <div class="bp-about-body">${paragraphs(p.body)}</div>
      </div>`);
    el._fit = () => fitAbout(el);
    return el;
  },
  photos(p, d) {
    const layout = PHOTO_LAYOUTS[p.layout] ? p.layout : 'full';
    const imgs = Array.from({ length: PHOTO_LAYOUTS[layout].count }, (_, i) => img(p.images?.[i], '')).join('');
    const [main, ...rest] = String(p.caption || '').split('/').map(s => s.trim()).filter(Boolean);

    if (layout === 'portraits') {
      return pageEl(`<div class="bp-portraits">
        <div class="bp-portraits-text"><h2 class="bp-title">${esc(main || d.name)}</h2>${rest.length ? `<div class="bp-portraits-sub">${rest.map(esc).join(slash)}</div>` : ''}</div>
        <div class="bp-portraits-imgs">${imgs}</div></div>`);
    }

    const caption = main ? `<div class="bp-caption"><strong>${esc(main)}</strong>${rest.map(r => slash + esc(r)).join('')}</div>` : '';
    const single = p.images?.[0];
    if (layout === 'full' && portraitUrls.has(single?.url)) {
      // A lone vertical photo (odd one out after pairing): shown whole on a solid background instead of being cropped.
      return pageEl(`<div class="bp-photos full bp-solid"><img class="bp-contain" src="${esc(single.url)}" alt=""></div>${caption}`);
    }
    return pageEl(`<div class="bp-photos ${layout}">${imgs}</div>${caption}`);
  },
  plan(p) {
    const imgs = (p.images || []).filter(i => i.url).map(i => `<img src="${esc(i.url)}" alt="">`).join('');
    return pageEl(`<div class="bp-plan"><h2 class="bp-title">${esc(p.title)}</h2><div class="bp-plan-imgs">${imgs}</div></div>`);
  },
  closing(p, d) {
    const c = d.contact || {};
    const contact = d.branding
      ? `<div class="bp-contact">${c.name ? `<strong>${esc(c.name)}</strong><br>` : ''}${[c.email, c.phone, c.web].filter(Boolean).map(esc).join(slash)}</div>`
      : '';
    return pageEl(`${img(p.image)}<div class="bp-shade" style="background:rgba(6,16,32,0.62)"></div>
      <div class="bp-closing">${logo(d, 'bp-closing-logo')}<h2>${esc(d.name)}</h2><div class="bp-closing-line"></div>${contact}</div>`);
  },
};

// Shrink the About body text until it fits on its page.
function fitAbout(el) {
  const box = el.querySelector('.bp-about');
  const body = el.querySelector('.bp-about-body');
  let size = 12.5;
  while (box.scrollHeight > box.clientHeight + 1 && size > 9) {
    size -= 0.5;
    body.style.fontSize = `${size}px`;
  }
}

function textPage(p, first) {
  const hasSide = !!p.image?.url;
  return pageEl(`${hasSide ? img(p.image, 'bp-side') : ''}
    <div class="bp-text${first ? '' : ' cont'}" style="right:${hasSide ? SIDE_W + 45 : 55}px">
      ${first ? `<h2 class="bp-title">${esc(p.title)}</h2>` : ''}
      <div class="bp-cols ${p.style === 'table' ? 'table' : 'list'}"></div>
    </div>`);
}

function textBlock(block, style) {
  const el = document.createElement('div');
  if (block.section) {
    el.className = 'bp-sec';
    el.textContent = block.section;
  } else {
    const { label, value } = block.item;
    el.className = 'bp-item';
    el.innerHTML = style === 'table'
      ? `<div class="bp-item-label">${esc(label)}</div><div class="bp-item-slash">/</div><div class="bp-item-value">${rich(value)}</div>`
      : `${label ? `<div class="bp-item-label">${esc(label)}</div>` : ''}<div class="bp-item-value">${rich(value)}</div>`;
  }
  return el;
}

// Text pages flow into as many pages as needed: blocks are added one by one and a new
// page starts when the fixed-height column box overflows to the right.
function renderText(p, container) {
  const blocks = [];
  for (const s of p.sections || []) {
    if (s.title) blocks.push({ section: s.title });
    for (const item of s.items || []) if (item.label || item.value) blocks.push({ item });
  }

  let page = textPage(p, true);
  container.append(page);
  let cols = page.querySelector('.bp-cols');

  for (const block of blocks) {
    const node = textBlock(block, p.style);
    cols.append(node);
    if (cols.scrollWidth > cols.clientWidth + 2 && cols.children.length > 1) {
      node.remove();
      // Don't leave a section heading orphaned at the end of a page.
      const carry = cols.lastElementChild?.classList.contains('bp-sec') && cols.children.length > 1 ? [cols.lastElementChild] : [];
      page = textPage(p, false);
      container.append(page);
      cols = page.querySelector('.bp-cols');
      cols.append(...carry, node);
    }
  }
}

let portraitUrls = new Set();

// Renders every page of the brochure into container. Fonts must be loaded so text measures correctly.
export async function renderBrochure(data, container) {
  await document.fonts.ready;
  // Work on a copy whose photos point to their trimmed versions.
  const pages = structuredClone((data.pages || []).filter(p => !isEmptyPage(p)));
  const slots = pages.flatMap(p => [p.image, ...(p.images || [])]).filter(i => i?.url);
  const info = await Promise.all(slots.map(i => analyze(i.url)));
  portraitUrls = new Set();
  slots.forEach((slot, n) => {
    if (!info[n]) return;
    slot.url = info[n].src;
    if (info[n].h > info[n].w * 1.05) portraitUrls.add(slot.url);
  });

  container.innerHTML = '';
  for (const p of pages) {
    if (p.type === 'text') {
      renderText(p, container);
    } else if (renderers[p.type]) {
      const el = renderers[p.type](p, data);
      container.append(el);
      el._fit?.();
    }
  }
}

// ---------- Images ----------

const compressImage = (file, maxWidth = 2400, quality = 0.85) => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
      return resolve(file);
    }
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Canvas is empty'));
        resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.webp', { type: 'image/webp', lastModified: Date.now() }));
      }, 'image/webp', quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

// Compresses (print quality) and uploads an image to the yacht-images bucket; returns its public URL.
export async function uploadBrochureImage(supabase, file) {
  const compressed = await compressImage(file);
  const ext = compressed.name.split('.').pop();
  const path = `brochures/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('yacht-images').upload(path, compressed);
  if (error) throw error;
  return supabase.storage.from('yacht-images').getPublicUrl(path).data.publicUrl;
}
