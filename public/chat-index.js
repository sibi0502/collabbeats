// chat-index.js — Lobby (genres with cover art)
// Requires firebaseConfig.js (exposes window.auth and window.db)

(() => {
  const auth = window.auth || firebase.auth();
  const db   = window.db   || firebase.firestore();

  // --------- Rooms ----------
  const DEFAULT_ROOMS = [
    { id: 'rap',       name: 'Rap',       description: 'Talk bars, flows, beats',                    coverUrl: 'img/rooms/rap.jpg' },
    { id: 'rnb',       name: 'R&B',       description: 'Groove, vocals, and smooth melodies',       coverUrl: 'img/rooms/rnb.jpg' },
    { id: 'edm',       name: 'EDM',       description: 'House, techno, drops and festivals',        coverUrl: 'img/rooms/edm.jpg' },
    { id: 'house',     name: 'House',     description: 'Deep/Tech/Progressive',                     coverUrl: 'img/rooms/house.jpg' },
    { id: 'jazz',      name: 'Jazz',      description: 'Smooth vibes, improvisation, soul',         coverUrl: 'img/rooms/jazz.jpg' },
    { id: 'pop',       name: 'Pop',       description: 'Catchy hooks and chart toppers',            coverUrl: 'img/rooms/pop.jpg' },
    { id: 'afrobeats', name: 'Afrobeats', description: 'Dance rhythms, afro-fusion, global vibes',  coverUrl: 'img/rooms/afrobeats.jpg' },
  ];

  // --------- Auth UI toggle in header ----------
  auth.onAuthStateChanged(u => {
    const login  = document.getElementById('loginLink');
    const logout = document.getElementById('logoutLink');
    if (!login || !logout) return;
    if (u) {
      login.style.display = 'none';
      logout.style.display = 'inline';
      logout.onclick = e => { e.preventDefault(); auth.signOut(); };
    } else {
      login.style.display = 'inline';
      logout.style.display = 'none';
    }
  });
// --------- DOM refs ----------
  const roomsEl    = document.getElementById('rooms');
  const searchEl   = document.getElementById('search');
  const sortEl     = document.getElementById('sort');
  const refreshBtn = document.getElementById('refreshBtn');
  // --------- Utils ----------
  const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  function fromNow(ts){
 try {
if (!ts) return '—';
const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
if (!d || isNaN(d.getTime())) return '—';
const s = Math.max(0, ((Date.now() - d.getTime())/1000)|0);
if (s < 60) return `${s|0}s ago`;
const m = s/60|0; if (m < 60) return `${m}m ago`;
const h = m/60|0; if (h < 24) return `${h}h ago`;
const d2 = h/24|0; return `${d2}d ago`;
    } catch { return '—'; }
  }

  // Resolve asset paths so "img/rooms/x.jpg" becomes "/public/img/rooms/x.jpg"
  const BASE = location.pathname.replace(/\/[^\/]*$/, ''); // e.g. "/public"
  function asset(p) {
    if (!p) return '';
    p = String(p).trim();                     // IMPORTANT: trims trailing/leading spaces
    if (/^https?:\/\//i.test(p)) return p;   // absolute URL
    if (p.startsWith('/')) return p;         // root-based path
    return `${BASE}/${p}`;                   // relative to /public
  }

  // --------- Render helpers ----------
  function cardHTML(r){
    // prefer Firestore coverUrl, fallback to <id>.jpg in /img/rooms
    const cover = asset((r.coverUrl && String(r.coverUrl).trim()) || `img/rooms/${r.id}.jpg`);
    const last  = r.lastMessageAt || r.updatedAt || r.createdAt;
    const desc  = r.description || '';

    return `
    <a class="room-card" href="chat-room.html?room=${encodeURIComponent(r.id)}"
      title="${esc(r.name || r.id)}"
      style="--cover:url('${cover}')">
     <div class="room-title">${esc(r.name || r.id)}</div>
    <div class="room-desc">${esc(desc)}</div>
    <div class="room-meta">
      <span>${r.membersCount || 0} ${(r.membersCount||0)===1 ? 'member' : 'members'}</span>
     <span>•</span>
     <span>active ${esc(fromNow(last))}</span>
        </div>
</a> `;}
  function renderList(list, term=''){
const t = (term||'').trim().toLowerCase();
  const filtered = !t ? list : list.filter(r => {
  const hay = `${(r.name||'').toLowerCase()} ${(r.description||'').toLowerCase()}`;
  return hay.includes(t);
    });
    roomsEl.innerHTML = filtered.length
      ? filtered.map(cardHTML).join('')
      : '<div class="muted center" style="margin:24px 0">No rooms match your search.</div>';
  }
 // --------- Firestore query ----------
  let unsub = null;
  function buildQuery() {
  const mode = sortEl?.value || 'name'; // 'name' | 'active' | 'newest'
  let q = db.collection('chatRooms').where('privacy', '==', 'public');
// Keep it to one orderBy to avoid needing composite indexes
if (mode === 'active')      q = q.orderBy('lastMessageAt', 'desc').limit(100);
else if (mode === 'newest') q = q.orderBy('createdAt',    'desc').limit(100);
else                        q = q.orderBy('name',         'asc').limit(100);

return q;}
function subscribeRooms(){
if (unsub) { unsub(); unsub = null; }
roomsEl.innerHTML = '<div class="muted center" style="margin:24px 0">Loading…</div>';
const q = buildQuery();
unsub = q.onSnapshot({
next: (snap) => {
if (snap.empty) {
// Fallback to defaults if there are no docs
renderList(DEFAULT_ROOMS, searchEl?.value || '');
return; }
const list = [];
snap.forEach(doc => {
const d = doc.data() || {};
list.push({
id: doc.id,
name: d.name || doc.id,
description: d.description || '',
membersCount: d.membersCount || 0,
createdAt: d.createdAt,
updatedAt: d.updatedAt,
lastMessageAt: d.lastMessageAt,
coverUrl: d.coverUrl ? String(d.coverUrl).trim() : undefined, // trim here too
          });});
renderList(list, searchEl?.value || '');},
error: (err) => {
console.error('rooms onSnapshot error:', err);
// If rules/indexing fail, still show defaults
renderList(DEFAULT_ROOMS, searchEl?.value || '');
      }}); }
// --------- Wire UI ----------
  searchEl?.addEventListener('input',  () => subscribeRooms());
  sortEl?.addEventListener('change',   () => subscribeRooms());
  refreshBtn?.addEventListener('click',() => subscribeRooms());
// --------- Boot ----------
  subscribeRooms();
})();
