// nav.js — shows Login/Sign Up when logged out, and Profile/Logout when logged in.
(function () {
  // Bind Firebase globals
const auth = (window.auth || (window.firebase && window.firebase.auth && window.firebase.auth())) || null;
const db   = (window.db   || (window.firebase && window.firebase.firestore && window.firebase.firestore())) || null;
if (!auth || !db) {
console.warn('Firebase not initialized before nav.js. Check script order.');
return;}
const authArea = document.getElementById('authArea');
if (!authArea) return;
const nameCache = new Map();
async function getUsername(uid, fallback) {
if (nameCache.has(uid)) return nameCache.get(uid);
try {
const doc = await db.collection('users').doc(uid).get();
const name = doc.exists ? (doc.data().username || fallback) : fallback;
nameCache.set(uid, name);
return name;
} catch {
return fallback;
}}
function renderLoggedOut() {
const next = encodeURIComponent(location.pathname.replace(/^\//, '') + location.search);
authArea.innerHTML = `
<a class="link" href="login.html?next=${next}">Login</a>
<a class="primary" href="signup.html?next=${next}">Sign Up</a>
`;}
function renderLoggedIn({ displayName, photoURL }) {
const avatar = photoURL || 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
<circle cx="40" cy="40" r="40" fill="#1f2937"/>
<circle cx="40" cy="30" r="14" fill="#9ca3af"/>
<path d="M12,74c5-16,26-18,28-18s23,2,28,18" fill="#9ca3af"/>
</svg>`);
authArea.innerHTML = `
<a class="user-pill" href="profile.html" title="My Profile">
<img alt="" src="${avatar}">
<span>${escapeHtml(displayName || 'Me')}</span>
</a>
<button id="globalLogoutBtn" class="link" type="button">Logout</button>
`;
const btn = document.getElementById('globalLogoutBtn');
btn?.addEventListener('click', async (e) => {
e.preventDefault();
try { await auth.signOut(); }
finally { window.location.replace('login.html'); } // ✅ go to login
  });}
function escapeHtml(s) {
return String(s || '').replace(/[&<>"']/g, m => ({
'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[m]));
}
auth.onAuthStateChanged(async (user) => {
if (!user) { renderLoggedOut(); return; }
let name = user.displayName;
if (!name || !name.trim()) {
const fallback = user.email ? user.email.split('@')[0] : 'user';
name = await getUsername(user.uid, fallback);}
renderLoggedIn({ displayName: name, photoURL: user.photoURL });
});
})();
