importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyADhDsfV9g2apcAghGA7PGuGbLJ4z9Cihk",
  authDomain: "lich-d694c.firebaseapp.com",
  projectId: "lich-d694c",
  storageBucket: "lich-d694c.firebasestorage.app",
  messagingSenderId: "816734434323",
  appId: "1:816734434323:web:e8f00935e1eeddeda9fbe6",
  measurementId: "G-KGV8HE92KJ"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Đã nhận được tin nhắn ngầm (background message): ', payload);
  
  // Tùy chỉnh hiển thị thông báo
  const notificationTitle = payload.notification?.title || 'Thông báo mới';
  const notificationOptions = {
    body: payload.notification?.body || 'Bạn có một tin nhắn mới.',
    icon: '/vite.svg', // Bạn có thể đổi đường dẫn này thành icon của app (VD: /logo.png)
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
