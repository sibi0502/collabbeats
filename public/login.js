// login.js — email/password sign-in + sign-up with ?next= redirect
(() => {
  const auth = window.auth || firebase.auth();
  const db   = window.db   || firebase.firestore();

  // Parse ?next=target.html (default: chat-index.html)
  const params = new URLSearchParams(location.search);
  const nextUrl = params.get('next') ? decodeURIComponent(params.get('next')) : 'explore.html';

  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('password');
  const formEl  = document.getElementById('authForm');
  const loginBtn  = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const msgEl     = document.getElementById('msg');

  function setMsg(text, isError=false) {
 msgEl.textContent = text || '';
  msgEl.classList.toggle('error', isError);
  }

  function goNext() {
    // simple safety: disallow javascript: URLs
    if (/^javascript:/i.test(nextUrl)) { location.href = 'chat-index.html'; return; }
    location.href = nextUrl;
  }

  // Already signed in? bounce immediately
  firebase.auth().onAuthStateChanged(user => {
    if (user) goNext();
  });
  // Log in existing user
  formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg('Signing in…');
  try {
  await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  await auth.signInWithEmailAndPassword(emailEl.value.trim(), passEl.value);
  setMsg('Success. Redirecting…');
  goNext();
  } catch (err) {
  console.error(err);
  setMsg(friendlyAuthError(err), true);
    }});

  // Create account, then redirect
  signupBtn.addEventListener('click', async () => {
  setMsg('Creating account…');
  try {
  await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  const cred = await auth.createUserWithEmailAndPassword(emailEl.value.trim(), passEl.value);

  // Optional: create /users/{uid} profile doc (works with your rules)
  const u = cred.user;
  const username = (u.email || '').split('@')[0];
  await db.collection('users').doc(u.uid).set({
  uid: u.uid,
  email: u.email,
  username,
  photoURL: u.photoURL || '',
  createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

 setMsg('Account created. Redirecting…');
  goNext();
  } catch (err) {
  console.error(err);
  setMsg(friendlyAuthError(err), true);
    }});
  function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code.includes('auth/invalid-email')) return 'Invalid email address.';
  if (code.includes('auth/user-not-found') || code.includes('auth/wrong-password')) return 'Email or password is incorrect.';
  if (code.includes('auth/email-already-in-use')) return 'An account already exists for this email. Try logging in.';
  if (code.includes('auth/weak-password')) return 'Password should be at least 6 characters.';
  if (code.includes('auth/operation-not-allowed')) return 'This sign-in method is not enabled in Firebase Console.';
  return err.message || 'Authentication error.';
  }
})();

