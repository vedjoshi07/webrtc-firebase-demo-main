import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAuq63eJ6VgNdS9URmBWNqzvEqYeCgHkfE",
  authDomain: "webrtc-7590d.firebaseapp.com",
  projectId: "webrtc-7590d",
  storageBucket: "webrtc-7590d.firebasestorage.app",
  messagingSenderId: "541947779235",
  appId: "1:541947779235:web:28fbc8c34d1f74915e8716",
  measurementId: "G-QT9L9S15N1"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
