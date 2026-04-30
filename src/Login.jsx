import React, { useState } from 'react';
import { auth } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";

const Login = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onLoginSuccess();
    } catch (err) {
      setError("Lỗi: " + err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4">
      <div className="w-full max-w-md bg-[#1e293b] border-2 border-cyan-500 p-8 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.3)]">
        <h2 className="text-white text-3xl font-black text-center mb-8 tracking-widest uppercase">
          {isRegister ? 'KHỞI TẠO HÀNH TRÌNH' : 'XÁC NHẬN DANH TÍNH'}
        </h2>
        
        <form onSubmit={handleAuth} className="space-y-6">
          <div>
            <label className="text-cyan-400 text-xs font-bold block mb-2 uppercase">Email liên kết:</label>
            <input type="email" required className="w-full bg-[#0f172a] text-white border border-slate-600 rounded-lg p-3 focus:border-cyan-400 outline-none" 
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-cyan-400 text-xs font-bold block mb-2 uppercase">Mật mã:</label>
            <input type="password" required className="w-full bg-[#0f172a] text-white border border-slate-600 rounded-lg p-3 focus:border-cyan-400 outline-none" 
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          
          {error && <p className="text-red-400 text-xs font-bold text-center italic">{error}</p>}
          
          <button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-400 text-[#0f172a] font-black py-3 rounded-xl uppercase transition-all shadow-lg">
            {isRegister ? 'ĐĂNG KÝ NGAY' : 'ĐĂNG NHẬP HỆ THỐNG'}
          </button>
        </form>

        <p className="text-slate-400 text-center mt-6 text-sm">
          {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} 
          <button onClick={() => setIsRegister(!isRegister)} className="text-cyan-400 ml-2 font-bold underline">
            {isRegister ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;