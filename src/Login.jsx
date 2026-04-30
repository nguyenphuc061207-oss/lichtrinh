import React, { useState } from 'react';
import { auth } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithRedirect } from 'firebase/auth';

const Login = () => {
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
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    }
  };

 const handleGoogleLogin = async () => {
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      // Đổi từ Popup sang Redirect để không bị chặn trên Mobile
      await signInWithRedirect(auth, provider);
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

        <div className="text-center mb-8 relative z-10">
          <h2 className="text-3xl font-black text-white tracking-widest drop-shadow-md">
            {isRegister ? 'TẠO HÀNH TRÌNH' : 'KHỞI TẠO'}
          </h2>
          <p className="text-cyan-400 font-bold text-sm mt-1 uppercase tracking-wider">Hệ thống Lịch Trình</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4 relative z-10">
          <div>
            <input 
              type="email" 
              required
              placeholder="Email liên kết"
              className="w-full bg-[#0f172a] text-white border border-slate-600 rounded-lg p-3 text-sm focus:outline-none focus:border-cyan-400 transition-colors" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
            />
          </div>
          <div>
            <input 
              type="password" 
              required
              placeholder="Mật mã an ninh"
              className="w-full bg-[#0f172a] text-white border border-slate-600 rounded-lg p-3 text-sm focus:outline-none focus:border-cyan-400 transition-colors" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
            />
          </div>

          {error && <p className="text-red-400 text-xs font-bold text-center italic">{error}</p>}

          <button 
            type="submit" 
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-[#0f172a] font-black p-3 rounded-lg uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)]"
          >
            {isRegister ? 'Đăng Ký Ngay' : 'Truy Cập Mật'}
          </button>
        </form>

        <div className="relative flex py-5 items-center z-10">
            <div className="flex-grow border-t border-slate-600"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold uppercase">Hoặc</span>
            <div className="flex-grow border-t border-slate-600"></div>
        </div>

        <button 
          onClick={handleGoogleLogin}
          className="relative z-10 w-full bg-white hover:bg-slate-100 text-slate-800 font-bold p-3 rounded-lg flex items-center justify-center gap-3 transition-colors shadow-sm"
        >
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
          ĐĂNG NHẬP BẰNG GOOGLE
        </button>

        <p className="text-center text-slate-400 text-xs mt-6 relative z-10 font-bold">
          {isRegister ? 'Đã có quyền truy cập? ' : 'Chưa có tài khoản? '}
          <button onClick={() => setIsRegister(!isRegister)} className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
            {isRegister ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;