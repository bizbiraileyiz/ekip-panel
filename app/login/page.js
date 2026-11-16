'use client';
import { useState } from 'react';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) window.location.href = '/';
    else {
      setError((await res.json().catch(() => ({}))).error || 'Giriş başarısız');
      setBusy(false);
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>Ekip Paneli</h1>
      <div className="hint">Murat · Claude · ChatGPT</div>
      <input type="password" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      <button className="btn primary" disabled={busy || !password}>Giriş</button>
      {error && <div className="err">{error}</div>}
    </form>
  );
}
