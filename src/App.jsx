import React, { useState, useEffect } from 'react';
import GameRoadmap from './GameRoadmap';
import Login from './Login';
import { auth } from './firebase'; 
import { onAuthStateChanged } from "firebase/auth";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("Hệ thống đang kiểm tra kết nối Firebase...");
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log("Trạng thái người dùng:", currentUser);
      setUser(currentUser);
      setLoading(false);
    }, (error) => {
      console.error("Lỗi Firebase Auth:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="bg-[#0f172a] min-h-screen flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-cyan-400 font-black tracking-widest animate-pulse">HỆ THỐNG ĐANG PHÂN TÍCH DỮ LIỆU...</p>
      </div>
    );
  }

  return (
    <div>
      {user ? <GameRoadmap user={user} /> : <Login onLoginSuccess={() => {}} />}
    </div>
  );
}

export default App;
```[cite: 1]

### Bước cuối cùng:
1. Đảm bảo file **`firebase.js`** đã có lệnh `export const auth = getAuth(app);` ở cuối[cite: 1].
2. Chạy lại: `git add .` -> `git commit -m "Fix login logic"` -> `git push`[cite: 1, 2].
