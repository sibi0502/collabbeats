// leaderboard.js — Top / Trending / New (public beats) with compact rows
(() => {
  const auth    = window.auth    || firebase.auth();
  const db      = window.db      || firebase.firestore();
  const storage = window.storage || firebase.storage();

  const listEl     = document.getElementById('leaderList');
  const segs       = document.querySelectorAll('[data-tab]');
  const signOutBtn = document.getElementById('signOutBtn');
  const loginLink  = document.getElementById('loginLink');

  const esc = (s) => String(s || '').replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])
  );

  const show = (m) => {
    listEl.innerHTML = `<div class="track-sub" style="text-align:center">${esc(m)}</div>`;
  };

  function basePublicQuery() {
    return db.collection('beats').where('visibility', '==', 'public');
  }

  // ---- URL helpers ----
  async function audioUrlFor(b) {
  if (b.audioURL)     return b.audioURL;     // new field
  if (b.downloadURL)  return b.downloadURL;  // legacy
  if (b.storagePath) {
  try { return await storage.ref(b.storagePath).getDownloadURL(); }
  catch (e) { /* ignore */ }}
  return '';}

  async function coverUrlFor(b) {
  // handle both spellings + a few common alternates
  if (b.coverURL)  return b.coverURL;
  if (b.coverUrl)  return b.coverUrl;
  if (b.cover)     return b.cover; // if they stored the full URL here
const path = b.coverStoragePath || b.coverPath;
if (path) {
try { return await storage.ref(path).getDownloadURL(); }
catch (e) { /* ignore */ }}
return '';
}

  /**
   * Fetch a window of public beats then optionally filter/sort in memory.
   * windowDays: number | null — time window (e.g., 7 or 30), null = all we fetch
   * sort: 'likes' | 'timeDesc' | 'trending'
   * limit: how many to render
   */
  async function fetchBeats({ windowDays = 30, sort = 'likes', limit = 40 } = {}) {
    const base = basePublicQuery();

try {
if (sort === 'timeDesc') {
if (windowDays) {
const since = firebase.firestore.Timestamp.fromDate(
new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000));
const snap = await base.where('timestamp', '>=', since)
.orderBy('timestamp', 'desc')
.limit(limit)
.get();
return snap.docs.map(d => ({ id: d.id, ...d.data() }));
} else {
const snap = await base.orderBy('timestamp', 'desc').limit(limit).get();
return snap.docs.map(d => ({ id: d.id, ...d.data() }));}}

// For "likes" or "trending", pull a recent window and sort client-side
const since = windowDays
? firebase.firestore.Timestamp.fromDate(
new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000))
: null;
const q = since ? base.where('timestamp', '>=', since) : base;
const snap = await q.orderBy('timestamp', 'desc').limit(120).get();
return snap.docs.map(d => ({ id: d.id, ...d.data() }));
} catch (e) {
// Fallback w/out indexes
const snap = await base.limit(120).get();
let arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
if (windowDays) {
const minMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
arr = arr.filter(b => (b.timestamp?.toMillis?.() ?? 0) >= minMs);}
return arr;}}
// Trending score: likes weighted by freshness (age in hours)
function trendingScore(b) {
const likes = b.likeCount || 0;
const ageH  = Math.max(1, (Date.now() - (b.timestamp?.toMillis?.() ?? 0)) / 36e5);
return likes / Math.pow(ageH, 0.6);
  }
 async function render(tab) {
// update tab UI
segs.forEach(s => s.classList.toggle('active', s.dataset.tab === tab));
show('Loading…');
try {
let beats = [];
if (tab === 'new') {
beats = await fetchBeats({ windowDays: 60, sort: 'timeDesc', limit: 40 });
} else if (tab === 'trending') {
beats = await fetchBeats({ windowDays: 30, sort: 'trending', limit: 80 });
beats = beats.sort((a, b) => trendingScore(b) - trendingScore(a)).slice(0, 40);
} else {
beats = await fetchBeats({ windowDays: 60, sort: 'likes', limit: 80 });
beats = beats.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0)).slice(0, 40);
}

if (!beats.length) {
show('No beats to show yet.');
return;}

// Resolve audio + cover URLs in parallel for speed
const rows = await Promise.all(
beats.map(async b => {
const [audio, cover] = await Promise.all([audioUrlFor(b), coverUrlFor(b)]);
const art = cover || 'https://dummyimage.com/300x300/e5e7eb/9ca3af.png&text=Beat';
return `
<article class="track-row">
<img class="track-art" src="${art}" alt="">
<div class="track-main">
<div class="track-title"><span>${esc(b.title || 'Untitled')}</span></div>
<div class="track-sub">${esc(b.genre || '')}</div>
${audio ? `<audio controls src="${audio}" preload="none" style="margin-top:6px"></audio>` : ``}
</div>
<div class="track-actions">
<div class="track-sub">${(b.likeCount || 0)} likes</div>
<a class="pill" href="profile.html?uid=${esc(b.userId)}">Artist</a>
${audio ? `<a class="pill" href="${audio}" download>Download</a>` : ``}
</div>
</article>
`;}));
listEl.innerHTML = rows.join('');
} catch (e) {
console.error(e);
show('Failed to load leaderboard.');}}
// auth link in header (optional)
auth.onAuthStateChanged(me => {
if (me) {
if (signOutBtn) signOutBtn.style.display = 'inline-block';
if (loginLink)  loginLink.style.display  = 'none';
} else {
if (signOutBtn) signOutBtn.style.display = 'none';
if (loginLink)  loginLink.style.display  = 'inline-block';}});
if (signOutBtn) {
signOutBtn.addEventListener('click', async (e) => {
e.preventDefault();
try { await auth.signOut(); } finally { location.href = 'login.html'; }});}
segs.forEach(s => s.addEventListener('click', () => render(s.dataset.tab)));
render('top');
})();
