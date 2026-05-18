import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCmHaayfQy0WSOE1HG_bDjs4tiVJFDFb84",
  authDomain: "vybera.firebaseapp.com",
  projectId: "vybera",
  storageBucket: "vybera.firebasestorage.app",
  messagingSenderId: "544899681732",
  appId: "1:544899681732:web:72950958f1ac6b83356891",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});

window.signInWithGoogle = async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const displayName = user.displayName || "Google User";
    const email = user.email || "";

    window.applySocialLogin({
      name: displayName,
      email,
      photoURL: user.photoURL || "",
    });
  } catch (err) {
    console.error("Google sign-in failed:", err);

    if (err.code === "auth/popup-closed-by-user") {
      return;
    }

    if (err.code === "auth/unauthorized-domain") {
      alert("Google login is blocked for this domain. Add localhost to Firebase Authentication authorized domains.");
      return;
    }

    alert(err.message || "Google sign-in failed. Please try again.");
  }
};
