import React, { useState, useEffect } from 'react';
import GameRoadmap from './GameRoadmap';
import Login from './Login';
import { auth } from './firebase'; 
import { onAuthStateChanged } from "firebase/auth";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Lắng nghe trạng thái đăng nhập từ Firebase
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    }, (error) => {
      console.error("Lỗi xác thực:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
      {/* Nếu có user thì vào Roadmap, không thì hiện màn hình Login */}
      {user ? <GameRoadmap user={user} /> : <Login onLoginSuccess={() => {}} />}
    </div>
  );
}

export default App;
