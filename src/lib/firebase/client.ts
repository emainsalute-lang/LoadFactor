"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDX-oafVl_l-LN1Z8XgHXdEiws4EGZGPuI",
  authDomain: "loadfactor-c2e73.firebaseapp.com",
  projectId: "loadfactor-c2e73",
  storageBucket: "loadfactor-c2e73.firebasestorage.app",
  messagingSenderId: "933177384583",
  appId: "1:933177384583:web:8cec9b879410a753e4e222",
  measurementId: "G-NXDZ5XFWH9",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
export const firebaseStorage = getStorage(firebaseApp);
