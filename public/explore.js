// explore.js — render only card layout; adds comments modal
(() => {
const auth = window.auth || firebase.auth();
const db   = window.db   || firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;

// ---------- Small helpers ----------
function escapeHTML(s) {
return String(s || "").replace(/[&<>"']/g, c =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c])
    );
  }
  const fmtWhen = (ts) => {
  try { if (ts?.toDate) return ts.toDate().toLocaleString(); } catch(_) {}
  return new Date().toLocaleString();
  };
  async function safeUsername(uid){
  try{
  const d = await db.collection('users').doc(uid).get();
  return (d.exists && d.data().username) ? d.data().username : uid;
}catch{ return uid; }
}
function bumpCommentBadge(beatId, delta){
document.querySelectorAll(`[data-cmt-count="${beatId}"]`)
.forEach(el => { el.textContent = Math.max(0, (+el.textContent||0)+delta); });
  }

// ---------- Categories shown as chips ----------
const CATEGORIES = [
'All','Hip Hop','Trap','R&B','Afrobeat','Pop','Drill','Lo-Fi',
'House','EDM','Reggaeton','Dancehall','Country','Rock','Other'
  ];

  // ---------- UI refs ----------
  const bar         = document.getElementById('categoryBar');
  const searchInput = document.getElementById('searchInput');
  const sortSelect  = document.getElementById('sortSelect');
  const followOnly  = document.getElementById('followOnly');
  const listEl      = document.getElementById('tracks');
  const emptyMsg    = document.getElementById('emptyMsg');

  // ---------- State ----------
  let activeCategory = new URLSearchParams(location.search).get('genre') || 'All';
  let followingIds = new Set();

// ---------- Utilities ----------
const dThrottle = (fn, ms) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

// ---------- Chips ----------
function renderChips(){
bar.innerHTML = CATEGORIES.map(cat => `
  <button class="category-chip ${cat===activeCategory?'active':''}" data-cat="${cat}" type="button">
  ${cat}
  </button>
 `).join('');
  }
  bar.addEventListener('click', (e) => {
  const btn = e.target.closest('.category-chip'); if (!btn) return;
  activeCategory = btn.dataset.cat;
  bar.querySelectorAll('.category-chip').forEach(b => b.classList.toggle('active', b === btn));
  const qp = new URLSearchParams(location.search);
  if (activeCategory === 'All') qp.delete('genre'); else qp.set('genre', activeCategory);
  history.replaceState({}, '', `${location.pathname}?${qp.toString()}`);
  load();
  });

  // ---------- Toolbar listeners ----------
  searchInput.addEventListener('input', dThrottle(load, 300));
  sortSelect.addEventListener('change', load);
  followOnly.addEventListener('change', load);

  // ---------- Following set ----------
  auth.onAuthStateChanged(async (u) => {
    followingIds = new Set();
if (u) {
const snap = await db.collection('follows')
.where('followerId','==', u.uid)
.orderBy('ts','desc')
.limit(500).get().catch(()=>null);
if (snap && !snap.empty) snap.docs.forEach(d => followingIds.add(d.data().followingId));}
  load();
  });

// ---------- Card template (only renderer) ----------
function trackCardHTML(d){
const b = d.data();
const title = escapeHTML(b.title || 'Untitled');
const genre = escapeHTML(b.genre || 'Uncategorised');
const when  = fmtWhen(b.timestamp);
const coverImg = b.coverURL ? `<img src="${escapeHTML(b.coverURL)}" alt="">` : '';

return `
<div class="track-card">
<div class="track-cover">${coverImg}</div>
<div class="track-body">
<div class="track-title-row">
<div class="track-title" title="${title}">${title}</div>
<span class="badge">${genre}</span>
</div>
<div class="track-meta">${when}</div>
<audio controls preload="none" src="${escapeHTML(b.audioURL || '')}"></audio>
<div class="track-cta">
<button class="pill like-btn" data-id="${d.id}" aria-label="Like">
<span>❤</span> <span>${b.likeCount || 0}</span>
</button>

<!-- NEW: comments pill -->
<button class="pill cmt-btn" data-id="${d.id}" aria-label="Comments">
<span>💬</span> <span data-cmt-count="${d.id}">${b.commentCount || 0}</span>
</button>

<a class="pill" href="profile.html?uid=${encodeURIComponent(b.userId)}">Profile</a>
</div>
</div>
</div>
`;}

function attachCardHandlers(){
// Like
listEl.querySelectorAll('.like-btn').forEach(btn => {
btn.addEventListener('click', async () => {
const id = btn.dataset.id;
const user = auth.currentUser;
if (!user) { alert('Please log in to like tracks.'); return; }

const likeDoc = db.collection('beats').doc(id).collection('likes').doc(user.uid);
await db.runTransaction(async (tx) => {
const beatRef = db.collection('beats').doc(id);
const [likeSnap, beatSnap] = await Promise.all([tx.get(likeDoc), tx.get(beatRef)]);
let likeCount = (beatSnap.data()?.likeCount) || 0;
if (likeSnap.exists) { tx.delete(likeDoc); likeCount = Math.max(0, likeCount-1); }
else { tx.set(likeDoc, { userId: user.uid, createdAt: FieldValue.serverTimestamp() }); likeCount++; }
tx.update(beatRef, { likeCount });
});
load();
});});}
// Attach a single delegated comments handler once
if (!listEl.dataset.cmtWired) {
listEl.addEventListener('click', (e) => {
const btn = e.target.closest('.cmt-btn');
if (!btn) return;
const id = btn.dataset.id || btn.getAttribute('data-id') || btn.getAttribute('data-cmt');
if (!id) return;
if (window.showComments) window.showComments(id);
else alert('Comments module not loaded.');
  });
listEl.dataset.cmtWired = '1';
}

  // ---------- Main loader ----------
async function load(){
listEl.innerHTML = '<div class="track-meta">Loading…</div>';
emptyMsg.style.display = 'none';

const base = db.collection('beats').where('visibility','==','public');
const cat = activeCategory;
let query = (cat && cat !== 'All') ? base.where('genre','==', cat) : base;

const sort = sortSelect.value || 'newest';
if (sort === 'newest')       query = query.orderBy('timestamp','desc').limit(50);
else if (sort === 'oldest')  query = query.orderBy('timestamp','asc').limit(50);
else                         query = query.orderBy('timestamp','desc').limit(100); // popular window

let snap;
try {
snap = await query.get();
} catch (e) {
console.error('Query needs composite index (visibility+genre+timestamp).', e);
listEl.innerHTML = '';
emptyMsg.style.display = 'block';
emptyMsg.textContent = 'This filter is setting up its search index. Try again soon.';
return;
    }

let docs = snap.docs;

if (followOnly.checked && followingIds.size) {
docs = docs.filter(d => followingIds.has(d.data().userId));
}

const kw = (searchInput.value || '').trim().toLowerCase();
if (kw) docs = docs.filter(d => (d.data().title || '').toLowerCase().includes(kw));

if (sort === 'popular') docs = docs.sort((a,b) => (b.data().likeCount||0) - (a.data().likeCount||0));

if (!docs.length) {
listEl.innerHTML = '';
emptyMsg.style.display = 'block';
emptyMsg.textContent = 'No results.';
return;}
listEl.innerHTML = docs.map(trackCardHTML).join('');
attachCardHandlers();
  }
renderChips();
load();
})();
