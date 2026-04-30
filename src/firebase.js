import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Dán đoạn config mà bạn lấy từ Firebase Console vào đây
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "lich-d694c.firebaseapp.com",
  projectId: "lich-d694c",
  storageBucket: "lich-d694c.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// QUAN TRỌNG: Phải có chữ 'export' ở trước const để các file khác có thể import được
export const auth = getAuth(app);
export const db = getFirestore(app);