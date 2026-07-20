import React, { useState } from 'react';
import { supabase } from './supabase';

export function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);



  // Default password from seed
  const quickLogin = async (fastEmail: string) => {
    if (isLoading) return;
    setError('');
    setMsg('');
    setIsLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: fastEmail, password: 'password123' });
    if (signInError) setError(signInError.message);
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    if (isLogin) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError(signInError.message);
    } else {
      if (!fullName.trim()) {
        setError('Введіть ваше ПІБ');
        setIsLoading(false);
        return;
      }
      const { error: signUpError } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setMsg('Реєстрація успішна! Тепер ви можете увійти.');
        setIsLogin(true);
      }
    }
    setIsLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, var(--bg-main) 0%, var(--border-color) 100%)'
    }}>
      <div className="panel" style={{ padding: '32px', width: '100%', maxWidth: '400px', background: 'var(--bg-panel)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '24px', color: 'var(--text-primary)' }}>
          {isLogin ? 'Вхід (МКП)' : 'Реєстрація (МКП)'}
        </h2>
        
        {error && <div style={{ color: 'var(--danger-color)', marginBottom: '16px', fontSize: '13px', textAlign: 'center' }}>{error}</div>}
        {msg && <div style={{ color: 'var(--accent-color)', marginBottom: '16px', fontSize: '13px', textAlign: 'center' }}>{msg}</div>}

        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          <button type="button" className={isLogin ? '' : 'secondary'} style={{ flex: 1 }} onClick={() => { setIsLogin(true); setError(''); setMsg(''); }}>Вхід</button>
          <button type="button" className={!isLogin ? '' : 'secondary'} style={{ flex: 1 }} onClick={() => { setIsLogin(false); setError(''); setMsg(''); }}>Реєстрація</button>
        </div>

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>ПІБ (Ім'я та Прізвище)</label>
              <input 
                type="text" 
                value={fullName} 
                onChange={e => setFullName(e.target.value)} 
                required={!isLogin}
                placeholder="Іван Іваненко"
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
              />
            </div>
          )}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Email</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Пароль</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }}
              />
            </div>
            
            <button type="submit" disabled={isLoading} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: 'white', fontWeight: 600, fontSize: '15px', cursor: 'pointer' }}>
              {isLoading ? 'Завантаження...' : isLogin ? 'Увійти' : 'Зареєструватись'}
            </button>
          </form>

          {isLogin && (
            <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', textAlign: 'center' }}>Швидко зайти як (Dev):</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button type="button" onClick={() => quickLogin('admin@example.com')} className="secondary" style={{ padding: '8px', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>SUPER_ADMIN</span>
                  <span style={{ color: 'var(--text-secondary)' }}>admin@</span>
                </button>
                <button type="button" onClick={() => quickLogin('center@example.com')} className="secondary" style={{ padding: '8px', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Керівник (Тест)</span>
                  <span style={{ color: 'var(--text-secondary)' }}>center@</span>
                </button>
                <button type="button" onClick={() => quickLogin('dispatcher@example.com')} className="secondary" style={{ padding: '8px', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Диспетчер (Тест)</span>
                  <span style={{ color: 'var(--text-secondary)' }}>dispatcher@</span>
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
