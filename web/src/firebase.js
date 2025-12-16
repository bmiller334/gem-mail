// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/setup#available-libraries
const firebaseConfig = {
  projectId: "gem-mail-480201",
  appId: "1:124652613510:web:7c2b1e6feeb85cc62a0607",
  storageBucket: "gem-mail-480201.firebasestorage.app",
  apiKey: "AIzaSyDjKRGv-40u5D1Kqu2clxObUuGfq3W5ltA",
  authDomain: "gem-mail-480201.firebaseapp.com",
  messagingSenderId: "124652613510"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);