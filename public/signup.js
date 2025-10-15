// public/signup.js
(() => {
const auth = window.auth || firebase.auth();
const db   = window.db   || firebase.firestore();
const form    = document.getElementById('signupForm');
const emailEl = document.getElementById('signupEmail');
const passEl  = document.getElementById('signupPass');
const unameEl = document.getElementById('unameInput');
const msgEl   = document.getElementById('signupMsg');
function setMsg(text, type = '') {
if (!msgEl) return;
msgEl.textContent = text || '';
msgEl.className = 'msg ' + (type || '');}
function cleanUsername(raw) {
  
// keep only allowed characters and clamp length
let v = String(raw || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '');
if (v.length > 20) v = v.slice(0, 20);
return v;
  }
form?.addEventListener('submit', async (e) => {
e.preventDefault();
try {
setMsg('');
const email = (emailEl?.value || '').trim();
const pass  = (passEl?.value  || '').trim();
let uname   = cleanUsername(unameEl?.value);

if (!uname || uname.length < 3) {
throw new Error('Username must be 3–20 characters using letters, numbers, _ . -');
  }
if (!email) throw new Error('Email is required.');
if (!pass)  throw new Error('Password is required.');

const unameLower = uname.toLowerCase();

// 1) Create auth user first (to get uid)
const cred = await auth.createUserWithEmailAndPassword(email, pass);
const uid  = cred.user.uid;

try {
     // 2) Reserve username + write profile in a single transaction
await db.runTransaction(async (tx) => {
const unameRef = db.collection('usernames').doc(unameLower);
const userRef  = db.collection('users').doc(uid);
const taken = await tx.get(unameRef);
if (taken.exists) {
throw new Error('That username is taken. Try another one.');}

tx.set(unameRef, {
uid,
createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
tx.set(userRef, {
username: uname,
usernameLower: unameLower,
email,
photoURL: '',
lookingFor: [],
createdAt: firebase.firestore.FieldValue.serverTimestamp()});
        });
  
// 3) Set Auth displayName 
await cred.user.updateProfile({ displayName: uname });
} catch (txErr) {
// Roll back auth user if we failed to reserve the username
try { await cred.user.delete(); } catch(_) {}
throw txErr;
      }
setMsg('Account created! Redirecting…', 'ok');
// redirect anywhere you want
setTimeout(() => { window.location.href = 'profile.html'; }, 600);
} catch (err) {
console.error(err);
setMsg(err?.message || 'Failed to create account.', 'error');
    }
  });
})();
