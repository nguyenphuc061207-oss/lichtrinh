import React, { useState } from 'react';
import { auth } from './firebase';
import { GoogleAuthProvider, signInWithPopup, signInAnonymously } from 'firebase/auth';

const Login = () => {
  const [error, setError] = useState('');

  const handleGoogleLogin = async (e) => {
    e.preventDefault();
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    }
  };

  const handleGuestLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await signInAnonymously(auth);
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] p-4 select-none">
      <div className="bg-[#1e293b] p-8 rounded-2xl shadow-[0_0_40px_rgba(6,182,212,0.2)] w-full max-w-[400px] border border-slate-700 relative overflow-hidden">
        
        {/* Trang trí góc */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500 rounded-full blur-[60px] opacity-20"></div>
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-600 rounded-full blur-[60px] opacity-20"></div>

        <div className="text-center mb-10 relative z-10">
          <h2 className="text-3xl font-black text-white tracking-widest drop-shadow-md">
            KHỞI TẠO
          </h2>
          <p className="text-cyan-400 font-bold text-sm mt-1 uppercase tracking-wider">Hệ thống Lịch Trình</p>
        </div>

        <div className="space-y-4 relative z-10">
          
          <button 
            type="button" 
            onClick={handleGoogleLogin}
            className="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold p-3.5 rounded-lg flex items-center justify-center gap-3 transition-colors shadow-sm"
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-6 h-6" />
            ĐĂNG NHẬP BẰNG GOOGLE
          </button>

          <div className="relative flex py-2 items-center z-10">
            <div className="flex-grow border-t border-slate-600"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold uppercase">Hoặc</span>
            <div className="flex-grow border-t border-slate-600"></div>
          </div>

          <button 
            type="button" 
            onClick={handleGuestLogin}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-black p-3.5 rounded-lg flex items-center justify-center gap-3 uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(0,0,0,0.4)] border border-slate-600"
          >
            <span className="text-xl">🕵️</span>
            TRUY CẬP TÀI KHOẢN KHÁCH
          </button>

          {error && (
            <p className="text-red-400 text-xs font-bold text-center italic mt-4 bg-red-900/30 p-2 rounded">
              Lỗi: {error}
            </p>
          )}

        </div>

        <p className="text-center text-slate-400 text-[10px] mt-8 relative z-10 font-bold px-4">
          Tài khoản khách sẽ bị mất dữ liệu nếu bạn xóa bộ nhớ trình duyệt hoặc đổi thiết bị.
        </p>
      </div>
    </div>
  );
};

export default Login;