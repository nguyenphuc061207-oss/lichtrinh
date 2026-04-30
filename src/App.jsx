import React, { useState, useEffect } from 'react';
import GameRoadmap from './GameRoadmap';
import Login from './Login';
import { auth } from './firebase'; // Kết nối với file firebase.js bạn vừa tạo
import { onAuthStateChanged } from "firebase/auth";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Bản chất: Firebase sẽ lắng nghe xem trong trình duyệt đã lưu "chìa khóa" đăng nhập chưa
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    // Hủy lắng nghe khi component bị gỡ bỏ
    return () => unsubscribe();
  }, []);

  // Màn hình chờ trong lúc Firebase đang kiểm tra danh tính
  if (loading) {
    return (
      <div className="bg-[#0f172a] min-h-screen flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-cyan-400 font-black tracking-widest animate-pulse">ĐANG KHỞI TẠO HỆ THỐNG...</p>
      </div>
    );
  }

  return (
    <div>
      {/* 
          Cơ chế Logic:
          - Nếu biến user có dữ liệu (đã đăng nhập) -> Hiện GameRoadmap và truyền thông tin user vào
          - Nếu user là null (chưa đăng nhập) -> Hiện màn hình Login
      */}
      {user ? (
        <GameRoadmap user={user} />
      ) : (
        <Login onLoginSuccess={() => {}} />
      )}
    </div>
  );
}

export default App;