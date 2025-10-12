// public/firebaseConfig.js
(function () {
  // Your exact values from Firebase console (Project settings → General)
  const firebaseConfig = {
    apiKey: "AIzaSyAihdc01a3BoJIe6f08EcgSImoCzwy7AbI",
    authDomain: "collabbeats.firebaseapp.com",
    projectId: "collabbeats",
    storageBucket: "collabbeats.firebasestorage.app",
    messagingSenderId: "599474024736",
    appId: "1:599474024736:web:e604623a8c031ae476e745",
    measurementId: "G-WYBXH5GHY3"
  };

  // Initialize once
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  // Expose handles
  window.auth = firebase.auth();
  window.db = firebase.firestore();
  window.storage = firebase.storage();

  // (Optional) App Check for local dev
  // Uncomment after you have a site key in App Check → Web → reCAPTCHA
  // self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // dev only
  // const recaptchaSiteKey = "PASTE_YOUR_RECAPTCHA_SITE_KEY";
  // firebase.appCheck().activate(recaptchaSiteKey, /* isTokenAutoRefresh */ true);

  // Quick sanity check in the console
  console.log("[Firebase] SDK ready. Project:", firebase.app().options.projectId);
  console.log("[Storage] bucket:", firebase.app().options.storageBucket);
})();
