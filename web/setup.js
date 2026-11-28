'use strict';
/* Lastbook setup: choose a library and the local AI, then download, check, unpack and switch. The contract is docs/SETUP-API.md.
   Works on its own page in setup mode (no library, so none of /api/topics and the rest) and inside the app (Library → Library and local AI).
   Views: manage (what is here now), choose (what to get), job (progress, pause, errors), done. Plain fetch: in the app the bridge adds the key. */
(() => {
  const $ = s => document.querySelector(s);
  const main = $('#main'), live = $('#live');
  const languageHasFocus = () => $('#languageSettings')?.contains(document.activeElement);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WIN = document.documentElement.classList.contains('plat-win');
  const UNIT = WIN ? 1024 : 1000;   // each system's own way of counting a gigabyte, so the numbers match Finder or Explorer
  const CAN = { removeAi: true, repair: true };   // one switch each, should a build of the engine be without remove-ai or repair
  const MANAGE_ASKED = /manage/.test(location.hash);   // #manage: the bridge allows no ?query on the top page

  const ICO = {
    disk: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15h.01M11 15h6"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    gpu: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="9" cy="12" r="3"/><path d="M15 10h3M15 14h3"/>',
    book: '<path d="M4 4v16M9 4v16M14 5l4 15M3 20h18"/>',
    ai: '<path d="M4 5h16v11H9l-5 4z"/><path d="M9 9.5h6M9 12.5h4"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    back: '<path d="M15 18 9 12l6-6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    retry: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    repair: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  };
  const ico = (k, cls) => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICO[k] || ''}</svg>`;

  /* ------------------------------------------------------------ numbers */
  function size(b) {
    if (b == null || !isFinite(b)) return '';
    const g = b / UNIT ** 3;
    if (g >= 100) return Math.round(g).toLocaleString() + ' GB';
    if (g >= 1) return g.toFixed(1) + ' GB';
    const m = b / UNIT ** 2;
    return (m >= 10 ? Math.round(m) : m.toFixed(1)) + ' MB';
  }
  const ram = b => Math.round(b / 1024 ** 3) + ' GB';   // memory is counted in binary by both systems
  const rate = bps => bps > 0 ? (bps / UNIT ** 2 >= 10 ? Math.round(bps / UNIT ** 2) : (bps / UNIT ** 2).toFixed(1)) + ' MB/s' : '';
  function eta(s) {
    if (s == null || !isFinite(s) || s < 0) return '';
    if (s < 60) return 'under a minute left';
    const m = Math.round(s / 60);
    if (m < 60) return `about ${m} min left`;
    const h = Math.floor(m / 60), r = m % 60;
    return `about ${h} h${r ? ` ${r} min` : ''} left`;
  }
  const retryIn = s => `The server is busy. Retrying in ${s < 60 ? 'under a minute' : Math.ceil(s / 60) + ' min'}`;
  const home = p => String(p || '').replace(/^\/Users\/[^/]+/, '~').replace(/^[A-Z]:\\Users\\[^\\]+\\/i, '');   // ~/… on a Mac; Documents\… on Windows, as Explorer names it

  /* ------------------------------------------------------------ the engine */
  async function call(path, body) {
    const opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    let r; try { r = await fetch('/api/setup/' + path, opts) } catch { throw Object.assign(new Error('Lastbook did not answer. Close it and open it again.'), { status: 0 }) }
    let d = null; try { d = await r.json() } catch { }
    if (!r.ok && !(d && (d.error || d.need_bytes))) throw Object.assign(new Error(r.status === 404 ? 'Not available.' : 'Lastbook sent an unreadable reply.'), { status: r.status });
    return d;
  }
  const errCode = e => e && (typeof e === 'object' ? e.code : null);
  const errText = e => e && (typeof e === 'object' ? e.message || e.error : e);

  /* ------------------------------------------------------------ state */
  let S = null;           // GET state
  let view = 'choose';
  const CLOUD_POLL_MS = 3000, CLOUD_POLLS = 20;   // the iCloud count runs in the engine's background: ask again for about a minute
  let cloudPolls = 0, cloudT = null, cloudFor = '';   // one timer for the open library (cloudFor), at most CLOUD_POLLS asks
  let choice = { pack: null, ai: false, map: null, region: null, country: null };   // map: the selected area, or 'none' to skip
  let mapOnly = false;
  let mapCart = [];
  let mapQueue = null;
  let mapPollT = 0;
  let mapControlVersion = 0;
  let mapStartPending = null;
  const MAP_QUEUE_KEY = 'lastbook.mapQueue';
  let folder = '';
  let shortfall = null;   // the answer to a start that had no room: {need_bytes, free_bytes}
  let pollT = 0;
  let confirmCancel = false, confirmRemove = false, confirmOld = false, cancelling = false;
  let note = '', noteOk = false;
  let emptyTries = 0;     // times state was asked again because the manifest came back with no libraries
  let shown = '';         // the state answer the screen last drew: a background answer the same as it draws nothing
  let repair = null;      // a repair under way: {fixed} turns true once it had to download something; {sure}: this page saw it from the start
  let U = null;           // GET updates: {supported, notify}. null (an engine without it, or the server version's {supported: false}): no control
  const expandedMapCountries = new Set();
  let mapSidebarObserver = null;

  /* "Notify me about app updates": the first-run choose screen and Settings. Off until the person ticks it; only their own change
     is saved (POST updates), on its own, so it never holds up or changes an install. Changes are sent one after another, in order. */
  let updQ = Promise.resolve();
  const updatesBox = () => U && U.supported ? `<label class="s-check"><input type="checkbox" id="updBox"${U.notify ? ' checked' : ''} aria-describedby="updHint">
      <span><b>Notify me about app updates</b><small id="updHint">Lastbook checks once a day while the app is open and online.</small></span></label>
      <p class="s-note" id="updNote" role="status" hidden></p>` : '';
  function wireUpdates() {
    const b = $('#updBox'); if (!b) return;
    b.onchange = () => { const want = b.checked; updQ = updQ.then(() => saveUpdates(want)) };
  }
  async function saveUpdates(want) {
    const r = await call('updates', { notify: want }).catch(e => ({ error: e.message }));
    const b = $('#updBox'), n = $('#updNote');
    if (!r || r.error) {
      if (b) b.checked = !!(U && U.notify);
      if (n) { n.hidden = false; n.textContent = (r && r.error) || 'Lastbook could not save this setting. Try again.' }
      return;
    }
    U = { ...r, supported: true };
    if (n) n.hidden = true;
  }

  const packs = () => (S.manifest && S.manifest.packs) || [];
  const model = () => ((S.manifest && S.manifest.models) || [])[0] || null;
  const cur = () => S.current || null;
  const packById = id => packs().find(p => p.id === id);
  function packNeedsInstall(pack) {
    if (!pack) return false;
    const current = cur();
    if (!current || pack.id !== current.pack) return true;
    return Boolean(pack.revision && pack.revision !== current.content_revision);
  }

  /* regional maps (docs/SETUP-API.md, State maps). The person picks the region; Lastbook never looks for where it is */
  const maps = () => ((S.manifest && S.manifest.maps) || []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title)));   // by name, as people look for theirs
  const mapById = id => maps().find(m => m.id === id);
  const installedMap = id => ((cur() || {}).installed_maps || []).find(m => m.id === id);
  const mapNeedsDownload = id => !installedMap(id) || installedMap(id).update_available;
  const mapName = id => id === 'us' ? 'the whole US' : (mapById(id) || {}).title || id;
  const isUSState = region => region && region.kind === 'state' && /^[A-Z]{2}$/.test(region.id);
  const REGION_NAMES = { eu: 'Europe', na: 'North America', sa: 'South America', af: 'Africa', as: 'Asia', oc: 'Oceania' };
  const countryName = code => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code } catch { return code } };
  function locationOf(map) {
    if (!map) return null;
    if (map.region && map.country) return { region: map.region, country: map.country };
    if (map.id === 'us' || isUSState(map)) return { region: 'North America', country: 'United States' };
    const country = /^([a-z]{2})-([a-z]{2})$/.exec(map.id);
    if (country && map.kind === 'country') return { region: REGION_NAMES[country[1]] || 'Other regions', country: map.title };
    const part = /^([A-Z]{2})-[A-Z0-9]+$/.exec(map.id);
    if (part) return { region: ['DE', 'ES'].includes(part[1]) ? 'Europe' : part[1] === 'CA' ? 'North America' : 'Other regions', country: countryName(part[1]) };
    return { region: 'Other regions', country: map.kind === 'country' ? map.title : 'Other areas' };
  }
  function regionIncluded(id, current, list) {
    const region = list.find(m => m.id === id);
    return id === current || ((cur() || {}).installed_maps || []).some(m => m.id === id) || (current === 'us' && isUSState(region));
  }
  /* the detailed map the library will have once the chosen pack is in: the person's regional map, or the one the pack carries */
  const PACK_MAP = { medium: 'CA', all: 'us' };   // what the packs carry today; a manifest packs[].map, when there, wins
  const packMap = id => { const p = packById(id) || {}; return p.map === 'base' ? null : p.map || PACK_MAP[id] || null };
  const mapNow = () => { const c = cur() || {}; return choice.pack && choice.pack !== c.pack ? packMap(choice.pack) : c.map === 'base' ? null : c.map || packMap(c.pack) };
  const canSkipMap = () => { const n = mapNow(); return !n || n === 'us' };   // Small carries no state map, All carries every one; Medium carries its own
  const skippedMap = () => choice.map === 'none' && canSkipMap();   // the person chose no local map; add one later from Settings
  const setPack = id => { if (id !== choice.pack && choice.map === 'none') choice.map = null; choice.pack = id };   // 'none' means something different per pack, so a switch drops it and the person chooses again
  const selectedRegion = () => {
    if (skippedMap()) return '';
    if (choice.map !== null && choice.map !== 'none') return choice.map;
    const current = mapNow();
    return (current !== 'us' && current) || ((cur() || {}).address_indexes || [])[0] || '';
  };
  const addresses = () => (S.manifest && S.manifest.address_indexes) || [];
  const addressById = id => addresses().find(a => a.id === id);
  const addressNeedsDownload = id => {
    const address = addressById(id);
    return !!address && address.available !== false && !((cur() || {}).address_indexes || []).includes(id);
  };
  const mapGeometryNeedsDownload = id => !regionIncluded(id, mapNow(), maps()) || !!installedMap(id)?.update_available;
  const mapChoiceNeedsDownload = id => mapGeometryNeedsDownload(id) || addressNeedsDownload(id);
  const addressAdds = () => { const a = addressById(selectedRegion()); return a && a.available !== false && !((cur() || {}).address_indexes || []).includes(a.id) ? a : null };
  const mapMissing = () => !selectedRegion() && !skippedMap();
  const mapAdds = () => choice.map && choice.map !== 'none' && mapNeedsDownload(choice.map) && (installedMap(choice.map) || !regionIncluded(choice.map, mapNow(), maps())) ? mapById(choice.map) : null;
  const mapSwitches = () => !mapOnly && !!cur() && !!selectedRegion() && selectedRegion() !== cur().map &&
    !!installedMap(selectedRegion()) && !mapAdds();
  function mapSidebar(c) {
    const items = c.installed_address_indexes || [];
    const countries = new Map();
    for (const map of items) {
      const place = locationOf(mapById(map.id) || addressById(map.id) || { ...map, kind: 'state' });
      if (!countries.has(place.country)) countries.set(place.country, []);
      countries.get(place.country).push(map);
    }
    const deleteButton = m => `<button class="s-icon-danger" data-address-ask="${esc(m.id)}" aria-label="Delete ${esc(m.title)} address search" title="Delete ${esc(m.title)} address search">${ico('trash')}</button>`;
    const countryGroup = ([country, group], index) => {
      const countryMap = group.find(m => mapById(m.id)?.kind === 'country' || m.id === 'us');
      const areas = group.filter(m => m !== countryMap);
      const expanded = expandedMapCountries.has(country);
      return `<section class="s-map-country"><div class="s-map-country-head">
        ${areas.length ? `<button class="s-map-country-toggle" data-country-toggle="${esc(country)}" aria-expanded="${expanded}" aria-controls="countryMaps${index}"><span>${esc(country)}</span>${countryMap ? `<small class="s-map-country-size">${esc(size(countryMap.bytes))}</small>` : ''}<span class="s-map-country-chevron${expanded ? ' expanded' : ''}" aria-hidden="true"></span></button>` : `<span class="s-map-country-name"><span>${esc(country)}</span>${countryMap ? `<small class="s-map-country-size">${esc(size(countryMap.bytes))}</small>` : ''}</span>`}
        ${countryMap ? deleteButton(countryMap) : ''}</div>
        ${areas.length ? `<div class="s-map-country-areas" id="countryMaps${index}"${expanded ? '' : ' hidden'}>${areas.map(m => `<div class="s-map-installed-item"><div class="s-map-item-title"><span class="s-map-item-meta"><span class="s-map-item-name">${esc(m.title)}</span><small>${esc(size(m.bytes))}</small></span>${deleteButton(m)}</div></div>`).join('')}</div>` : ''}</section>`;
    };
    return `<aside class="s-map-sidebar" aria-labelledby="downloadedMapsTitle"><div class="s-map-sidebar-head"><h2 id="downloadedMapsTitle">Downloaded maps</h2><button class="s-map-add" id="mapCh" aria-label="Download another map" title="Download another map">${ico('plus')}</button></div>
      ${items.length ? `<div class="s-map-installed">${[...countries].sort((a, b) => a[0].localeCompare(b[0])).map(countryGroup).join('')}</div>` : '<p class="s-hint">No address searches installed yet.</p>'}</aside>`;
  }
  function openMapChooser(c, id = null) {
    mapOnly = true;
    choice.pack = c.pack; choice.ai = !!c.model; choice.map = id;
    choice.region = choice.country = null;
    if (view === 'choose') go('manage');
    main.insertAdjacentHTML('beforeend', `<dialog class="s-map-dialog" id="mapDialog" aria-labelledby="mapDialogTitle">
      <div class="s-map-dialog-head"><h2 id="mapDialogTitle">Download a map</h2><button class="s-icon-close" id="closeMapDialog" aria-label="Close map download">${ico('x')}</button></div>
      <section id="mapBox" class="s-map-panel" aria-label="Your local map"></section>
      <section id="mapCart" class="s-map-cart" aria-live="polite"></section></dialog>`);
    mapSection();
    const dialog = $('#mapDialog');
    const closePickers = event => dialog.querySelectorAll('.s-picker[open]').forEach(p => {
      if (!event || !p.contains(event.target)) p.open = false;
    });
    document.addEventListener('pointerdown', closePickers);
    dialog.addEventListener('scroll', event => { if (event.target === dialog) closePickers() });
    const close = () => { document.removeEventListener('pointerdown', closePickers); mapOnly = false; dialog.remove() };
    dialog.addEventListener('close', close, { once: true });
    $('#closeMapDialog').onclick = () => dialog.close();
    dialog.showModal();
    $('#regionSel')?.focus();
    if (mapQueue) pollMapQueue();
  }
  const mapDownloadBytes = id => {
    return (mapGeometryNeedsDownload(id) ? packDl(mapById(id)) : 0)
      + (addressNeedsDownload(id) ? packDl(addressById(id)) : 0);
  };
  function saveMapQueue() {
    try {
      if (mapQueue?.current || mapQueue?.ids.some(id => !mapQueue.completed.includes(id)))
        localStorage.setItem(MAP_QUEUE_KEY, JSON.stringify(mapQueue));
      else localStorage.removeItem(MAP_QUEUE_KEY);
    } catch { /* The open modal still works when storage is unavailable. */ }
  }
  function restoreMapQueue() {
    try {
      const saved = JSON.parse(localStorage.getItem(MAP_QUEUE_KEY) || 'null');
      const ids = saved?.ids;
      if (saved?.folder !== cur()?.folder || !Array.isArray(ids) || !ids.length ||
          ids.some(id => typeof id !== 'string' || !mapById(id)) || !Array.isArray(saved.completed) ||
          saved.completed.some(id => !ids.includes(id)) || (saved.current && !ids.includes(saved.current))) return;
      const bytes = saved.bytes;
      if (!bytes || ids.some(id => !Number.isFinite(bytes[id]) || bytes[id] < 0)) return;
      mapQueue = { folder: saved.folder, ids, bytes, completed: saved.completed, current: saved.current || null, error: '' };
      if (mapQueue.current && !S.job && !mapChoiceNeedsDownload(mapQueue.current)) {
        mapQueue.completed.push(mapQueue.current);
        mapQueue.current = null;
        saveMapQueue();
      }
    } catch { /* An invalid saved cart cannot start a download. */ }
  }
  function addMapToCart() {
    const id = selectedRegion();
    if (!mapById(id) || !mapChoiceNeedsDownload(id) || mapCart.includes(id) || mapQueue?.ids.includes(id)) return;
    if (mapQueue && !mapQueue.current && !mapQueue.error) mapQueue = null;
    mapCart.push(id);
    renderMapCart();
  }
  function mapProgress(id) {
    if (mapQueue.completed.includes(id)) return 100;
    if (mapQueue.current !== id) return 0;
    if (S.job?.state === 'done') return 100;
    const items = S.job?.items?.filter(it => it.id === id && (it.kind === 'map' || it.kind === 'addresses')) || [];
    if (!items.length) return 0;
    const total = mapQueue.bytes[id];
    const done = items.reduce((n, it) => {
      const bytes = it.kind === 'map' ? packDl(mapById(id)) : packDl(addressById(id));
      return n + (it.state === 'paused' && ['unpacking', 'activating'].includes(it.paused_from) ? bytes
        : ['downloading', 'paused', 'failed'].includes(it.state) ? Math.min(bytes, it.bytes_done || 0)
        : it.state === 'waiting' ? 0 : bytes);
    }, 0);
    return Math.min(done < total ? 99 : 100, Math.round(done / Math.max(1, total) * 100));
  }
  function renderMapCart() {
    const button = $('#mapStart'), box = $('#mapCart');
    if (!button || !box) return;
    const id = selectedRegion(), selected = mapById(id);
    const installed = selected && !mapChoiceNeedsDownload(id);
    const queued = mapCart.includes(id) || mapQueue?.ids.includes(id);
    button.disabled = !selected || (selected.available === false && mapGeometryNeedsDownload(id)) || installed || queued || !!mapQueue?.current;
    button.textContent = !selected ? 'Choose a map area' : installed ? 'Already downloaded' : queued ? 'Added to list'
      : mapQueue?.current ? 'Download in progress' : selected.available === false && mapGeometryNeedsDownload(id) ? 'Coming later'
        : installedMap(id)?.update_available ? 'Add update to list' : !mapGeometryNeedsDownload(id) ? 'Add address search to list' : 'Add map to list';
    const queueFinished = mapQueue && !mapQueue.current && !mapQueue.error && mapQueue.completed.length === mapQueue.ids.length;
    $('#mapBox .s-map-detail').hidden = !!mapQueue && !(queueFinished && !mapQueue.ids.includes(id));
    const ids = mapQueue?.ids || mapCart;
    const key = `${mapQueue ? 'queue' : 'cart'}:${ids.join(',')}`;
    if (box.dataset.cartKey !== key) {
      box.dataset.cartKey = key;
      box.innerHTML = ids.length ? `<div class="s-map-cart-head"><h3></h3><span></span></div>${ids.map(mapId => {
        const mp = mapById(mapId);
        return `<div class="s-map-cart-item" data-map-id="${esc(mapId)}"><div class="s-map-cart-item-head"><b>${esc(mp.title)}</b><small>${esc(size(mapQueue?.bytes[mapId] ?? mapDownloadBytes(mapId)))}</small>
          ${mapQueue ? '<span class="s-map-cart-status"></span>' : `<button class="s-icon-close" data-cart-remove="${esc(mapId)}" aria-label="Remove ${esc(mp.title)} from list">${ico('x')}</button>`}</div>
          ${mapQueue ? `<div class="s-map-cart-bar" role="progressbar" aria-label="${esc(mp.title)} download" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i style="width:0%"></i></div>` : ''}</div>`;
      }).join('')}<div class="s-map-cart-action"></div>` : '';
      box.querySelectorAll('[data-cart-remove]').forEach(b => b.onclick = () => { mapCart = mapCart.filter(x => x !== b.dataset.cartRemove); renderMapCart() });
    }
    if (!ids.length) return;
    const total = mapQueue ? mapQueue.ids.reduce((n, mapId) => n + mapQueue.bytes[mapId], 0) : mapCart.reduce((n, mapId) => n + mapDownloadBytes(mapId), 0);
    const overall = mapQueue && total ? Math.round(mapQueue.ids.reduce((n, mapId) => n + mapQueue.bytes[mapId] * mapProgress(mapId) / 100, 0) / total * 100) : 0;
    box.querySelector('.s-map-cart-head h3').textContent = mapQueue?.stopping ? 'Cancelling downloads' : mapQueue?.current ? 'Downloading' : mapQueue ? 'Downloads complete' : 'Downloads to start';
    box.querySelector('.s-map-cart-head span').textContent = `${size(total)}${mapQueue ? ` · ${overall}%` : ''}`;
    if (mapQueue) box.querySelectorAll('[data-map-id]').forEach(row => {
      const mapId = row.dataset.mapId, active = mapQueue.current === mapId, complete = mapQueue.completed.includes(mapId);
      const pct = mapProgress(mapId);
      const status = complete ? 'Ready' : active ? mapQueue.stopping ? 'Cancelling' : mapQueue.pausing ? 'Pausing' : S.job?.state === 'paused' ? 'Paused' :
        S.job?.state === 'failed' ? 'Stopped' : pct === 100 ? 'Installing' : 'Downloading' : 'Waiting';
      row.querySelector('.s-map-cart-status').textContent = `${status} · ${pct}%`;
      row.querySelector('.s-map-cart-bar').setAttribute('aria-valuenow', String(pct));
      row.querySelector('.s-map-cart-bar i').style.width = `${pct}%`;
    });
    const action = box.querySelector('.s-map-cart-action');
    const mode = mapQueue?.stopping ? 'stopping' : mapQueue?.error ? 'error' : mapQueue?.pausing ? 'pausing' :
      mapQueue?.current ? S.job?.state === 'done' ? 'finishing' : S.job?.state === 'paused' ? 'paused' : 'active' : mapQueue ? 'complete' : 'cart';
    if (action.dataset.mode === mode) {
      if (mode === 'error') action.querySelector('[role="alert"]').textContent = mapQueue.error;
      return;
    }
    action.dataset.mode = mode;
    action.innerHTML = mode === 'stopping' ? '<p role="status">Cancelling the current download and clearing unfinished files…</p>'
      : mode === 'error' ? `<p class="s-note" role="alert">${esc(mapQueue.error)}</p><button class="btn" id="mapRetry">Retry</button><button class="btn plain" id="mapCancel">Cancel downloads</button>`
        : mode === 'pausing' ? '<p role="status">Pausing the current map…</p><button class="btn plain" id="mapCancel">Cancel downloads</button>'
          : mode === 'finishing' ? '<p role="status">Finishing installation…</p>'
        : mode === 'active' || mode === 'paused' ? `<div class="s-map-cart-controls"><button class="btn plain" id="${mode === 'paused' ? 'mapResume' : 'mapPause'}">${mode === 'paused' ? 'Resume' : 'Pause'}</button><button class="btn plain" id="mapCancel">Cancel downloads</button></div>`
          : mode === 'complete' ? '<p class="s-map-success" role="status">All selected downloads are ready. Choose another area to continue.</p>'
            : '<button class="btn" id="mapDownloadAll">Download selected</button>';
    if ($('#mapDownloadAll')) $('#mapDownloadAll').onclick = startMapQueue;
    if ($('#mapRetry')) $('#mapRetry').onclick = retryMapQueue;
    if ($('#mapResume')) $('#mapResume').onclick = () => controlMapQueue('resume');
    if ($('#mapPause')) $('#mapPause').onclick = () => controlMapQueue('pause');
    if ($('#mapCancel')) $('#mapCancel').onclick = cancelMapQueue;
  }
  function refreshMapSidebar() {
    const sidebar = main.querySelector('.s-map-sidebar');
    if (!sidebar || !cur()) return;
    const fresh = document.createElement('div');
    fresh.innerHTML = mapSidebar(cur());
    sidebar.innerHTML = fresh.firstElementChild.innerHTML;
    wireMapSidebar(cur());
  }
  async function beginMapDownload(id) {
    const queue = mapQueue;
    S.job = null;
    const request = call('start', { map: mapGeometryNeedsDownload(id) ? id : null, address_id: addressNeedsDownload(id) ? id : null,
      folder: cur().folder }).catch(e => ({ error: e.message }));
    mapStartPending = request;
    const r = await request;
    if (mapStartPending === request) mapStartPending = null;
    if (mapQueue !== queue || queue.stopping) return;
    if (!r || r.error) {
      mapQueue.error = errText(r?.error) || 'The map could not start. Try again.';
      renderMapCart();
      return;
    }
    S.job = r;
    renderMapCart();
    pollMapQueue();
  }
  async function nextMapDownload() {
    if (!mapQueue || mapQueue.current || mapQueue.error || mapQueue.stopping) return;
    const id = mapQueue.ids.find(mapId => !mapQueue.completed.includes(mapId));
    if (!id) { saveMapQueue(); renderMapCart(); live.textContent = 'All selected maps are ready.'; return }
    mapQueue.current = id;
    saveMapQueue();
    renderMapCart();
    await beginMapDownload(id);
  }
  function startMapQueue() {
    if (!mapCart.length || mapQueue?.current) return;
    mapQueue = { folder: cur().folder, ids: [...mapCart], bytes: Object.fromEntries(mapCart.map(id => [id, mapDownloadBytes(id)])), completed: [], current: null, error: '' };
    mapCart = [];
    saveMapQueue();
    renderMapCart();
    nextMapDownload();
  }
  async function completeMapDownload() {
    const queue = mapQueue, id = queue.current;
    if (queue.stopping) return;
    const result = await call('finish-map', {}).catch(e => ({ error: e.message }));
    if (mapQueue !== queue) return result;
    if (!result || result.error) {
      if (queue.stopping) return result;
      queue.error = errText(result?.error) || 'The map could not be installed. Try again.';
      renderMapCart();
      return result;
    }
    queue.completed.push(id);
    queue.current = null;
    saveMapQueue();
    try { S = await call('state') }
    catch (e) { if (mapQueue === queue && !queue.stopping) { queue.error = `The map was installed, but Settings could not refresh: ${e.message}`; renderMapCart() } return result }
    if (mapQueue !== queue) return result;
    refreshMapSidebar();
    if ($('#mapDialog')) {
      if (!mapChoiceNeedsDownload(id) && selectedRegion() === id) {
        const hint = $('#mapHint');
        if (hint) hint.textContent = 'Your map and available address index are already included.';
      }
      if (!mapChoiceNeedsDownload(id)) {
        const option = [...main.querySelectorAll('[data-pick="map"]')].find(button => button.value === id);
        if (option) {
          const title = mapById(id).title;
          option.setAttribute('aria-label', `${title} — Installed`);
          option.innerHTML = `${esc(title)} <small>— Installed</small>`;
        }
      }
    }
    if (queue.stopping) return result;
    await nextMapDownload();
    return result;
  }
  let mapPolling = false;
  async function pollMapQueue() {
    clearTimeout(mapPollT);
    if (!mapQueue?.current || mapPolling) return;
    const queue = mapQueue, controlVersion = mapControlVersion;
    let stale = false;
    mapPolling = true;
    try {
      const job = await call('job');
      stale = mapQueue !== queue || controlVersion !== mapControlVersion;
      if (!stale) {
        if (!job) throw new Error('The map download status is unavailable. Reopen Lastbook to resume it.');
        S.job = job;
        if (job.state === 'paused' || job.state === 'done' || job.state === 'failed') queue.pausing = false;
        if (job.state === 'done' && !queue.stopping) {
          renderMapCart();
          await completeMapDownload();
        } else if (job.state === 'failed') queue.error = errText(job.error) || 'The map download stopped. Retry to continue.';
      }
    } catch (e) { if (mapQueue === queue && controlVersion === mapControlVersion) queue.error = e.message }
    finally { mapPolling = false }
    if (mapQueue !== queue) return;
    if (stale || controlVersion !== mapControlVersion) {
      if (!queue.controlPending && !queue.stopping && (queue.pausing || ACTIVE.has(S.job?.state))) mapPollT = setTimeout(pollMapQueue, 0);
      return;
    }
    renderMapCart();
    if (queue.current && !queue.stopping && !queue.error && (queue.pausing || ACTIVE.has(S.job?.state))) mapPollT = setTimeout(pollMapQueue, 1000);
  }
  async function retryMapQueue() {
    if (!mapQueue) return;
    mapQueue.error = '';
    if (!mapQueue.current) {
      try { S = await call('state'); refreshMapSidebar(); await nextMapDownload() }
      catch (e) { mapQueue.error = e.message }
    } else if (S.job?.state === 'failed') await controlMapQueue('retry');
    else if (S.job?.state === 'done') {
      const result = await completeMapDownload();
      if (result?.code === 'pending') { mapQueue.error = ''; await beginMapDownload(mapQueue.current) }
    }
    else await beginMapDownload(mapQueue.current);
    renderMapCart();
  }
  async function controlMapQueue(action) {
    const queue = mapQueue;
    if (!queue?.current || queue.controlPending || queue.stopping) return;
    const version = ++mapControlVersion;
    queue.controlPending = true;
    if (action === 'pause') queue.pausing = true;
    clearTimeout(mapPollT);
    renderMapCart();
    const result = await call(action, {}).catch(e => ({ error: e.message }));
    if (mapQueue !== queue || queue.stopping || version !== mapControlVersion) return;
    queue.controlPending = false;
    if (!result || result.error) {
      queue.pausing = false;
      queue.error = errText(result?.error) || `Could not ${action} the map download. Try again.`;
    } else {
      S.job = result;
      queue.pausing = action === 'pause' && ACTIVE.has(result.state);
      if (action === 'resume' && result.state === 'paused') queue.error = 'The map did not resume. Try again.';
      if (action === 'pause' && result.state === 'done') {
        renderMapCart();
        await completeMapDownload();
      }
    }
    renderMapCart();
    if (!queue.error && (action !== 'pause' || queue.pausing)) pollMapQueue();
  }
  async function cancelMapQueue() {
    const queue = mapQueue;
    if (!queue || queue.stopping) return;
    queue.stopping = true;
    clearTimeout(mapPollT);
    renderMapCart();
    try {
      if (mapStartPending) await mapStartPending;
      let result = queue.current ? await call('cancel', {}) : null;
      while (result?.stopping) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        result = await call('job');
      }
      if (result?.error && errCode(result.error) !== 'cancelled') throw new Error(errText(result.error));
      S = await call('state');
      refreshMapSidebar();
    } catch (e) {
      queue.error = `Could not stop the downloads: ${e.message}`;
      queue.stopping = false;
      renderMapCart();
      return;
    }
    mapQueue = null;
    S.job = null;
    saveMapQueue();
    renderMapCart();
    live.textContent = 'The remaining map downloads were stopped. Completed maps are kept.';
  }
  function confirmAddressRemoval(id, opener) {
    const installed = cur()?.installed_address_indexes?.find(item => item.id === id);
    if (!installed) return;
    main.insertAdjacentHTML('beforeend', `<dialog class="s-map-delete-dialog" aria-labelledby="deleteMapTitle" aria-describedby="deleteMapDescription">
      <h2 id="deleteMapTitle">Delete ${esc(installed.title)} address search?</h2>
      <p id="deleteMapDescription">The downloaded address search for ${esc(installed.title)} will be removed from this device.</p>
      <p class="s-map-delete-error" role="alert" hidden></p>
      <div class="s-map-delete-actions"><button class="btn plain" id="keepAddress">Keep</button><button class="btn danger" id="deleteAddress">Delete</button></div></dialog>`);
    const dialog = main.querySelector('.s-map-delete-dialog');
    let deleting = false;
    dialog.addEventListener('cancel', event => { if (deleting) event.preventDefault() });
    dialog.addEventListener('close', () => {
      dialog.remove();
      (opener.isConnected ? opener : $('#mapCh'))?.focus();
    }, { once: true });
    dialog.querySelector('#keepAddress').onclick = () => dialog.close();
    dialog.querySelector('#deleteAddress').onclick = async event => {
      const button = event.currentTarget;
      deleting = true;
      button.disabled = true;
      dialog.querySelector('#keepAddress').disabled = true;
      const result = await call('remove-address-index', { address_id: id }).catch(error => ({ error: error.message }));
      if (!result || result.error) {
        const error = dialog.querySelector('.s-map-delete-error');
        error.textContent = errText(result?.error) || 'The address search could not be deleted. Try again.';
        error.hidden = false;
        button.disabled = false;
        dialog.querySelector('#keepAddress').disabled = false;
        deleting = false;
        return;
      }
      const current = cur();
      current.installed_address_indexes = current.installed_address_indexes.filter(item => item.id !== id);
      current.address_indexes = (current.address_indexes || []).filter(name => name !== id);
      S = await call('state').catch(() => S);
      dialog.close();
      refreshMapSidebar();
    };
    dialog.showModal();
    dialog.querySelector('#keepAddress').focus();
  }
  function wireMapSidebar(c) {
    $('#mapCh').onclick = () => openMapChooser(c);
    main.querySelectorAll('[data-country-toggle]').forEach(button => button.onclick = () => {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(expanded));
      main.querySelector(`#${button.getAttribute('aria-controls')}`).hidden = !expanded;
      button.querySelector('.s-map-country-chevron').classList.toggle('expanded', expanded);
      if (expanded) expandedMapCountries.add(button.dataset.countryToggle);
      else expandedMapCountries.delete(button.dataset.countryToggle);
    });
    main.querySelectorAll('[data-address-ask]').forEach(b => b.onclick = () => confirmAddressRemoval(b.dataset.addressAsk, b));
  }
  function packSummary(p) {
    const text = p.summary || '';
    if (!maps().length || skippedMap()) return text;
    // The manifest describes the archive's bundled map; another chosen map is kept alongside it.
    const region = selectedRegion();
    if (p.id === 'medium') return text.replace(/\ba detailed map of California\b/, () => 'a detailed map of ' + (region ? mapName(region) : 'your region'));
    return packMap(p.id) === 'us' && region && !isUSState(mapById(region))
      ? `${text} Choosing ${mapName(region)} also installs the bundled US map.` : text;
  }
  const packDl = p => p.download_bytes || (p.files || []).reduce((n, f) => n + (f.size || 0), 0);
  const SEP = WIN ? '\\' : '/', DATA = 'LastbookData';
  const asData = p => /[\\/]LastbookData[\\/]?$/i.test(p) ? p.replace(/[\\/]$/, '') : String(p).replace(/[\\/]$/, '') + SEP + DATA;
  /* a file already on this computer, of the right size, for a pack or the model: setup uses it instead of downloading */
  const foundFor = (kind, id) => (S.found || []).find(f => f.kind === kind && (f.size_ok !== false) && (kind === 'model' || f.id === id || f.pack === id));
  const aiFits = () => !!(S.hardware && S.hardware.ai && S.hardware.ai.fits);

  function diskFor(path) {
    const ds = (S.hardware && S.hardware.disks) || [];
    const norm = s => WIN ? String(s).toLowerCase().replace(/\//g, '\\') : String(s);
    const p = norm(path);
    let best = null;
    for (const d of ds) if (p.startsWith(norm(d.path)) && (!best || d.path.length > best.path.length)) best = d;
    return best || (path ? null : ds[0] || null);   // a folder on a disk the engine did not report: its free space is not known here
  }
  const diskName = d => !d ? 'this disk' : d.name || (WIN ? (String(d.path).match(/^[A-Z]:/i) || ['this disk'])[0].toUpperCase()   // C:, D:
    : /^\/Volumes\/[^/]+/.test(d.path) ? d.path.split('/')[2] : /Linux/.test(navigator.platform || '') ? 'this computer' : 'this Mac');

  function plan() {   // what the current choice adds: bytes to download, space it needs (download + unpacked + 2 GB, as the engine counts)
    const c = cur() || {};
    let dl = 0, need = 0;
    const p = packById(choice.pack);
    if (packNeedsInstall(p)) {
      const got = foundFor('pack', p.id);
      if (!got) dl += packDl(p);
      need += (got ? 0 : packDl(p)) + (p.installed_bytes || 0);
      if (p.id === c.pack) need += c.map_bytes || 0;
    }
    const m = model();
    if (choice.ai && m && !c.model && aiFits()) { const got = foundFor('model'); if (!got) { dl += m.size || 0; need += m.size || 0 } else need += m.size || 0 }
    const mp = mapAdds();
    if (mp) { const got = foundFor('map', mp.id); if (!got) dl += packDl(mp); need += (got ? 0 : packDl(mp)) + (mp.installed_bytes || 0) }
    const a = mapOnly && installedMap(selectedRegion()) && !mapAdds() ? null : addressAdds();
    if (a) { dl += packDl(a); need += packDl(a) + (a.installed_bytes || 0) }
    if (need) need += 2 * 1000 ** 3;
    return { dl, need };
  }

  async function load(bg) {
    const was = view;
    const upd = bg ? null : call('updates').catch(() => null);   // alongside state: a missing route only hides the control. Not asked again in the background
    let s;
    try { s = await call('state') }
    catch (e) {
      if (bg) return;
      main.innerHTML = `<div class="s-err" role="alert">${ico('warn')}<div><b data-i18n="setup.error">Setup could not start.</b><p>${esc(e.message)}</p><p><button class="btn" id="again" data-i18n="setup.tryAgain">Try again</button></p></div></div>`;
      globalThis.LastbookI18n?.apply(main);
      $('#again').onclick = () => load();
      return;
    }
    if (bg && view === 'job') return;   // a job started while this was asked: the answer is older than it
    if (bg && main.querySelector('dialog[open]')) { askAgain(); return }
    const same = bg && JSON.stringify(s) === shown;
    shown = JSON.stringify(s);
    S = s;
    // The person moved on while this was asked (Copy, say), or is on a screen without the lists: the newer lists wait for
    // when they come back, and the screen they are on stays.
    if (bg && (view !== was || (view !== 'manage' && view !== 'choose'))) { askAgain(); return }
    const rf = (S.recommend || {}).folder;
    folder = folder || (cur() && cur().folder) || S.default_folder || (rf ? asData(rf) : '');
    if (!choice.pack) {
      const rec = S.recommend || {};
      const small = packById('small');
      choice.pack = small && small.available !== false ? 'small' : null;
      choice.ai = !!rec.ai && aiFits();
      if (cur()) { choice.pack = cur().pack; choice.ai = !!cur().model }
    }
    if (!bg) { const u = await upd; U = u && !u.error ? u : null }   // a background answer keeps what the first load found, with no second wait
    if (!bg) restoreMapQueue();
    const j = S.job;
    if (mapQueue && cur() && (!j || j.items?.some(it => (it.kind === 'map' || it.kind === 'addresses') && it.id === mapQueue.current))) view = 'manage';
    else if (j && j.state && j.state !== 'done' && (j.stopping || !(j.state === 'failed' && errCode(j.error) === 'cancelled'))) view = 'job';
    else if (j && j.state === 'done') view = (j.copy || j.check) && cur() ? 'manage' : 'done';   // a finished copy, or Check now: back to Library and local AI
    else if (cur() || S.mode === 'manage' || MANAGE_ASKED) view = cur() ? 'manage' : 'choose';
    $('#sBack').hidden = !cur();
    if (!bg) render(true);
    else if (!same) keepFocus(() => render(false));   // a background answer updates the screen without moving focus or scrolling
    if (!bg && view === 'manage' && mapQueue) {
      openMapChooser(cur());
      if (!mapQueue.current) nextMapDownload();
    }
    askAgain();
  }
  // From source there is no bundled manifest: the engine may still be fetching it. Ask again while the list is empty.
  function askAgain() {
    if (!packs().length && view !== 'job' && emptyTries++ < 8) setTimeout(() => { if (!packs().length && view !== 'job') load(true).then(() => { if (view === 'job') poll() }) }, 2500);
  }

  /* ------------------------------------------------------------ views */
  function render(focus) {
    clearTimeout(pollT);
    mapSidebarObserver?.disconnect();
    mapSidebarObserver = null;
    shapeKey = '';
    if (view === 'manage') manageView();
    else if (view === 'choose') chooseView();
    else if (view === 'job') jobView(S.job);
    else if (view === 'done') doneView();
    else if (view === 'copy') copyView();
    if (focus && !languageHasFocus()) { const h = main.querySelector('h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }) } scrollTo(0, 0) }
  }
  function keepFocus(draw) {   // the control that had focus has it again after the redraw, so a keyboard user stays where they were
    const a = document.activeElement, inMain = a && a !== main && main.contains(a);
    const sel = !inMain ? '' : a.id ? '#' + CSS.escape(a.id) : a.dataset && a.dataset.act ? `[data-act="${CSS.escape(a.dataset.act)}"]`
      : a.name ? `[name="${CSS.escape(a.name)}"][value="${CSS.escape(a.value)}"]` : '';
    draw();
    const back = sel && main.querySelector(sel);
    if (back && !back.disabled) back.focus({ preventScroll: true });
  }
  function go(v) { view = v; confirmCancel = confirmRemove = confirmOld = false; note = ''; srv.open = false; srv.note = ''; if (v === 'manage' || v === 'choose') repair = null; render(true) }

  /* ---- this computer */
  function computer() {
    const h = S.hardware || {}, d = diskFor(folder), tiles = [];
    if (d) tiles.push([ico('disk'), size(d.free_bytes), `free on ${esc(diskName(d))}`]);
    if (h.ram_bytes) tiles.push([ico('chip'), ram(h.ram_bytes), h.unified_memory ? 'memory, shared with graphics' : 'memory']);
    if (!h.unified_memory) {
      const g = (h.gpus || []).slice().sort((a, b) => (b.vram_bytes || 0) - (a.vram_bytes || 0))[0];
      tiles.push(g ? [ico('gpu'), g.vram_bytes ? ram(g.vram_bytes) : '—', `graphics: ${esc(g.name)}`] : [ico('gpu'), 'None', 'graphics card for the AI']);
    }
    return `<section class="s-pc" aria-label="This computer">${tiles.map(t => `<div class="s-tile">${t[0]}<b>${t[1]}</b><small>${t[2]}</small></div>`).join('')}</section>`;
  }
  function recommendLine() {
    const r = S.recommend || {}, p = packById(r.pack);
    if (!p) return r.why ? `<p class="s-rec bad">${ico('warn')}<span>${esc(r.why)}</span></p>` : '';
    const what = `${esc(p.title)}${r.ai && aiFits() ? ' with the local AI' : ''}`;
    return `<p class="s-rec">${ico('ok')}<span><b>Suggested: ${what}.</b> ${esc(r.why || '')}</span></p>`;
  }

  /* ---- choose */
  function chooseView() {
    const c = cur(), m = model();
    const packCards = packs().map(p => {
      const update = c && c.pack === p.id && packNeedsInstall(p);
      const off = p.available === false, here = c && c.pack === p.id && !update, rec = (S.recommend || {}).pack === p.id && !c;
      const badge = off ? '<span class="s-badge later">Coming later</span>' : update ? '<span class="s-badge rec">Update available</span>' : here ? '<span class="s-badge here">Installed</span>' : rec ? '<span class="s-badge rec">Suggested</span>' : '';
      return `<label class="s-opt${off ? ' off' : ''}">
        <input type="radio" name="pack" value="${esc(p.id)}"${choice.pack === p.id ? ' checked' : ''}${off ? ' disabled' : ''}>
        <span class="s-opt-in"><span class="s-opt-h"><b>${esc(p.title)}</b>${badge}</span>
        <small data-pack-summary="${esc(p.id)}">${esc(packSummary(p))}</small>
        <span class="s-sizes">${off ? 'Not ready to download yet' : here ? 'On this computer' : `<span>${foundFor('pack', p.id) ? 'Already downloaded' : size(packDl(p)) + ' download'}</span><span>${size(p.installed_bytes)} on disk</span>`}</span></span></label>`;
    }).join('');
    let ai = '';
    if (m && m.available !== false) {
      const has = c && c.model;
      ai = aiFits() || has
        ? `<label class="s-opt s-ai"><input type="checkbox" id="aiBox"${choice.ai || has ? ' checked' : ''}${has ? ' disabled' : ''}>
            <span class="s-opt-in"><span class="s-opt-h"><b>Local AI</b>${has ? '<span class="s-badge here">Installed</span>' : (S.recommend || {}).ai && !c ? '<span class="s-badge rec">Suggested</span>' : '<span class="s-badge">Optional</span>'}</span>
            <small>Answers questions from the library, in plain words. Works offline.</small>
            <span class="s-sizes">${has ? 'On this computer' : foundFor('model') ? '<span>Already downloaded</span>' : `<span>About ${size(m.size)} download</span>`}</span></span></label>`
        : `<div class="s-opt s-ai off" role="group" aria-label="Local AI"><span class="s-opt-in"><span class="s-opt-h"><b>Local AI</b><span class="s-badge later">Not for this computer</span></span>
            <small>${esc((S.hardware.ai && S.hardware.ai.why) || 'This computer does not have enough memory for it.')}</small></span></div>`;
    }
    const found = (S.found || []).map((f, i) => f.rejected ? `<div class="s-found off">${ico('file')}<span><b>${esc(f.name || f.path.split(/[\\/]/).pop())}</b><small>${esc(home(f.path))} · doesn’t match the published file, so it is not used</small></span></div>`
      : f.size_ok === false ? '' : `<div class="s-found">${ico(f.kind === 'library' ? 'folder' : 'file')}<span><b>${esc(f.kind === 'library' ? 'A Lastbook library' : f.kind === 'model' ? 'The local AI file' : (packById(f.id) ? packById(f.id).title + ' library' : f.title || f.name))}</b><small>${esc(home(f.path))}${f.size ? ' · ' + size(f.size) : ''}</small></span>
        <button class="btn plain" data-use="${i}">Use the file you already have</button></div>`).join('');

    main.innerHTML = `${c ? '<div class="s-map-layout"><div class="s-map-content">' : ''}${c ? `<button class="s-link" id="toManage">${ico('back')}<span data-i18n="setup.settingsTitle">Library and local AI</span></button>` : ''}
      ${c ? '<h1 data-i18n="setup.changeLibrary">Change the library</h1>' : '<h1 data-i18n="setup.title">Set up Lastbook</h1>'}
      ${c ? '' : '<p class="lead" data-i18n="setup.chooseIntro">Choose your library. Lastbook downloads it for offline use; a state map is optional.</p>'}
      ${computer()}
      ${c ? '' : recommendLine()}
      ${found ? `<h2>Found on this computer</h2><div class="s-founds">${found}</div>` : ''}
      <section id="mapBox" class="s-map-panel" aria-label="Your local map"></section>
      <h2 id="packH" data-i18n="nav.library">Library</h2><div class="s-opts" role="radiogroup" aria-labelledby="packH">${packCards}</div>${ai ? `<h2>Local AI</h2>${ai}` : ''}
      ${c ? '' : '<div id="srvSlot"></div>'}
      <section class="s-sum" id="sum" aria-live="polite"></section>
      ${c ? '' : updatesBox()}
      <div class="s-go">
        <button class="btn big" id="start"></button>
        ${c ? '' : '<button class="s-link" id="haveLib">Choose an existing library folder</button>'}
        <button class="s-link" id="haveFile">Choose a library zip or AI model file</button>
      </div>
      ${c ? '' : '<p class="s-hint" id="zipHint">A library zip is installed as it is, on its own. The local AI, a map and address search can be added after, from Library and local AI.</p>'}
      <p class="s-note" id="haveNote" hidden></p>${c ? `</div>${mapSidebar(c)}</div>` : ''}`;
    main.querySelectorAll('input[name=pack]').forEach(r => r.onchange = () => { setPack(r.value); shortfall = null; mapSection(); summary() });
    const box = $('#aiBox'); if (box && !box.disabled) box.onchange = () => { choice.ai = box.checked; shortfall = null; summary() };
    main.querySelectorAll('[data-use]').forEach(b => b.onclick = () => useFile((S.found || [])[+b.dataset.use].path, b));
    if (c) wireMapSidebar(c);
    if ($('#toManage')) $('#toManage').onclick = () => go('manage');
    if ($('#haveLib')) $('#haveLib').onclick = () => haveLibrary(false);
    if ($('#haveFile')) $('#haveFile').onclick = () => haveLibrary(true);
    wireUpdates();
    mapSection();
    $('#start').onclick = start;
    summary();
    srv.heading = !ai;   // no Local AI section above: the full row brings its own heading
    renderServer();
    globalThis.LastbookI18n?.apply(main);
  }
  /* Map geometry and address indexes are separate downloads, chosen by region. */
  function mapSection() {
    const box = $('#mapBox'), now = mapNow();
    if (!box) return;
    main.querySelectorAll('[data-pack-summary]').forEach(el => { el.textContent = packSummary(packById(el.dataset.packSummary)) });
    const selected = selectedRegion(), allMaps = maps();
    const option = m => {
      const a = addressById(m.id), included = regionIncluded(m.id, now, allMaps) && !installedMap(m.id)?.update_available;
      const off = !included && m.available === false;
      const addressBytes = addressNeedsDownload(m.id) ? packDl(a) : 0;
      const bytes = (included ? 0 : packDl(m)) + addressBytes;
      const details = off ? 'coming later' : included && addressBytes ? `Installed map · ${size(addressBytes)} address search`
        : included ? 'Installed' : bytes ? size(bytes) + ' download' : 'included';
      return `<button type="button" data-pick="map" value="${esc(m.id)}" aria-label="${esc(m.title)} — ${details}"${off ? ' disabled' : ''}${selected === m.id ? ' aria-current="true"' : ''}>${esc(m.title)} <small>— ${details}</small></button>`;
    };
    const picker = (id, title, value, items, disabled = false) => `<div class="s-map-field"><div class="s-maplabel" id="${id}Label">${title}</div>
      <details class="s-picker${disabled ? ' disabled' : ''}"${disabled ? ' inert' : ''}><summary id="${id}" aria-labelledby="${id}Label ${id}"${id === 'mapSel' ? ' aria-describedby="mapHint"' : ''}><span class="s-picker-value">${esc(value || 'Select a ' + title.toLowerCase())}</span></summary>
        <div class="s-picker-list"${mapOnly ? ' popover="manual"' : ''}>${items}</div></details></div>`;
    const location = locationOf(mapById(selected));
    const region = choice.region || location?.region || '';
    const country = choice.country || (region === location?.region ? location.country : '') || '';
    const regions = [...new Set(allMaps.map(m => locationOf(m).region))].sort();
    const countries = [...new Set(allMaps.filter(m => locationOf(m).region === region).map(m => locationOf(m).country))].sort();
    const choices = allMaps.filter(m => { const place = locationOf(m); return place.region === region && place.country === country });
    const sel = mapById(selected), a = addressAdds();
    const mapIncluded = regionIncluded(selected, now, allMaps) && !installedMap(selected)?.update_available;
    const bytes = (sel && !mapIncluded ? packDl(sel) : 0) + (a ? packDl(a) : 0);
    const disk = (sel && !mapIncluded ? sel.installed_bytes || 0 : 0) + (a ? a.installed_bytes || 0 : 0);
    const unavailable = selected && addresses().length && (!addressById(selected) || addressById(selected).available === false);
    const addsToBundledUS = now === 'us' && sel && !isUSState(sel);
    const additionNote = addsToBundledUS ? ' The US map bundled with All stays installed.' : '';
    let hint = skippedMap() ? (now === 'us' ? 'No street-address search. You can add it later from Settings.' : 'No local map. You can add one later from Settings.') : !sel ? 'Choose an area to continue.' : bytes ? `${size(bytes)} download · ${size(disk)} on disk${mapIncluded && a ? '. Your map is already included; only the address index downloads.' : ''}${additionNote}` : 'Your map and available address index are already included.';
    if (unavailable) hint = (bytes ? `${size(bytes)} download · ${size(disk)} on disk.` : 'Your map is already included.') + ` Street-address search is not available for this region yet.${additionNote}`;
    box.innerHTML = `<h2>${ico('map')}Your local map</h2>
      <p class="s-mapnote">Local streets, buildings, water and places to get help. Available offline.</p>
      ${now === 'us' ? `<p class="s-mapnote">All includes every US state map. Choose a state for offline street-address search.${regions.length === 1 ? ' Other regions will appear when published.' : ' Choose another country for its local map.'}</p>` : ''}
      <div class="${mapOnly ? 's-map-fields' : 's-map-fields s-map-fields-stacked'}">${picker('regionSel', 'Region', region, regions.map(x => `<button type="button" data-pick="region" value="${esc(x)}" aria-label="${esc(x)}"${region === x ? ' aria-current="true"' : ''}>${esc(x)}</button>`).join(''))}
      ${picker('countrySel', 'Country', country, countries.map(x => `<button type="button" data-pick="country" value="${esc(x)}" aria-label="${esc(x)}"${country === x ? ' aria-current="true"' : ''}>${esc(x)}</button>`).join(''), !region)}
      ${picker('mapSel', 'Map area', sel?.title || '', choices.map(option).join(''), !country)}</div>
      ${mapOnly ? `<div class="s-map-detail"><p class="s-hint" id="mapHint">${hint}</p><button class="btn s-map-download" id="mapStart"></button></div>` : `${canSkipMap() ? `<button type="button" class="s-link" id="skipMap" aria-pressed="${skippedMap()}">${now === 'us' ? 'No street-address search' : 'No local map'} — skip for now</button>` : ''}
      <p class="s-hint" id="mapHint">${hint}</p>`}`;
    if ($('#skipMap')) $('#skipMap').onclick = () => {
      choice.map = skippedMap() ? null : 'none';
      shortfall = null;
      mapSection();
      summary();
      $('#skipMap').focus();
    };
    if (mapOnly) { $('#mapStart').onclick = addMapToCart; renderMapCart() }
    box.querySelectorAll('.s-picker').forEach(p => p.ontoggle = () => {
      const list = p.querySelector('.s-picker-list');
      if (!p.open) { if (mapOnly && list.matches(':popover-open')) list.hidePopover(); return }
      box.querySelectorAll('.s-picker').forEach(other => { if (other !== p) other.open = false });
      if (!mapOnly) return;
      list.showPopover();
      const anchor = p.querySelector('summary').getBoundingClientRect();
      const below = innerHeight - anchor.bottom - 12, above = anchor.top - 12;
      const opensAbove = below < Math.min(list.scrollHeight, 180) && above > below;
      const room = opensAbove ? above : below;
      const height = Math.max(40, Math.min(260, room));
      list.style.maxHeight = `${height}px`;
      list.style.width = `${anchor.width}px`;
      list.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - anchor.width - 8))}px`;
      list.style.top = `${opensAbove ? anchor.top - Math.min(list.scrollHeight, height) - 4 : anchor.bottom + 4}px`;
    });
    box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
      if (b.dataset.pick === 'region') { choice.region = b.value; choice.country = ''; choice.map = '' }
      else if (b.dataset.pick === 'country') { choice.region = region; choice.country = b.value; choice.map = '' }
      else { choice.region = region; choice.country = country; choice.map = b.value }
      shortfall = null; mapSection(); if (!mapOnly) summary();
      $(b.dataset.pick === 'region' ? '#countrySel' : '#mapSel')?.focus();
    });
  }
  function summary() {
    const { dl, need } = plan(), d = diskFor(folder), free = d ? d.free_bytes : null;
    const short = shortfall || (need && free != null && free < need ? { need_bytes: need, free_bytes: free } : null);
    const pct = need && free ? Math.min(100, need / free * 100) : short ? 100 : 0;
    const c = cur();
    $('#sum').hidden = mapOnly && !need;
    $('#sum').innerHTML = need ? `
      <div class="s-nums"><span><small>Download</small><b>${dl ? size(dl) : 'None'}</b></span><span><small>Space needed</small><b>${size(short ? short.need_bytes : need)}</b></span><span><small>Free on ${esc(diskName(d))}</small><b>${short ? size(short.free_bytes) : free != null ? size(free) : 'Checked at start'}</b></span></div>
      ${free == null && !short ? '' : `<div class="s-meter${short ? ' bad' : ''}" role="img" aria-label="Uses ${Math.round(pct)} percent of the free space"><i style="width:${pct}%"></i></div>`}
      ${short ? `<p class="s-short">${ico('warn')}<span>Not enough room: this needs ${size(short.need_bytes)}, and ${esc(diskName(d))} has ${size(short.free_bytes)} free. Pick a smaller library or another folder.</span></p>` : ''}
      ${folderRow()}`
      : `<p class="s-nothing">${c ? 'This is what you have now.' : 'Pick a library.'}</p>${c ? '' : folderRow()}`;
    const b = $(mapOnly ? '#mapStart' : '#start');
    b.disabled = (!need && !mapSwitches()) || !!short || mapMissing();
    const newPack = c && packNeedsInstall(packById(choice.pack)), newAi = c && choice.ai && !c.model, newMap = c && mapAdds(), newAddresses = c && (!mapOnly || newMap) && addressAdds();
    const parts = [newPack && packById(choice.pack).title, newAi && 'the local AI', newMap && `the ${newMap.title} map`, newAddresses && !newMap && 'offline address search'].filter(Boolean);
    b.textContent = mapMissing() ? 'Choose a map area to continue' : mapOnly && mapAdds() ? installedMap(selectedRegion()) ? 'Update map' : 'Download this map' : mapOnly && !need ? 'Already downloaded' : !c ? 'Download and install' : parts.length ? 'Get ' + parts.join(parts.length > 2 ? ', ' : ' and ').replace(/, ([^,]*)$/, ' and $1') : mapSwitches() ? 'Show selected map' : 'Nothing to add';
    if (newPack && choice.pack === c.pack && !mapMissing()) b.textContent = 'Download and install update';
    const ch = $('#chFolder'); if (ch) ch.onclick = pickFolder;
  }
  const folderRow = () => `<div class="s-folder">${ico('folder')}<span><small>Saves to</small><b title="${esc(folder)}">${esc(home(folder))}</b></span>${cur() ? '' : '<button class="btn plain" id="chFolder">Change…</button>'}</div>`;

  async function pickFolder() {
    const b = $('#chFolder'); b.disabled = true;
    try {
      const r = await call('pick', {});
      if (r && r.path) {
        folder = asData(r.path);
        if (r.free_bytes != null) (S.hardware.disks = S.hardware.disks || []).push({ path: r.path, name: r.disk, free_bytes: r.free_bytes });   // the chosen place's own disk
        shortfall = null;
        const pc = main.querySelector('.s-pc'); if (pc) pc.outerHTML = computer();
      }
      summary();
    } catch { b.disabled = false; b.textContent = 'Can’t change here' }
  }
  async function haveLibrary(files, btn, only) {
    const n = $('#haveNote');
    try {
      const r = await call('pick', { files });
      if (r && r.path) return useFile(r.path, btn || $(files ? '#haveFile' : '#haveLib'), only);
      if (r && (r.cancelled || r.path === null)) return;
      throw 0;
    } catch {
      n.hidden = false;
      n.textContent = 'The picker could not open. Try choosing the file or folder again.';
    }
  }
  async function useFile(path, btn, only) {
    if (btn) btn.disabled = true;
    try {
      const r = await call('use', { path, folder, ...only });   // a library zip goes to the folder chosen on screen, as it is: nothing is downloaded
      if (r && r.error) throw new Error(r.error);
      if (r && r.noted) {   // a model, map or address file kept for the start that follows; only the model is the AI's tick
        S = await call('state').catch(() => S);
        const kind = r.kind || 'model';
        if (kind === 'model') choice.ai = true;
        chooseView(); const n = $('#haveNote'); n.hidden = false;
        const what = kind === 'model' ? 'local AI' : kind === 'map' ? 'map' : 'address search';   // the noted file is for the start button, not for a library zip
        const by = !mapMissing() && $('#start').textContent ? `“${$('#start').textContent}”` : `${cur() ? 'the button above' : '“Download and install”'}, once your state is chosen`;
        n.textContent = `The ${what} file will be used by ${by}, with nothing to download for it. A library zip is installed without it.`;
        return;
      }
      S.job = r; go(r.state === 'done' ? 'done' : 'job'); poll();
    } catch (e) {
      if (btn) btn.disabled = false;
      const n = $('#haveNote'); n.hidden = false; n.textContent = e.message;
    }
  }
  async function start() {
    if (mapMissing()) { $('#mapSel')?.focus(); return }
    const b = $(mapOnly ? '#mapStart' : '#start'); b.disabled = true;
    if (mapSwitches()) {
      const selected = await call('activate-map', { map: selectedRegion() }).catch(e => ({ error: e.message }));
      if (!selected || selected.error) { b.disabled = false; const n = $('#haveNote'); n.hidden = false; n.textContent = selected?.error || 'The map could not be selected. Try again.'; return }
      S = await call('state').catch(() => S);
      if (!plan().need) { go('manage'); return }
    }
    const r = await call('start', { pack: packNeedsInstall(packById(choice.pack)) ? choice.pack : null, ai: !!choice.ai && aiFits() && !(cur() || {}).model, map: mapAdds() ? choice.map : null, address_id: addressById(selectedRegion())?.available !== false && addressById(selectedRegion()) ? selectedRegion() : null, folder }).catch(e => ({ error: e.message }));
    if (r && r.need_bytes) { shortfall = r; summary(); return }
    if (!r || r.error) { b.disabled = false; const n = $('#haveNote'); n.hidden = false; n.textContent = (r && r.error) || 'Setup could not start.'; return }
    S.job = r; mapOnly = false; go('job'); poll();
  }

  /* ---- a model server on this computer (#78): Ollama, llama.cpp. Asked only when the person presses List models. */
  const srv = { open: false, address: '', models: null, note: '', ok: false, heading: false };
  function serverBox() {
    const ms = S.model_server, firstRun = !cur();
    const after = firstRun ? ' Used once setup is done.' : '';
    const note = srv.note ? `<p class="s-note${srv.ok ? ' ok' : ''}" id="srvNote" role="status">${esc(srv.note)}</p>` : '';
    const head = small => `<div class="s-row">${ico('ai', 's-ri')}<span><b>Model server on this computer</b><small>${small}</small></span>`;
    // First-run Setup shows only a link until the person opens the chooser or has chosen a server.
    if (firstRun && !ms && !srv.open) return `<button class="s-link" id="srvOpen">${ico('ai')}Use a model server on this computer</button>${note}`;
    const h2 = firstRun && srv.heading ? '<h2>Local AI</h2>' : '';
    return h2 + serverRow(ms, head, after, note);
  }
  function serverRow(ms, head, after, note) {
    if (!srv.open) return ms
      ? `<div class="s-have">${head(`${esc(ms.model)} at ${esc(ms.address)} · answers instead of the local AI.${after}`)}
          <span class="s-confirm"><button class="btn plain" id="srvOpen">Change</button><button class="btn plain" id="srvStop">Stop using</button></span></div></div>${note}`
      : `<div class="s-have">${head('Use a model you already run with Ollama or llama.cpp, instead of the local AI.')}
          <button class="btn plain" id="srvOpen">Choose…</button></div></div>${note}`;
    const opts = (srv.models || []).map(m => `<option${ms && ms.model === m ? ' selected' : ''}>${esc(m)}</option>`).join('');
    return `<div class="s-have s-srv">${head(`Lastbook asks only this computer, and only when you press List models.${after}`)}</div>
        <div class="s-srv-in">
          <label class="s-maplabel" for="srvAddr">Address</label>
          <input id="srvAddr" class="s-select" inputmode="url" autocomplete="off" spellcheck="false" placeholder="127.0.0.1:11434" value="${esc(srv.address)}" aria-describedby="srvHint">
          <p class="s-hint" id="srvHint">Ollama uses port 11434, llama.cpp port 8080. A server that needs a key does not work yet.</p>
          ${opts ? `<label class="s-maplabel" for="srvModel">Model</label><select id="srvModel" class="s-select">${opts}</select>` : ''}
          <div class="s-go left">${opts ? '<button class="btn" id="srvUse">Use this model</button><button class="btn plain" id="srvList">List again</button>' : '<button class="btn" id="srvList">List models</button>'}
            <button class="s-link" id="srvCancel">Cancel</button></div>
        </div></div>${note}`;
  }
  function renderServer(focus) {
    const slot = $('#srvSlot'); if (!slot) return;
    slot.innerHTML = serverBox();
    const say = (text, ok) => { srv.note = text; srv.ok = !!ok };
    const addr = () => { srv.address = ($('#srvAddr') || {}).value || srv.address; return srv.address };
    if ($('#srvOpen')) $('#srvOpen').onclick = () => { srv.open = true; srv.models = null; say(''); srv.address = srv.address || (S.model_server || {}).address || ''; renderServer('#srvAddr') };
    if ($('#srvCancel')) $('#srvCancel').onclick = () => { srv.open = false; say(''); renderServer('#srvOpen') };
    if ($('#srvAddr')) $('#srvAddr').onkeydown = e => { if (e.key === 'Enter') $('#srvList').click() };
    if ($('#srvList')) $('#srvList').onclick = async () => {
      $('#srvList').disabled = true;
      const r = await call('server-models', { address: addr() }).catch(e => ({ error: e.message }));
      srv.models = r && r.models || null;
      say(r && r.error ? r.error : `${r.models.length === 1 ? 'One model' : r.models.length + ' models'} at ${r.address}.`, !(r && r.error));
      renderServer(srv.models ? '#srvModel' : '#srvAddr');
    };
    if ($('#srvUse')) $('#srvUse').onclick = async () => {
      $('#srvUse').disabled = true;
      const model = $('#srvModel').value;
      const r = await call('use-server', { address: addr(), model }).catch(e => ({ error: e.message }));
      if (r && r.error) { say(r.error); renderServer('#srvAddr'); return }
      S.model_server = r.model_server; srv.open = false; srv.models = null;
      say(cur() ? `Chat now answers with ${model}.` : `Chat will answer with ${model} once setup is done.`, true);
      renderServer('#srvNote');
    };
    if ($('#srvStop')) $('#srvStop').onclick = async () => {
      const r = await call('stop-server', {}).catch(e => ({ error: e.message }));
      if (r && r.error) { say(r.error); renderServer('#srvNote'); return }
      S.model_server = null;
      say(cur() && model() && cur().model ? 'Chat answers with the local AI again.' : 'The model server is no longer used.', true);
      renderServer('#srvNote');
    };
    const f = focus && $(focus); if (f) { if (focus === '#srvNote') f.tabIndex = -1; f.focus() }
  }

  /* ---- manage */
  // #362: files of this library whose contents are only in iCloud do not open offline. The engine counts them from metadata alone.
  function cloudNote(c) {
    const k = c.cloud_only;
    if (!k || !(k.files || k.folders)) return '';
    const n = (count, one) => `${count.toLocaleString()} ${one}${count === 1 ? '' : 's'}`;
    const what = [k.files ? n(k.files, 'file') : '', k.folders ? n(k.folders, 'folder') : ''].filter(Boolean).join(' and ');
    const one = k.files + k.folders === 1;
    return `<p class="s-note" role="status"><b>${what} of this library ${one ? 'is' : 'are'} only in iCloud${k.bytes ? ` (${size(k.bytes)})` : ''}.</b>
      ${one ? 'It' : 'They'} will not open without internet. Move the LastbookData folder out of iCloud Drive, or in Finder choose Keep Downloaded for it (macOS 15 or later).
      <br><small>For example: ${k.examples.map(esc).join(', ')}</small></p>`;
  }

  // Ask again only while the engine is still counting. Windows and Linux never count (cloud_counting false), so no timer starts
  // there. Every redraw of Manage calls this; a timer already waiting is not doubled.
  function cloudPoll(c) {
    if (c.folder !== cloudFor) { cloudFor = c.folder; cloudPolls = 0 }
    if (!c.cloud_counting || cloudT || cloudPolls >= CLOUD_POLLS) return;
    cloudPolls++;
    cloudT = setTimeout(async () => {
      cloudT = null;
      if (view !== 'manage') return;
      S = await call('state').catch(() => S);
      const cloudSlot = $('#cloudNote');
      if (view !== 'manage' || !cloudSlot) return;
      const current = cur() || {};
      cloudSlot.innerHTML = cloudNote(current);
      cloudPoll(current);
    }, CLOUD_POLL_MS);
  }

  function manageView() {
    mapSidebarObserver?.disconnect();
    const c = cur(), p = packById(c.pack), m = model();
    const libraryUpdate = p && p.available !== false && packNeedsInstall(p);
    const o = [].concat(c.old || [])[0], old = o ? (typeof o === 'string' ? { path: o } : o) : null;   // the engine lists the paths it moved aside
    const larger = packs().filter(x => (x.installed_bytes || 0) > ((p && p.installed_bytes) || 0));
    const bigger = larger.filter(x => x.available !== false), later = larger.find(x => x.available === false);
    main.innerHTML = `<div class="s-map-layout"><div class="s-map-content"><h1 data-i18n="setup.settingsTitle">Library and local AI</h1>
      <div class="s-have">
        <div class="s-row">${ico('book', 's-ri')}<span><b>${esc(p ? p.title : c.pack || 'Library')} library</b><small>${libraryUpdate ? 'Updated edition available · ' : p ? size(p.installed_bytes) + ' · ' : ''}${esc(home(c.folder))}</small></span>
          ${libraryUpdate ? `<button class="btn" id="libraryUpdate">Update ${esc(p.title)}</button>` : bigger.length ? `<button class="btn" id="upgrade">${ico('up')}Get ${esc(bigger[0].title)}</button>` : later ? `<span class="s-badge later">${esc(later.title)} comes later</span>` : '<span class="s-badge here">The largest</span>'}</div>
        ${m && m.available !== false ? `<div class="s-row">${ico('ai', 's-ri')}<span><b>Local AI</b><small>${c.model ? 'On this computer · ' + size(m.size) : aiFits() ? 'Not installed · about ' + size(m.size) : esc((S.hardware.ai && S.hardware.ai.why) || 'Not for this computer.')}</small></span>
          ${c.model ? (!CAN.removeAi ? '' : confirmRemove ? `<span class="s-confirm"><button class="btn danger" id="rmYes">Remove</button><button class="btn plain" id="rmNo">Keep</button></span>` : '<button class="btn plain" id="rmAi">Remove</button>') : aiFits() ? `<button class="btn" id="addAi">Add</button>` : ''}</div>` : ''}
      </div>
      <div id="cloudNote">${cloudNote(c)}</div>
      <div id="srvSlot"></div>
      ${old ? `<div class="s-row s-old">${ico('folder', 's-ri')}<span><b>The old library is still here</b><small>${esc(home(old.path))}${old.bytes ? ' · ' + size(old.bytes) : ''}</small></span>${confirmOld ? `<span class="s-confirm"><span>Delete it for good?</span><button class="btn danger" id="oldYes">Delete</button><button class="btn plain" id="oldNo">Keep</button></span>` : `<button class="btn plain" id="rmOld">${ico('trash')}Delete it</button>`}</div>` : ''}
      ${computer()}
      ${CAN.repair ? `<div class="s-have"><div class="s-row">${ico('ok', 's-ri')}<span><b>Library check</b><small id="lastCheck">${checkLine(c.checked)}</small></span><button class="btn plain" id="checkNow">Check now</button></div></div>` : ''}
      <div class="s-have"><div class="s-row">${ico('folder', 's-ri')}<span><b data-i18n="setup.copyTitle">Copy for someone else</b><small>Puts this library on a drive, with a START-HERE.txt, so someone can set up Lastbook with no internet. Nothing of yours is copied.</small></span><button class="btn plain" id="copyOut">Copy to a drive…</button></div></div>
      <div class="s-go left">${CAN.repair ? `<button class="btn plain" id="repair">${ico('repair')}Check and repair</button>` : ''}
        <button class="s-link" id="otherLib">${ico('folder')}Open another library folder</button></div>
      <p class="s-note${noteOk ? ' ok' : ''}" id="haveNote"${note ? '' : ' hidden'}>${esc(note)}</p>
      ${U && U.supported ? `<h2>App updates</h2>${updatesBox()}` : ''}</div>${mapSidebar(c)}</div>`;
    const content = main.querySelector('.s-map-content'), sidebar = main.querySelector('.s-map-sidebar');
    const fitSidebar = () => {
      const height = content.getBoundingClientRect().bottom - sidebar.getBoundingClientRect().top;
      sidebar.style.setProperty('--map-sidebar-content-height', `${Math.max(80, height)}px`);
    };
    mapSidebarObserver = new ResizeObserver(fitSidebar);
    mapSidebarObserver.observe(content);
    fitSidebar();
    wireUpdates();
    cloudPoll(c);
    $('#otherLib').onclick = () => haveLibrary(false, $('#otherLib'), { library: true });   // only another LastbookData, on a USB stick or another drive (#266)
    if ($('#libraryUpdate')) $('#libraryUpdate').onclick = () => { mapOnly = false; setPack(c.pack); choice.ai = !!c.model; go('choose') };
    if ($('#upgrade')) $('#upgrade').onclick = () => { mapOnly = false; setPack(bigger[0].id); choice.ai = !!c.model; go('choose') };
    wireMapSidebar(c);
    if ($('#addAi')) $('#addAi').onclick = () => { mapOnly = false; setPack(c.pack); choice.ai = true; go('choose') };
    if ($('#rmAi')) $('#rmAi').onclick = () => { confirmRemove = true; manageView(); $('#rmNo').focus() };
    if ($('#rmNo')) $('#rmNo').onclick = () => { confirmRemove = false; manageView(); $('#rmAi').focus() };
    if ($('#rmYes')) $('#rmYes').onclick = () => act('remove-ai', 'The local AI was removed.');   // the engine stops the AI first
    if ($('#rmOld')) $('#rmOld').onclick = () => { confirmOld = true; manageView(); $('#oldNo').focus() };
    if ($('#oldNo')) $('#oldNo').onclick = () => { confirmOld = false; manageView(); $('#rmOld').focus() };
    if ($('#oldYes')) $('#oldYes').onclick = () => act('delete-old', 'The old library is being deleted.', { path: old.path });
    if ($('#checkNow')) $('#checkNow').onclick = async () => {   // the Repair check alone: it downloads and changes nothing
      const r = await call('start', { check: true }).catch(e => ({ error: e.message }));
      if (!r || r.error) { note = (r && r.error) || 'The check could not start.'; manageView(); return }
      repair = null; S.job = r; go('job'); poll();
    };
    if ($('#copyOut')) $('#copyOut').onclick = async () => {   // #114: choose the drive, then say what will be copied before copying
      const r = await call('pick', {}).catch(() => null);
      if (!r || !r.path) { if (!r) { note = 'The picker could not open. Try again.'; manageView() } return }
      copyTo = r; go('copy');
    };
    if ($('#repair')) $('#repair').onclick = async () => {
      const r = await call('start', { repair: true, ai: !!c.model }).catch(e => ({ error: e.message }));
      if (!r || r.error) { note = (r && r.error) || 'Repair could not start.'; manageView(); return }
      repair = { fixed: false, sure: true }; S.job = r; go('job'); poll();
    };
    renderServer();
    globalThis.LastbookI18n?.apply(main);
  }
  /* ---- copy for someone else (#114): what goes onto the drive, and what does not */
  let copyTo = null;
  function copyView() {
    const c = cur() || {}, p = packById(c.pack), r = copyTo || {};
    const need = p && p.installed_bytes;
    main.innerHTML = `<h1 data-i18n="setup.copyTitle">Copy for someone else</h1>
      <p class="lead">Copy the ${esc(p ? p.title : 'Lastbook')} library${need ? ` (${size(need)})` : ''} to ${esc(r.disk || home(r.path || ''))}, with a START-HERE.txt that says how to set it up on another computer.</p>
      <div class="s-have"><div class="s-row">${ico('folder', 's-ri')}<span><b>${esc(home(r.path || ''))}</b><small>${r.free_bytes != null ? size(r.free_bytes) + ' free there' : ''}</small></span></div></div>
      <p class="s-note">Not copied: your settings, saved things, chats, notes, address search and the local AI. Only the library’s own files go onto the drive, and each is read back from the drive to make sure it arrived whole.</p>
      <p class="s-two"><button class="btn big" id="copyGo">Copy</button> <button class="btn big plain" id="copyBack">Back</button></p>
      <p class="s-note" id="haveNote"${note ? '' : ' hidden'}>${esc(note)}</p>`;
    $('#copyBack').onclick = () => go('manage');
    $('#copyGo').onclick = async () => {
      $('#copyGo').disabled = true;
      const x = await call('start', { copy_to: r.path }).catch(e => ({ error: e.message }));
      if (!x || x.error) { note = (x && x.error) || 'The copy could not start.'; copyView(); return }
      repair = null; S.job = x; go('job'); poll();
    };
    globalThis.LastbookI18n?.apply(main);
  }
  function copiedView() {
    const r = (S.job && S.job.result) || {};
    main.innerHTML = `<div class="s-done">${ico('ok', 's-big')}<h1>Copied</h1>
      <p class="lead">The drive now holds the library (${r.files || 0} files${r.bytes ? ', ' + size(r.bytes) : ''}, each read back and checked) and ${esc(r.start_here || 'START-HERE.txt')}, which says how to set it up on another computer.</p>
      <p class="s-note"><b>Eject the drive before you unplug it</b>, so the last files are written.</p>
      <button class="btn big" id="back">Back to Library and local AI</button></div>`;
    live.textContent = 'Copied.';
    S.job = null;
    $('#back').onclick = async () => { S = await call('state').catch(() => S); go('manage') };
  }
  // "Last checked 17 November 2026 · every file as published", from current.checked (Check now, or Repair's own check)
  function checkLine(ck) {
    if (!ck || !ck.at) return 'Not checked on this computer yet. Checking reads every file and downloads nothing.';
    const when = new Date(ck.at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    const ai = ck.model_ok === false, map = ck.map_ok === false, files = (ck.damaged || 0) - (ai ? 1 : 0) - (map ? 1 : 0);   // 'damaged' counts the AI file and the map too
    const what = ck.repaired ? `${ck.damaged} damaged or missing, repaired`
      : [files ? `${files} damaged or missing` : '', ai ? 'the local AI file did not match' : '', map ? 'the detailed map is damaged' : ''].filter(Boolean).join(' · ') || 'every file as published';
    return `Last checked ${esc(when)} · ${what}`;
  }
  async function act(path, done, body) {
    const r = await call(path, body || {}).catch(e => ({ error: e.status === 404 ? 'This Lastbook cannot do that yet.' : e.message }));
    confirmRemove = confirmOld = false;
    noteOk = !(r && r.error);
    if (r && r.error) note = r.error;
    else { note = done; S = await call('state').catch(() => S) }
    manageView();
    const n = $('#haveNote'); if (n && !n.hidden) { n.tabIndex = -1; n.focus() }
  }

  /* ---- job */
  const STEPS = { pack: [['downloading', 'Download'], ['verifying', 'Check'], ['unpacking', 'Unpack'], ['activating', 'Finish']],
                  model: [['downloading', 'Download'], ['verifying', 'Check'], ['activating', 'Finish']] };
  STEPS.map = [['downloading', 'Download'], ['unpacking', 'Unpack']];   // the engine's map item: waiting, downloading, unpacking, done
  STEPS.addresses = STEPS.map;
  STEPS.check = [['verifying', 'Check']];   // Check now: every item is only read
  STEPS.copy = [['copying', 'Copy']];
  const WORD = { waiting: 'Waiting', downloading: 'Downloading', paused: 'Paused', verifying: 'Checking', unpacking: 'Unpacking', activating: 'Finishing', copying: 'Copying', done: 'Done', failed: 'Stopped' };
  const ACTIVE = new Set(['waiting', 'downloading', 'verifying', 'unpacking', 'activating', 'copying']);
  let shapeKey = '', lastAct = null;   // lastAct: the button just pressed, so focus lands on what replaced it

  function errorBox(j) {
    const e = j.error, code = errCode(e) || j.code, c = cur();
    const failedModel = (j.items || []).some(it => it.kind === 'model' && it.state === 'failed');
    const blockedModel = failedModel && (code === 'unreachable' || (code === 'network' && (j.items || []).some(it => it.kind === 'model' && it.state === 'failed' && !it.bytes_done)));
    const safe = c ? 'Your library is untouched and still works.' : 'Nothing else on this computer was changed.';
    const d = diskFor(j.folder || folder);
    const T = {
      found_mismatch: (() => {   // a file of the person's own that did not match: nothing was downloaded, and their file is left alone
        const f = String((e && e.file) || ''), name = f.split(/[\\/]/).pop() || 'file', at = f.split(/[\\/]/).slice(-2, -1)[0];
        return [`The ${esc(name)}${at ? ' in ' + esc(at) : ''} doesn’t match the published file, so it was not used.`, 'It was left as it is. Download it instead?', 'download'];
      })(),
      no_space: j.copy ? ['The drive is full.', 'What was copied is kept. Free some space on it, then retry.', 'retry'] : [`Not enough room on ${esc(diskName(d))}${e && e.need_bytes ? `: this needs ${size(e.need_bytes)}, and ${size(e.free_bytes)} is free` : ''}.`, 'Free some space, then retry, or go back and choose less.', 'retry'],
      network: blockedModel
        ? ['This network could not reach the local AI download server.', 'What is downloaded is kept. Retry, or choose the published AI model file downloaded another way.', 'retry']
        : ['The internet connection dropped.', 'What is downloaded is kept. Retry when you are online again.', 'retry'],
      unreachable: [`Lastbook can’t reach ${esc((e && e.host) || 'the download server')}.`,   // the host never answered this download (#254)
        'It may be down for a while; if other websites open on this computer, this network may also be blocking it. Retry later, or download the file below on another network or computer, '
        + (blockedModel ? 'then choose it here.' : 'then choose it with Choose again and “Choose a library zip or AI model file”.'), 'retry'],
      server: ['The download server stayed busy.', 'Your internet connection is fine, and what is downloaded is kept. Retry in a while.', 'retry'],
      checksum: ['The download came out damaged twice, so it was not used.', 'Retry to download it once more.', 'retry'],
      unpack: ['Unpacking did not finish.', 'Check there is room on the disk, then retry.', 'retry'],
      activate: ['The new library is ready but could not be switched in.', 'Retry, or close Lastbook and open it again.', 'retry'],
      check: ['The check stopped.', esc(errText(e) || 'A file could not be read.') + ' Nothing was changed or downloaded.', 'retry'],
      copy: ['The copy stopped.', esc(errText(e) || 'Copy again to the same place to carry on.'), 'retry'],
      cancelled: j.check ? ['The check was cancelled.', 'Nothing was changed or downloaded.', 'back'] : j.copy ? ['The copy was cancelled.', 'What was copied is still on the drive: copy again to the same place to carry on.', 'back'] : ['The download was cancelled.', 'Start again when you are ready.', 'back'],
    }[code] || [esc(errText(e) || 'Something went wrong.'), 'Retry, or go back and choose again.', 'retry'];
    return `<div class="s-err" role="alert">${ico('warn')}<div><b>${T[0]}</b><p>${T[1]}${code === 'found_mismatch' && !c ? '' : ' ' + safe}</p>
      ${code === 'unreachable' && e && e.name ? facts(e) : ''}
      <p class="s-acts">${T[2] === 'retry' ? `<button class="btn" data-act="retry">${ico('retry')}Retry</button>` : T[2] === 'download' ? `<button class="btn" data-act="retry">${ico('down')}Download it</button>` : ''}${blockedModel ? '<button class="btn plain" data-act="model-file">Choose AI model file</button>' : ''}<button class="btn ${T[2] === 'back' ? '' : 'plain'}" data-act="back">Choose again</button></p>${blockedModel ? '<p class="s-note" id="haveNote" role="status" hidden></p>' : ''}</div></div>`;
  }
  /* the published file a download could not reach, to fetch elsewhere and check by hand: name, exact size, address, SHA-256 */
  function facts(e) {
    const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
    return `<dl class="s-facts">${row('File', `<code>${esc(e.name)}</code>`)}${e.size ? row('Size', `${size(e.size)} (${esc(Number(e.size).toLocaleString('en-US'))} bytes)`) : ''}${e.url ? row('Address', `<code>${esc(e.url)}</code>`) : ''}${e.sha256 ? row('SHA-256', `<code>${esc(e.sha256)}</code>`) : ''}</dl>`;
  }
  function itemHTML(it, j) {
    const FAILED_AT = { checksum: 'verifying', found_mismatch: 'verifying', unpack: 'unpacking', activate: 'activating' };
    const steps = j.check ? STEPS.check : STEPS[it.kind] || STEPS.pack;
    const st = it.state === 'paused' && noDownload(it) ? (it.paused_from && it.paused_from !== 'downloading' ? it.paused_from : 'verifying')
      : it.state === 'paused' || it.state === 'waiting' ? 'downloading' : it.state === 'failed' ? FAILED_AT[errCode(it.error) || errCode(j.error)] || 'downloading' : it.state;
    const at = it.state === 'done' ? steps.length : (it.state === 'waiting' || it.state === 'paused') && !it.bytes_done && (!noDownload(it) || it.state === 'waiting') ? -1 : Math.max(0, steps.findIndex(s => s[0] === st));
    const busy = it.state === 'activating' || (['verifying', 'unpacking'].includes(it.state) && !it.bytes_total);   // the check and the unpacking count their bytes
    return `<div class="s-item${it.state === 'failed' ? ' bad' : ''}${it.state === 'done' ? ' ok' : ''}" data-item="${esc(it.id)}" data-kind="${esc(it.kind)}">
      <div class="s-item-h">${ico(it.kind === 'model' ? 'ai' : it.kind === 'map' ? 'map' : it.kind === 'copy' ? 'folder' : 'book', 's-ri')}<b>${esc(itemTitle(it))}</b><span class="s-state" data-f="word">${it.state === 'done' ? ico('ok') : ''}${Object.hasOwn(WORD, it.state) ? WORD[it.state] : ''}</span></div>
      <div class="s-bar new${busy && j.state !== 'paused' ? ' busy' : ''}" role="progressbar" aria-label="${esc(it.title)}" aria-valuemin="0" aria-valuemax="100" data-f="bar"><i></i></div>
      <p class="s-line" data-f="line"></p>
      <ol class="s-steps" aria-label="Steps">${steps.map((s, i) => `<li class="${i < at ? 'done' : i === at && it.state !== 'failed' ? 'now' : i === at ? 'stop' : ''}">${s[1]}</li>`).join('')}</ol>
    </div>`;
  }
  const itemTitle = it => it.kind === 'model' ? 'Local AI' : it.kind === 'map' ? `${(mapById(it.id) || it).title || it.id} map` : it.kind === 'addresses' ? it.title : it.id === 'library' || it.id === 'repair' || /library/i.test(it.title) ? it.title : it.title + ' library';
  /* an item that needs nothing from the internet: the person's own file, or one stopped after its download was complete.
     source and paused_from come from the engine (docs/SETUP-API.md); without them, a complete download still counts */
  const noDownload = it => it.source === 'found' || (!!it.paused_from && it.paused_from !== 'downloading') || (it.bytes_total > 0 && it.bytes_done >= it.bytes_total);
  const STOPPED = { verifying: 'Checking stopped', unpacking: 'Unpacking stopped', activating: 'Finishing stopped' };
  const above = it => { const items = (S.job && S.job.items) || [], i = items.findIndex(x => x.id === it.id && x.kind === it.kind); return items.slice(0, Math.max(i, 0)) };
  const behind = it => above(it).some(x => x.state !== 'done' && !noDownload(x));   // a download waits for the downloads above it
  const afterAbove = it => above(it).some(x => x.state !== 'done');                // a file already here waits for everything above it
  const checkOnly = it => noDownload(it) || (!!(S.job && S.job.repair) && it.kind === 'pack' && !(repair && repair.fixed));   // a repair checks the open library before it fetches anything
  const fetching = j => ['downloading', 'unpacking'].includes(j.state) || j.items.some(i => ['downloading', 'unpacking'].includes(i.state) || ['downloading', 'unpacking'].includes(i.paused_from));
  /* a page opened again during a repair learns it from the engine's job (repair: true). It is sure of what the done screen says
     only if nothing could have been fetched before it looked. fixed stays true once a download is seen */
  function syncRepair(j) {
    if (!j || j.check) return;      // a Check now never fetches: it is no repair
    if (!repair && j.repair) { const f = fetching(j); repair = { fixed: f, sure: f || j.items.every(i => i.state === 'waiting' || i.state === 'verifying') } }
    else if (repair && fetching(j)) repair.fixed = true;
  }
  function fillItem(el, it) {
    const pct = it.bytes_total ? Math.min(100, it.bytes_done / it.bytes_total * 100) : it.state === 'done' ? 100 : 0;
    const bar = el.querySelector('[data-f=bar]'), line = el.querySelector('[data-f=line]');
    const showPct = !bar.classList.contains('busy');
    bar.firstChild.style.width = (showPct ? pct : 100) + '%';
    if (showPct) bar.setAttribute('aria-valuenow', Math.round(pct)); else bar.removeAttribute('aria-valuenow');
    let t = '';
    if (it.state === 'done') t = it.bytes_total ? size(it.bytes_total) : '';
    else if (it.state === 'downloading') t = [`${size(it.bytes_done)} of ${size(it.bytes_total)}`, it.retry_in_s ? retryIn(it.retry_in_s) : rate(it.rate_bps), eta(it.eta_s)].filter(Boolean).join(' · ');
    else if (it.kind === 'copy' && it.state === 'waiting') t = it.bytes_total ? `${size(it.bytes_total)} to copy` : '';   // a copy's lines come before a download's: it downloads nothing
    else if (it.kind === 'copy' && (it.state === 'copying' || it.state === 'paused' || it.state === 'failed')) t = [`${size(it.bytes_done)} of ${size(it.bytes_total)} copied and checked`, it.state === 'copying' ? rate(it.rate_bps) : '', it.state === 'copying' ? eta(it.eta_s) : ''].filter(Boolean).join(' · ');
    else if (it.state === 'paused' && noDownload(it)) t = `${STOPPED[it.paused_from] || 'Stopped'}${it.paused_from === 'unpacking' && it.bytes_done && it.bytes_total ? ` at ${size(it.bytes_done)} of ${size(it.bytes_total)}` : ''}. Nothing to download.`;
    else if (S.job && S.job.check && !it.bytes_done && (it.state === 'waiting' || it.state === 'paused')) t = it.bytes_total ? `Already on this computer: ${size(it.bytes_total)} to check${afterAbove(it) ? ', after the one above' : ''}` : '';
    else if (it.state === 'waiting' && !it.bytes_done && checkOnly(it)) t = it.bytes_total ? `Already on this computer: ${size(it.bytes_total)} to check${afterAbove(it) ? ', after the one above' : ''}` : '';
    else if ((it.state === 'waiting' || it.state === 'paused') && !it.bytes_done) t = it.bytes_total ? `${size(it.bytes_total)} to download${behind(it) ? ', after the one above' : ''}` : '';
 else if (it.state === 'paused' || it.state === 'waiting' || it.state === 'failed') t = it.bytes_total && it.bytes_done ? `${size(it.bytes_done)} of ${size(it.bytes_total)}` : '';
    else if (it.state === 'verifying') {
      /* a resumed download re-reads the part it already has while the job stays 'downloading'; a check of a whole item (a repair,
         or a file already here) sets the job to 'verifying' too. Only that whole check has a true time left */
      const resumed = !!(S.job && S.job.state === 'downloading'), whole = !resumed && (it.source === 'found' || !!(S.job && S.job.repair));
      t = !it.bytes_total ? 'Making sure every byte is right'
        : resumed ? `Checking what is already downloaded: ${size(it.bytes_done)} so far`
        : [`Checking: ${size(Math.min(it.bytes_done, it.bytes_total))} of ${size(it.bytes_total)}`, whole ? eta(it.eta_s) : ''].filter(Boolean).join(' · ');
    }
    else if (it.state === 'unpacking') t = it.bytes_total ? `Unpacking: ${size(it.bytes_done)} of ${size(it.bytes_total)}${it.eta_s != null ? ' · ' + eta(it.eta_s) : ''}` : 'Opening the files into the library folder';
    else if (it.state === 'activating') t = it.kind === 'map' ? 'Switching to the new map' : 'Switching to the new library';
    line.textContent = t;
  }
  /* the job screen's heading. A Check now is known from the engine's job (check), so also after a restart */
  function jobHead(j) {
    return { paused: 'Paused', failed: errCode(j.error) === 'cancelled' ? 'Cancelled' : 'Stopped' }[j.state]
      || (j.copy ? 'Copying to the drive' : j.check ? 'Checking the library' : repair && !repair.fixed ? 'Checking the library' : repair ? 'Repairing' : 'Installing');
  }
  function jobView(j) {
    if (!j) { go(cur() ? 'manage' : 'choose'); return }
    if (j.state === 'done') { go('done'); return }
    if (cancelling || j.stopping) {   // the cancelled work has not stopped yet: nothing new can start until it has (#463 review)
      if (shapeKey !== 'stopping') {
        shapeKey = 'stopping';
        main.innerHTML = `<h1>Finishing cancellation…</h1><p class="lead" role="status">${j.copy ? 'Lastbook is stopping the copy.' : j.check ? 'Lastbook is stopping the check.' : 'Lastbook is stopping the download and clearing its files.'} You can choose again once it has stopped.</p>`;
        if (!languageHasFocus()) { const h = main.querySelector('h1'); h.tabIndex = -1; h.focus({ preventScroll: true }) }
        live.textContent = 'Finishing cancellation…';
      }
      return;
    }
    syncRepair(j);
    const key = j.state + '|' + errCode(j.error) + '|' + confirmCancel + '|' + j.items.map(i => i.kind + ':' + i.id + ':' + i.state).join(',');
    const head = jobHead(j);
    if (key !== shapeKey) {
      const had = lastAct || (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.act : null);
      lastAct = null;
      const first = !shapeKey;
      shapeKey = key;
      const lead = jobLead(j);
      main.innerHTML = `<h1>${head}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}
        ${j.state === 'failed' ? errorBox(j) : ''}
        <div class="s-items">${j.items.map(it => itemHTML(it, j)).join('')}</div>
        ${j.state === 'failed' ? '' : `<div class="s-go left">${confirmCancel
          ? `<span class="s-confirm"><span>${j.check ? 'Stop checking? Nothing is changed.' : j.copy ? 'Stop copying? What is copied stays on the drive.' : 'Stop and throw away the download?'}</span><button class="btn danger" data-act="cancel-yes">Stop</button><button class="btn plain" data-act="cancel-no">Keep going</button></span>`
          : jobControls(j)}</div>`}`;
      main.querySelectorAll('[data-act]').forEach(b => b.onclick = () => jobAct(b.dataset.act, b));
      const again = had && main.querySelector(`[data-act="${had}"]`) || (had && main.querySelector('[data-act]'));
      if (!languageHasFocus()) {
        if (again) again.focus();
        else if (first) { const h = main.querySelector('h1'); h.tabIndex = -1; h.focus({ preventScroll: true }) }
      }
      const s = j.state === 'failed' ? '' : head + (j.items.find(i => ACTIVE.has(i.state)) ? ': ' + WORD[j.items.find(i => ACTIVE.has(i.state)).state] + ' ' + j.items.find(i => ACTIVE.has(i.state)).title : '');
      if (s && live.textContent !== s) live.textContent = s;
    }
    const fresh = main.querySelectorAll('.s-bar.new');
    j.items.forEach(it => { const el = main.querySelector(`[data-item="${CSS.escape(it.id)}"][data-kind="${CSS.escape(it.kind)}"]`); if (el) fillItem(el, it) });
    if (fresh.length) { void main.offsetWidth; fresh.forEach(b => b.classList.remove('new')) }   // a new screen shows the bar where it is, without growing from nothing
  }
  /* The line under the heading. A copy has its own words first: it downloads nothing, and a copy paused at 100% (its last file
     read back, not yet finished) is not "stopped when Lastbook closed" (#204 review). */
  function jobLead(j) {
    if (j.state === 'failed') return '';
    if (j.copy) return j.state === 'paused' ? 'What is copied is kept. Resume when you are ready. If Lastbook closes, copy again to the same place to carry on.'
      : 'You can keep using this computer. If Lastbook closes, copy again to the same place to carry on.';
    if (j.check) return j.state === 'paused' ? 'Nothing was downloaded or changed. Resume to check again from the start, even after closing Lastbook.'
      : 'You can keep using this computer. Checking reads every file and downloads nothing.';
    const quiet = j.state === 'paused' && j.items.filter(i => i.state === 'paused').every(noDownload);
    return quiet ? 'Stopped when Lastbook closed. Resume to finish; nothing needs downloading.'
      : j.state === 'paused' ? 'What is downloaded is kept. Resume when you are ready, even after closing Lastbook.'
      : 'You can keep using this computer. Closing Lastbook pauses it.';
  }
  /* Resume when paused; Pause while it downloads, waits, or copies (a copy pauses between chunks, as a download does) */
  function jobControls(j) {
    return `${j.state === 'paused' ? `<button class="btn" data-act="resume">${ico('play')}Resume</button>` : (j.state === 'downloading' || j.state === 'copying' || (j.state === 'waiting' && !j.repair)) ? `<button class="btn plain" data-act="pause">${ico('pause')}Pause</button>` : ''}
             <button class="btn plain" data-act="cancel">${ico('x')}Cancel</button>`;
  }
  async function jobAct(a, b) {
    if (a === 'model-file') { await haveLibrary(true, b); return }
    if (a === 'back') { S = await call('state').catch(() => S); S.job = null; shortfall = null; go('choose'); return }   // fresh: found[] may now mark a file as not matching
    if (a === 'cancel') { confirmCancel = true; jobView(S.job); main.querySelector('[data-act="cancel-no"]').focus(); return }
    if (a === 'cancel-no') { confirmCancel = false; jobView(S.job); return }
    if (a === 'cancel-yes') { confirmCancel = false; a = 'cancel' }
    b.disabled = true; lastAct = a;
    if (a === 'cancel') { cancelling = true; clearTimeout(pollT); jobView(S.job) }   // "Finishing cancellation…" from the click: cancel waits for the work to stop
    let ok = false;
    try {
      const j = await call(a, {});
      if (j && j.items) { S.job = j; ok = true }
      else if (j && j.code === 'busy') { const k = await call('job'); if (k && k.items) S.job = k }   // the job as it is now, to show and poll
    } catch { }
    cancelling = false;
    if (a === 'cancel' && ok && !S.job.stopping) { await cancelled(); return }   // a refused cancel stays on the job, which still runs
    jobView(S.job);
    poll();
  }
  /* the "Finishing cancellation…" screen is up and the engine now says the work has stopped */
  function wasStopping(j) { return shapeKey === 'stopping' && j && !j.stopping && j.state === 'failed' && errCode(j.error) === 'cancelled' }
  /* back to Setup once the cancelled work has stopped */
  async function cancelled() {
    const was = S.job && S.job.copy, wasCheck = S.job && S.job.check;
    S = await call('state').catch(() => S); S.job = null; go(cur() ? 'manage' : 'choose');
    live.textContent = wasCheck ? 'The check was stopped. Nothing was changed.' : was ? 'The copy was stopped. What was copied is on the drive.' : 'The download was cancelled.';
  }
  function poll() {
    clearTimeout(pollT);
    if (!S.job || !(ACTIVE.has(S.job.state) || S.job.stopping)) return;
    pollT = setTimeout(async () => {
      try { const j = await call('job'); if (j) S.job = j } catch { pollT = setTimeout(poll, 3000); return }
      if (view !== 'job' || cancelling) return;
      if (S.job && S.job.state === 'done') { go('done'); return }
      if (wasStopping(S.job)) { await cancelled(); return }
      jobView(S.job);
      poll();
    }, 1000);
  }

  /* ---- done */
  function doneView() {
    if (S.job && S.job.copy) return copiedView();
    if (S.job && S.job.check) return checkedView();
    syncRepair(S.job);
    const j = S.job || { items: [] }, r = j.result;   // the engine's result says what a repair did; without one, what this page saw
    const fixed = repair && (r ? !!r.repaired : repair.fixed), checked = repair && !fixed, unsure = checked && !r && !repair.sure;   // unsure: opened again late in a repair
    const got = j.items.filter(i => i.id !== 'repair' && i.id !== 'library').map(i => esc(itemTitle(i))).join(', ').replace(/, ([^,]*)$/, ' and $1');
    main.innerHTML = `<div class="s-done">${ico('ok', 's-big')}<h1>${unsure ? 'Checked' : checked ? 'All good' : fixed ? 'Repaired' : 'Ready'}</h1>
      <p class="lead">${unsure ? 'The library was checked and is complete. Anything that was damaged was downloaded again.' : checked ? 'The library was checked and is complete.' : fixed ? repairedWords(r || {}) : got ? `Installed: ${got}.` : j.items.some(i => i.id === 'library') ? 'The library you chose is ready to open.' : 'The library is installed.'}</p>
      <button class="btn big" id="open">Open the library</button><p class="s-note" id="openNote" hidden></p></div>`;
    live.textContent = checked ? 'The library was checked.' : fixed ? 'Repaired. Ready to open.' : 'Installed. Ready to open.';
    $('#open').onclick = async () => {
      const b = $('#open'); b.disabled = true; b.textContent = 'Opening your library…';
      const r = await call('finish', {}).catch(e => ({ error: e.message }));   // on {ok} the app relaunches itself into the library
      if (!r || r.error) { b.disabled = false; b.textContent = 'Open the library'; const n = $('#openNote'); n.hidden = false; n.textContent = (r && r.error) || 'The library did not open. Try again.' }
      else live.textContent = 'Opening your library…';
    };
  }

  /* what Repair did: the whole library downloaded again (the damaged copy kept aside), the AI file replaced, the map fetched again */
  function repairedWords(r) {
    const ai = r.model_ok === false, map = r.map_ok === false, lib = r.pack_replaced != null ? !!r.pack_replaced : (r.damaged || 0) - ai - map > 0;
    const said = [lib ? 'The library was downloaded again, because some of its files were damaged. The damaged copy is kept aside; you can delete it in Library and local AI.' : '',
                  ai ? (lib ? 'The local AI file was downloaded again too.' : 'The local AI file was damaged, so it was downloaded again and put in its place.') : '',
                  map ? 'The detailed map was downloaded again.' : ''].filter(Boolean).join(' ');
    return said || 'A damaged part was downloaded again.';
  }
  /* ---- Check now: what the check found. Nothing was downloaded or changed; Repair is the person's choice */
  /* what Repair would do for what the check found: a damaged library file means the whole library again; the AI file is replaced in place */
  function repairOffer(bad, ai, map) {
    const does = [bad ? 'downloads the whole library again and keeps the damaged copy aside' : '', ai ? 'downloads the local AI file again and puts it in place of this one' : '',
                  map ? 'downloads the detailed map again' : ''].filter(Boolean);
    return does.length ? `Repair ${does.join(', and ').replace(/, and ([^,]*), and /, ', $1, and ')}.` : '';
  }
  function checkedView() {
    const r = (S.job && S.job.result) || {}, ai = r.model_ok === false, map = r.map_ok === false, bad = (r.damaged || 0) - (ai ? 1 : 0) - (map ? 1 : 0);   // library files; the AI file and the map apart
    const what = [bad ? `${bad} ${bad === 1 ? 'file is' : 'files are'} damaged or missing` : '', ai ? 'the local AI file does not match its published copy' : '', map ? 'the detailed map is damaged' : ''].filter(Boolean).join(', and ');
    main.innerHTML = bad || ai || map
      ? `<div class="s-done">${ico('warn', 's-big')}<h1>Something needs repair</h1>
        <p class="lead">${esc(what[0].toUpperCase() + what.slice(1))}. Nothing was changed or downloaded. ${repairOffer(bad, ai, map)}</p>
        <p class="s-two"><button class="btn big" id="doRepair">${ico('repair')}Repair</button> <button class="btn big plain" id="back">Not now</button></p></div>`
      : `<div class="s-done">${ico('ok', 's-big')}<h1>All good</h1><p class="lead">Every file matches the published library. Nothing was downloaded.</p>
        <button class="btn big" id="back">Back to Library and local AI</button></div>`;
    live.textContent = bad || ai || map ? 'The check found damage.' : 'The library was checked. All good.';
    repair = null;
    S.job = null;
    call('state').then(x => { S = x }).catch(() => { });   // the new "Last checked" date
    $('#back').onclick = async () => { S = await call('state').catch(() => S); go('manage') };
    if ($('#doRepair')) $('#doRepair').onclick = async () => {
      const x = await call('start', { repair: true, ai: !!(S.current && S.current.model) }).catch(e => ({ error: e.message }));
      if (!x || x.error) { note = (x && x.error) || 'Repair could not start.'; go('manage'); return }
      repair = { fixed: false, sure: true }; S.job = x; go('job'); poll();
    };
  }

  /* keyboard: Escape closes a question that is open */
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || languageHasFocus()) return;
    if (confirmCancel) { confirmCancel = false; jobView(S.job); const b = main.querySelector('[data-act="cancel"]'); if (b) b.focus() }
    else if (confirmRemove || confirmOld) { const f = confirmRemove ? '#rmAi' : '#rmOld'; confirmRemove = confirmOld = false; manageView(); $(f).focus() }
  });
  /* the window comes back to the front: the job may have moved on, or a restart paused it */
  addEventListener('focus', () => { if (view === 'job') call('job').then(j => { if (!j || view !== 'job' || cancelling) return; S.job = j; if (wasStopping(j)) { cancelled(); return } jobView(j); poll() }).catch(() => { }) });

  load().then(() => { if (view === 'job') poll() });
})();
