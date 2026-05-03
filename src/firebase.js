import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, getToken } from "firebase/messaging";

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
export const messaging = getMessaging(app);

export const requestNotificationPermission = async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const token = await getToken(messaging, {
        vapidKey: "BMndSZhDItqO58Y_g03WgEyJHkbO1qPB5V0bysp0FVHGKIzlsYP9QO7xLVqQIn6HNdSKwZKbTjMdAgAfALFZGUw"
      });
      if (token) {
        console.log("FCM Token:", token);
        return token;
      } else {
        console.log("Không thể lấy token đăng ký thông báo.");
      }
    } else {
      console.log("Quyền gửi thông báo bị từ chối.");
    }
  } catch (error) {
    console.error("Đã xảy ra lỗi khi lấy FCM token: ", error);
  }
  return null;
};