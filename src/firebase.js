import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Dán đoạn config mà bạn lấy từ Firebase Console vào đây
const firebaseConfig = {
  apiKey: "AIzaSyADhDsfV9g2apcAghGA7PGuGbLJ4z9Cihk",
  authDomain: "lich-d694c.firebaseapp.com",
  projectId: "lich-d694c",
  storageBucket: "lich-d694c.firebasestorage.app",
  messagingSenderId: "816734434323",
  appId: "1:816734434323:web:e8f00935e1eeddeda9fbe6",
  measurementId: "G-KGV8HE92KJ"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// QUAN TRỌNG: Phải có chữ 'export' ở trước const để các file khác có thể import được
export const auth = getAuth(app);
export const db = getFirestore(app);