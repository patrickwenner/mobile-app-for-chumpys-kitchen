import { useState, useMemo, useEffect } from "react";
import { useApp } from "./context/AppContext";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Gluten-Free", "Nut-Free", "Dairy-Free", "Halal", "Kosher"];
const GRADES = ["Pre-K", "Kindergarten", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split("T")[0]; }

function isPastCutoff(dateStr) {
  return new Date() >= new Date(dateStr + "T08:00:00");
}

function isBlocked(ds, blockedDays, location) {
  const b = blockedDays?.[ds];
  if (!b) return false;
  return b.locations === "all" || b.locations === location;
}

function formatDate(ds) {
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getWeekDates(offset = 0) {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

function formatDietary(dietary) {
  if (!dietary) return "None";
  if (typeof dietary === "string") return dietary === "None" ? "None" : dietary;
  const parts = [...(dietary.selected || [])];
  if (dietary.otherDetails?.trim()) parts.push("Other: " + dietary.otherDetails.trim());
  return parts.length > 0 ? parts.join(", ") : "None";
}

function groupBlockedDays(blockedDays) {
  const entries = Object.entries(blockedDays || {})
    .map(([date, info]) => ({ date, ...info }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const groups = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    const ePrev = last && new Date(last.endDate + "T12:00:00");
    if (ePrev) ePrev.setDate(ePrev.getDate() + 1);
    const isContiguous = last
      && last.label === e.label
      && last.locations === e.locations
      && ePrev.toISOString().split("T")[0] === e.date;
    if (isContiguous) {
      last.endDate = e.date;
      last.ids.push(e.id);
    } else {
      groups.push({ startDate: e.date, endDate: e.date, label: e.label, locations: e.locations, ids: [e.id] });
    }
  }
  return groups;
}

function hasDietary(dietary) {
  if (!dietary) return false;
  if (typeof dietary === "string") return dietary !== "None";
  return (dietary.selected || []).length > 0 || !!dietary.otherDetails?.trim();
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Poppins:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --primary: #FF6B35; --primary-light: #FF8C5A; --primary-dark: #E5531F;
    --secondary: #2EC4B6; --accent2: #06D6A0; --accent: #FFD166;
    --bg: #FFF8F3; --bg2: #FFF0E6; --surface: #FFFFFF;
    --text: #1A1A2E; --text2: #5A5A7A; --text3: #9898B0; --border: #F0E8E0;
    --danger: #EF476F; --success: #06D6A0; --warning: #FFD166;
    --shadow: 0 2px 16px rgba(255,107,53,0.10); --shadow-lg: 0 8px 40px rgba(255,107,53,0.15);
    --radius: 16px; --radius-sm: 10px;
  }
  html, body, #root { height: 100%; font-family: 'Poppins', sans-serif; background: var(--bg); color: var(--text); }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg2); }
  ::-webkit-scrollbar-thumb { background: var(--primary-light); border-radius: 3px; }
  .app { display: flex; flex-direction: column; min-height: 100vh; }
  .topbar { background: var(--surface); border-bottom: 2px solid var(--border); padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 12px rgba(255,107,53,0.08); }
  .topbar-brand { display: flex; align-items: center; gap: 10px; }
  .topbar-logo { width: 36px; height: 36px; background: var(--primary); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .topbar-title { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 20px; color: var(--primary); letter-spacing: -0.5px; }
  .topbar-title span { color: var(--secondary); }
  .topbar-right { display: flex; align-items: center; gap: 12px; }
  .role-badge { background: var(--primary); color: white; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; }
  .role-badge.school { background: var(--secondary); }
  .role-badge.parent { background: var(--accent2); }
  .main { display: flex; flex: 1; }
  .sidebar { width: 220px; background: var(--surface); border-right: 2px solid var(--border); padding: 20px 12px; display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
  .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: var(--radius-sm); cursor: pointer; font-size: 14px; font-weight: 600; color: var(--text2); transition: all 0.15s; border: none; background: none; width: 100%; text-align: left; }
  .sidebar-item:hover { background: var(--bg2); color: var(--primary); }
  .sidebar-item.active { background: linear-gradient(135deg, var(--primary), var(--primary-light)); color: white; box-shadow: 0 4px 12px rgba(255,107,53,0.3); }
  .sidebar-icon { font-size: 18px; width: 24px; text-align: center; }
  .content { flex: 1; padding: 28px; overflow-y: auto; }
  .page-title { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 28px; color: var(--text); margin-bottom: 4px; }
  .page-subtitle { font-size: 14px; color: var(--text2); margin-bottom: 24px; }
  .card { background: var(--surface); border-radius: var(--radius); padding: 24px; box-shadow: var(--shadow); border: 1.5px solid var(--border); }
  .card-title { font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 16px; margin-bottom: 16px; color: var(--text); display: flex; align-items: center; gap: 8px; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: var(--surface); border-radius: var(--radius); padding: 20px; border: 1.5px solid var(--border); box-shadow: var(--shadow); }
  .stat-value { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 36px; color: var(--primary); line-height: 1; }
  .stat-label { font-size: 12px; color: var(--text2); font-weight: 600; margin-top: 4px; }
  .stat-card.teal .stat-value { color: var(--secondary); }
  .stat-card.gold .stat-value { color: #D4A017; }
  .stat-card.green .stat-value { color: var(--accent2); }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; font-family: 'Poppins', sans-serif; }
  .btn-primary { background: var(--primary); color: white; box-shadow: 0 4px 12px rgba(255,107,53,0.3); }
  .btn-primary:hover { background: var(--primary-dark); transform: translateY(-1px); }
  .btn-secondary { background: var(--secondary); color: white; box-shadow: 0 4px 12px rgba(46,196,182,0.3); }
  .btn-secondary:hover { background: #25A99F; transform: translateY(-1px); }
  .btn-ghost { background: var(--bg2); color: var(--text); }
  .btn-ghost:hover { background: var(--border); }
  .btn-danger { background: var(--danger); color: white; }
  .btn-danger:hover { background: #D63559; }
  .btn-sm { padding: 6px 12px; font-size: 12px; }
  .btn-xs { padding: 4px 8px; font-size: 11px; border-radius: 6px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
  .form-group { margin-bottom: 16px; }
  .form-label { display: block; font-size: 12px; font-weight: 700; color: var(--text2); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .form-input { width: 100%; padding: 10px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); font-size: 14px; font-family: 'Poppins', sans-serif; background: var(--bg); color: var(--text); transition: border-color 0.15s; outline: none; }
  .form-input:focus { border-color: var(--primary); background: var(--surface); }
  .form-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239898B0' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .table-wrap { overflow-x: auto; border-radius: var(--radius-sm); border: 1.5px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { background: var(--bg2); padding: 12px 14px; text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text2); border-bottom: 1.5px solid var(--border); }
  tbody td { padding: 12px 14px; border-bottom: 1px solid var(--border); color: var(--text); }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: var(--bg); }
  .tag { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
  .tag-orange { background: #FFF0E6; color: var(--primary); }
  .tag-teal { background: #E6FAF8; color: var(--secondary); }
  .tag-green { background: #E6FAF5; color: var(--accent2); }
  .tag-gold { background: #FFF8E1; color: #C8960A; }
  .tag-gray { background: var(--bg2); color: var(--text2); }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
  .cal-header { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 8px; }
  .cal-day-label { text-align: center; font-size: 11px; font-weight: 800; color: var(--text2); text-transform: uppercase; letter-spacing: 0.5px; padding: 4px; }
  .cal-cell { border-radius: var(--radius-sm); border: 1.5px solid var(--border); padding: 8px; min-height: 100px; background: var(--surface); transition: all 0.15s; }
  .cal-cell.clickable { cursor: pointer; }
  .cal-cell.clickable:hover { border-color: var(--primary); box-shadow: 0 2px 8px rgba(255,107,53,0.15); }
  .cal-cell.today { border-color: var(--primary); background: #FFF5F0; }
  .cal-cell.has-order { background: linear-gradient(135deg, #E6FAF8, #F0FFF8); border-color: var(--secondary); }
  .cal-cell.past { opacity: 0.5; }
  .cal-cell.weekend { background: var(--bg2); }
  .cal-date { font-size: 12px; font-weight: 700; color: var(--text2); margin-bottom: 4px; }
  .cal-cell.today .cal-date { color: var(--primary); }
  .cal-items { font-size: 10px; color: var(--text); line-height: 1.6; }
  .cal-drink { font-size: 10px; color: var(--secondary); font-weight: 600; margin-top: 3px; }
  .cal-ordered { font-size: 10px; background: var(--secondary); color: white; padding: 2px 7px; border-radius: 20px; font-weight: 700; display: inline-block; margin-top: 4px; }
  .menu-item-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .menu-item-row:last-child { border-bottom: none; }
  .item-pick { border: 2px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px; cursor: pointer; transition: all 0.15s; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; }
  .item-pick:hover { border-color: var(--primary); background: #FFF5F0; }
  .item-pick.selected { border-color: var(--secondary); background: #E6FAF8; }
  .item-pick-radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border); flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: all 0.15s; background: white; }
  .item-pick.selected .item-pick-radio { background: var(--secondary); border-color: var(--secondary); }
  .item-pick-inner { width: 8px; height: 8px; border-radius: 50%; background: white; }
  .item-pick-name { font-weight: 600; font-size: 14px; color: var(--text); }
  .repeat-section { background: #F0FFF8; border: 2px solid var(--accent2); border-radius: var(--radius-sm); padding: 16px; margin-top: 16px; }
  .repeat-title { font-weight: 700; font-size: 14px; color: #059669; margin-bottom: 8px; }
  .day-chip { display: inline-flex; align-items: center; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border); background: var(--surface); color: var(--text2); transition: all 0.15s; margin: 3px; }
  .day-chip.selected { background: var(--primary); color: white; border-color: var(--primary); }
  .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #FFF8F3 0%, #FFF0E6 50%, #E6FAF8 100%); }
  .login-card { background: var(--surface); border-radius: 24px; padding: 40px; width: 100%; max-width: 420px; box-shadow: var(--shadow-lg); border: 1.5px solid var(--border); }
  .login-logo { text-align: center; margin-bottom: 28px; }
  .login-logo-icon { width: 64px; height: 64px; background: var(--primary); border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 12px; }
  .login-title { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 28px; color: var(--text); text-align: center; }
  .login-subtitle { font-size: 13px; color: var(--text2); text-align: center; margin-top: 4px; }
  .login-tabs { display: flex; background: var(--bg2); border-radius: var(--radius-sm); padding: 4px; margin-bottom: 24px; }
  .login-tab { flex: 1; padding: 8px; text-align: center; font-size: 13px; font-weight: 600; color: var(--text2); border-radius: 8px; cursor: pointer; transition: all 0.15s; border: none; background: none; }
  .login-tab.active { background: var(--surface); color: var(--primary); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .login-error { background: #FDEEF3; border: 1px solid #F5B8C9; border-radius: var(--radius-sm); padding: 10px 14px; font-size: 13px; color: var(--danger); margin-bottom: 16px; }
  .register-link { text-align: center; font-size: 13px; color: var(--text2); margin-top: 16px; }
  .register-link span { color: var(--primary); font-weight: 600; cursor: pointer; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px); }
  .modal { background: var(--surface); border-radius: 20px; padding: 28px; max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: var(--shadow-lg); }
  .modal-title { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 22px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; }
  .modal-close { background: var(--bg2); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 18px; color: var(--text2); display: flex; align-items: center; justify-content: center; }
  .divider { height: 1px; background: var(--border); margin: 16px 0; }
  .flex-between { display: flex; align-items: center; justify-content: space-between; }
  .flex-gap { display: flex; align-items: center; gap: 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .week-nav { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .cutoff-notice { background: #FFF8E1; border: 1px solid var(--warning); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 13px; color: #7A6000; font-weight: 500; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .success-banner { background: var(--success); color: white; padding: 10px 16px; border-radius: 10px; margin-bottom: 16px; font-weight: 600; }
  .empty-state { text-align: center; padding: 48px 24px; color: var(--text2); }
  .empty-icon { font-size: 48px; margin-bottom: 12px; }
  .empty-text { font-size: 15px; font-weight: 600; }
  .empty-sub { font-size: 13px; margin-top: 4px; }
  .child-card { background: var(--bg); border: 1.5px solid var(--border); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 12px; }
  .notification-item { padding: 12px 0; border-bottom: 1px solid var(--border); }
  .notification-item:last-child { border-bottom: none; }
  .notification-time { font-size: 11px; color: var(--text3); margin-top: 2px; }
  .print-header { display: none; }
  .loading-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; background: linear-gradient(135deg, #FFF8F3 0%, #FFF0E6 50%, #E6FAF8 100%); }
  .loading-spinner { width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media print {
    .topbar, .sidebar, .no-print { display: none !important; }
    .content { padding: 0; }
    .card { box-shadow: none; border: 1px solid #ddd; }
    .print-header { display: block; margin-bottom: 16px; }
  }
`;

export default function App() {
  const { session, profile, loading, actions } = useApp();
  const [activePage, setActivePage] = useState("dashboard");

  if (loading) {
    return (
      <>
        <style>{css}</style>
        <div className="loading-screen">
          <div className="loading-spinner" />
          <div style={{ fontFamily: "'Nunito',sans-serif", fontWeight: 800, color: "var(--text2)" }}>Loading Lunchbox…</div>
        </div>
      </>
    );
  }

  if (!session || !profile) {
    return <><style>{css}</style><LoginScreen /></>;
  }

  const role = profile.role;

  return (
    <><style>{css}</style>
    <div className="app">
      <TopBar role={role} name={profile.name} onLogout={() => actions.signOut()} />
      <div className="main">
        <Sidebar role={role} activePage={activePage} setActivePage={setActivePage} />
        <div className="content">
          {role === "superadmin" && <SuperAdminPages page={activePage} />}
          {role === "schooladmin" && <SchoolAdminPages page={activePage} />}
          {role === "parent" && <ParentPages page={activePage} />}
        </div>
      </div>
    </div></>
  );
}

function LoginScreen() {
  const { actions } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const handleLogin = async () => {
    setError("");
    if (!email || !password) return setError("Please enter your email and password.");
    setSubmitting(true);
    try { await actions.signIn(email, password); }
    catch (err) { setError(err.message || "Invalid credentials."); }
    finally { setSubmitting(false); }
  };

  if (showRegister) return <RegisterScreen onBack={() => setShowRegister(false)} />;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">🍱</div>
          <div className="login-title">Lunchbox</div>
          <div className="login-subtitle">by Chumpys Kitchen</div>
        </div>
        {error && <div className="login-error">⚠️ {error}</div>}
        <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
        <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleLogin} disabled={submitting}>
          {submitting ? "Signing in…" : "Sign In →"}
        </button>
        <div className="register-link">New parent? <span onClick={() => setShowRegister(true)}>Create an account</span></div>
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--text3)", marginTop: 12 }}>
          Same login for parents, school admins, and super admins.
        </div>
      </div>
    </div>
  );
}

function RegisterScreen({ onBack }) {
  const { actions, locations } = useApp();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", location: locations[0] || "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    setError("");
    if (!form.name || !form.email || !form.password) return setError("Please fill all required fields.");
    if (!form.phone || !form.phone.trim()) return setError("A contact phone number is required.");
    if (!form.location) return setError("Please choose a location.");
    setSubmitting(true);
    try { await actions.registerParent(form); }
    catch (err) { setError(err.message || "Registration failed."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo"><div className="login-logo-icon">🍱</div><div className="login-title">Create Account</div></div>
        {error && <div className="login-error">⚠️ {error}</div>}
        <div className="form-row">
          <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={form.name} onChange={e => f("name", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Phone *</label><input className="form-input" type="tel" value={form.phone} onChange={e => f("phone", e.target.value)} placeholder="555-123-4567" /></div>
        </div>
        <div className="form-group"><label className="form-label">Email *</label><input className="form-input" type="email" value={form.email} onChange={e => f("email", e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Password *</label><input className="form-input" type="password" value={form.password} onChange={e => f("password", e.target.value)} /></div>
        <div className="form-group">
          <label className="form-label">Location *</label>
          <select className="form-input form-select" value={form.location} onChange={e => f("location", e.target.value)}>
            {locations.length === 0 && <option value="">— No locations available —</option>}
            {locations.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit} disabled={submitting}>
          {submitting ? "Creating…" : "Create Account →"}
        </button>
        <div className="register-link"><span onClick={onBack}>← Back to login</span></div>
      </div>
    </div>
  );
}

function TopBar({ role, name, onLogout }) {
  const bc = role === "schooladmin" ? "school" : role === "parent" ? "parent" : "";
  const rl = role === "superadmin" ? "Super Admin" : role === "schooladmin" ? "School Admin" : "Parent";
  return (
    <div className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">🍱</div>
        <div>
          <div className="topbar-title">Lunch<span>box</span></div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text2)", letterSpacing: "0.3px", marginTop: -2 }}>by Chumpys Kitchen</div>
        </div>
      </div>
      <div className="topbar-right">
        <span className={`role-badge ${bc}`}>{rl}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text2)" }}>{name}</span>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign Out</button>
      </div>
    </div>
  );
}

function Sidebar({ role, activePage, setActivePage }) {
  const items = role === "superadmin"
    ? [{ id: "dashboard", icon: "📊", label: "Dashboard" }, { id: "menu", icon: "🍽️", label: "Menu Editor" }, { id: "orders", icon: "📋", label: "All Orders" }, { id: "parents", icon: "👨‍👩‍👧", label: "Parents" }, { id: "students", icon: "🎒", label: "Students" }, { id: "reports", icon: "📈", label: "Reports" }, { id: "holidays", icon: "🚫", label: "Blocked Days" }, { id: "locations", icon: "🏫", label: "Locations" }, { id: "drinks", icon: "🥤", label: "Drinks" }, { id: "notifications", icon: "🔔", label: "Notifications" }]
    : role === "schooladmin"
    ? [{ id: "dashboard", icon: "📊", label: "Today's Orders" }, { id: "weekly", icon: "📅", label: "Weekly View" }, { id: "students", icon: "🎒", label: "My Students" }, { id: "reports", icon: "📈", label: "Reports" }, { id: "holidays", icon: "🚫", label: "Blocked Days" }]
    : [{ id: "dashboard", icon: "🏠", label: "Home" }, { id: "order", icon: "📅", label: "Order Lunches" }, { id: "myorders", icon: "📋", label: "My Orders" }, { id: "profile", icon: "👤", label: "My Profile" }, { id: "children", icon: "🎒", label: "My Children" }];
  return (
    <div className="sidebar">
      {items.map(item => (
        <button key={item.id} className={`sidebar-item${activePage === item.id ? " active" : ""}`} onClick={() => setActivePage(item.id)}>
          <span className="sidebar-icon">{item.icon}</span><span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function SuperAdminPages({ page }) {
  const map = {
    dashboard: <SADashboard />,
    menu: <SAMenuEditor />,
    orders: <SAOrders />,
    parents: <SAParents />,
    students: <SAStudents />,
    reports: <SAReports />,
    holidays: <SAHolidays />,
    locations: <SALocations />,
    drinks: <SADrinks />,
    notifications: <SANotifications />,
  };
  return map[page] || map.dashboard;
}

function SADashboard() {
  const { menu, orders, parents, locations } = useApp();
  const today = todayStr();
  const todayOrders = orders.filter(o => o.date === today);
  const totalStudents = parents.reduce((s, p) => s + (p.children?.length || 0), 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthRev = orders.filter(o => o.date?.startsWith(thisMonth)).reduce((s, o) => s + (o.price || 0), 0);
  return (
    <div>
      <div className="page-title">Dashboard</div>
      <div className="page-subtitle">Welcome back! Here's what's happening today.</div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{todayOrders.length}</div><div className="stat-label">Orders Today</div></div>
        <div className="stat-card teal"><div className="stat-value">{parents.length}</div><div className="stat-label">Parents</div></div>
        <div className="stat-card gold"><div className="stat-value">{totalStudents}</div><div className="stat-label">Students</div></div>
        <div className="stat-card green"><div className="stat-value">${monthRev.toFixed(0)}</div><div className="stat-label">Month Revenue</div></div>
      </div>
      <div className="grid2">
        <div className="card">
          <div className="card-title">📋 Today by Location</div>
          {locations.map(loc => {
            const lo = todayOrders.filter(o => o.location === loc);
            return (
              <div key={loc} style={{ marginBottom: 12 }}>
                <div className="flex-between" style={{ marginBottom: 6 }}><span style={{ fontWeight: 600, fontSize: 14 }}>{loc}</span><span className="tag tag-orange">{lo.length}</span></div>
                {lo.slice(0, 4).map(o => (
                  <div key={o.id} style={{ fontSize: 12, color: "var(--text2)", padding: "3px 0", borderBottom: "1px solid var(--border)" }}>{o.childName} — {o.mainItem}</div>
                ))}
              </div>
            );
          })}
        </div>
        <div className="card">
          <div className="card-title">🍽️ Today's Menu</div>
          {menu[today]?.items?.map((it, i) => (
            <div key={i} className="menu-item-row"><span style={{ fontWeight: 600 }}>{it.name}</span><span style={{ fontWeight: 700, color: "var(--primary)" }}>${it.price?.toFixed(2)}</span></div>
          )) || <div style={{ color: "var(--text3)" }}>No menu set</div>}
        </div>
      </div>
    </div>
  );
}

function SAMenuEditor() {
  const { menu, blockedDays, drinks, actions } = useApp();
  const [weekOffset, setWeekOffset] = useState(0);
  const [editDay, setEditDay] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [rotationOpen, setRotationOpen] = useState(false);
  const [rotationWeeks, setRotationWeeks] = useState(12);
  const [rotationBusy, setRotationBusy] = useState(false);
  const [rotationError, setRotationError] = useState("");

  const weekDates = getWeekDates(weekOffset);
  const today = todayStr();
  const week2Dates = getWeekDates(weekOffset + 1);

  const drinksDescription = drinks.length === 0
    ? "Parents will pick a drink when they place an order."
    : `Parents will pick a drink (${drinks.map(d => d.name).join(", ")}) when they place an order.`;

  const applyRotation = async () => {
    setRotationError("");
    if (!rotationWeeks || rotationWeeks < 1) return setRotationError("Enter a number of weeks (1 or more).");
    setRotationBusy(true);
    try {
      const sourceStart = weekDates[0];
      const targetStartDate = new Date(sourceStart + "T12:00:00");
      targetStartDate.setDate(targetStartDate.getDate() + 14);
      const targetStart = targetStartDate.toISOString().split("T")[0];
      const written = await actions.applyMenuRotation(sourceStart, targetStart, Number(rotationWeeks));
      setRotationOpen(false);
      setSaved(`✓ Pattern applied to ${written} weekday${written === 1 ? "" : "s"}!`);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { setRotationError(err.message || "Failed to apply pattern."); }
    finally { setRotationBusy(false); }
  };

  const openEdit = (ds) => {
    setEditItems((menu[ds]?.items || []).map(i => ({ ...i })));
    setEditDay(ds);
    setError("");
  };
  const updateItem = (idx, key, val) => setEditItems(items => items.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  const addItem = () => setEditItems(items => [...items, { id: "ni" + Date.now(), name: "", price: "" }]);
  const removeItem = (idx) => setEditItems(items => items.filter((_, i) => i !== idx));
  const saveEdit = async () => {
    const cleaned = editItems.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), price: parseFloat(i.price) || 0 }));
    setBusy(true); setError("");
    try {
      await actions.saveMenu(editDay, cleaned);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditDay(null);
    } catch (err) { setError(err.message || "Failed to save menu."); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-title">🍽️ Menu Editor</div>
      <div className="page-subtitle">Add multiple food options per day. Click any school day to edit.</div>
      {saved && <div className="success-banner">{typeof saved === "string" ? saved : "✓ Menu saved & parents notified!"}</div>}
      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w - 1)}>← Prev</button>
        <span style={{ fontWeight: 700 }}>{formatDate(weekDates[0])} – {formatDate(weekDates[6])}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w + 1)}>Next →</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>This Week</button>
        <button className="btn btn-secondary btn-sm" onClick={() => { setRotationError(""); setRotationOpen(true); }}>🔁 Repeat 2-Week Pattern…</button>
      </div>
      <div className="cal-header">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <div key={d} className="cal-day-label">{d}</div>)}</div>
      <div className="cal-grid">
        {weekDates.map(ds => {
          const isWknd = [0, 6].includes(new Date(ds + "T12:00:00").getDay());
          const m = menu[ds];
          const isPast = ds < today;
          const blocked = Object.keys(blockedDays || {}).includes(ds);
          const blockInfo = blockedDays?.[ds];
          return (
            <div key={ds} className={`cal-cell${ds === today ? " today" : ""}${isWknd ? " weekend" : ""}${blocked ? " weekend" : ""}${isPast ? " past" : ""}${!isWknd && !blocked && !isPast ? " clickable" : ""}`}
              onClick={() => !isWknd && !blocked && !isPast && openEdit(ds)}>
              <div className="cal-date">{new Date(ds + "T12:00:00").getDate()}</div>
              {isWknd ? <div style={{ fontSize: 11, color: "var(--text3)" }}>Weekend</div>
                : blocked ? <div style={{ fontSize: 10, color: "var(--danger)", fontWeight: 700 }}>🚫 {blockInfo?.label || "No School"}<br /><span style={{ fontSize: 9, color: "var(--text3)", fontWeight: 400 }}>{blockInfo?.locations === "all" ? "All locations" : blockInfo?.locations?.split(" ")[0]}</span></div>
                : m?.items?.length > 0 ? (
                  <><div className="cal-items">{m.items.map((it, i) => <div key={i}>• {it.name}</div>)}</div>
                    {!isPast && <div style={{ fontSize: 9, color: "var(--accent2)", fontWeight: 700, marginTop: 4 }}>✏️ Edit</div>}</>
                ) : <div style={{ fontSize: 11, color: "var(--text3)" }}>{isPast ? "No data" : "+ Add items"}</div>}
            </div>
          );
        })}
      </div>
      {editDay && (
        <div className="modal-overlay" onClick={() => !busy && setEditDay(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Edit Menu — {formatDate(editDay)} <button className="modal-close" onClick={() => !busy && setEditDay(null)}>×</button></div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>{drinksDescription} You only manage food items here.</div>
            {error && <div className="login-error">⚠️ {error}</div>}
            {editItems.map((item, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <input className="form-input" value={item.name} onChange={e => updateItem(idx, "name", e.target.value)} placeholder="Food item name" style={{ flex: 2 }} />
                <input className="form-input" type="number" step="0.25" value={item.price} onChange={e => updateItem(idx, "price", e.target.value)} placeholder="Price $" style={{ flex: "0 0 85px" }} />
                <button className="btn btn-danger btn-xs" onClick={() => removeItem(idx)}>✕</button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={addItem}>+ Add Item</button>
            <div style={{ background: "#FFF8E1", padding: "10px 14px", borderRadius: 8, fontSize: 12, color: "#7A6000", marginBottom: 16 }}>⚠️ Saving will notify all parents of the menu change.</div>
            <div className="flex-gap">
              <button className="btn btn-primary" onClick={saveEdit} disabled={busy}>{busy ? "Saving…" : "Save & Notify Parents"}</button>
              <button className="btn btn-ghost" onClick={() => setEditDay(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {rotationOpen && (
        <div className="modal-overlay" onClick={() => !rotationBusy && setRotationOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🔁 Repeat 2-Week Pattern <button className="modal-close" onClick={() => !rotationBusy && setRotationOpen(false)}>×</button></div>
            {rotationError && <div className="login-error">⚠️ {rotationError}</div>}
            <div style={{ fontSize: 14, color: "var(--text)", marginBottom: 12, lineHeight: 1.5 }}>
              I'll use the menu you've set for{" "}
              <b>{formatDate(weekDates[0])} – {formatDate(weekDates[4])}</b> and{" "}
              <b>{formatDate(week2Dates[0])} – {formatDate(week2Dates[4])}</b>{" "}
              as a 2-week pattern.
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16, lineHeight: 1.5 }}>
              Make sure those two weeks have the menu you want to repeat — navigate with the Prev/Next buttons first if needed, then come back here.
            </div>
            <div className="form-group">
              <label className="form-label">Apply this pattern for the next:</label>
              <div className="flex-gap">
                <input className="form-input" type="number" min="1" max="52" value={rotationWeeks} onChange={e => setRotationWeeks(e.target.value)} style={{ width: 90 }} />
                <span style={{ fontWeight: 600 }}>weeks</span>
              </div>
            </div>
            <div style={{ background: "#FFF8E1", padding: "10px 14px", borderRadius: 8, fontSize: 12, color: "#7A6000", marginBottom: 16, lineHeight: 1.5 }}>
              ⚠️ This will <b>overwrite</b> any existing menu on those weekdays. Weekends and all-locations blocked days are skipped automatically. Parents are <b>not</b> emailed for these bulk updates.
            </div>
            <div className="flex-gap">
              <button className="btn btn-primary" onClick={applyRotation} disabled={rotationBusy}>{rotationBusy ? "Applying…" : "Apply Pattern"}</button>
              <button className="btn btn-ghost" onClick={() => setRotationOpen(false)} disabled={rotationBusy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function SAOrders() {
  const { orders, locations, actions } = useApp();
  const [filterDate, setFilterDate] = useState(todayStr());
  const [filterLoc, setFilterLoc] = useState("All");
  const filtered = orders.filter(o => (!filterDate || o.date === filterDate) && (filterLoc === "All" || o.location === filterLoc));
  const del = async (id) => {
    if (!confirm("Delete this order? This is normally only done before the 8AM cutoff.")) return;
    try { await actions.cancelOrder(id); }
    catch (err) { alert(err.message || "Failed to delete."); }
  };
  return (
    <div>
      <div className="page-title">📋 All Orders</div>
      <div className="page-subtitle">View and manage all lunch orders.</div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="flex-gap" style={{ flexWrap: "wrap" }}>
          <div><label className="form-label">Date</label><input type="date" className="form-input" style={{ width: 160 }} value={filterDate} onChange={e => setFilterDate(e.target.value)} /></div>
          <div><label className="form-label">Location</label>
            <select className="form-input form-select" style={{ width: 200 }} value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
              <option>All</option>{locations.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 22 }} onClick={() => { setFilterDate(""); setFilterLoc("All"); }}>Clear</button>
        </div>
      </div>
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>Orders ({filtered.length})</div>
          <span className="tag tag-orange">${filtered.reduce((s, o) => s + (o.price || 0), 0).toFixed(2)}</span>
        </div>
        {filtered.length === 0 ? <div className="empty-state"><div className="empty-icon">📭</div><div className="empty-text">No orders found</div></div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Student</th><th>Parent</th><th>Location</th><th>Food</th><th>Drink</th><th>Price</th><th></th></tr></thead>
            <tbody>{filtered.map(o => (
              <tr key={o.id}>
                <td>{formatDate(o.date)}</td>
                <td><span style={{ fontWeight: 600 }}>{o.childName}</span><br /><span style={{ fontSize: 11, color: "var(--text3)" }}>{o.childGrade}</span></td>
                <td>{o.parentName}</td>
                <td><span className="tag tag-teal" style={{ fontSize: 10 }}>{o.location?.split(" ")[0]}</span></td>
                <td>{o.mainItem}</td><td>{o.drink}</td>
                <td style={{ fontWeight: 700, color: "var(--primary)" }}>${(o.price || 0).toFixed(2)}</td>
                <td><button className="btn btn-danger btn-xs" onClick={() => del(o.id)}>Delete</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function SAParents() {
  const { parents, orders, actions } = useApp();
  const [view, setView] = useState(null);
  const del = async (id) => {
    if (!confirm("Delete this parent and all their data?")) return;
    try { await actions.deleteParent(id); }
    catch (err) { alert(err.message || "Failed to delete."); }
  };
  return (
    <div>
      <div className="page-title">👨‍👩‍👧 Parents</div>
      <div className="page-subtitle">All registered parent accounts.</div>
      <div className="card">
        {parents.length === 0 ? <div className="empty-state"><div className="empty-icon">📭</div><div className="empty-text">No parents yet</div></div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Location</th><th>Children</th><th>Orders</th><th></th></tr></thead>
            <tbody>{parents.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td><span className="tag tag-teal" style={{ fontSize: 10 }}>{p.location?.split(" ")[0]}</span></td>
                <td>{p.children?.length || 0}</td>
                <td>{orders.filter(o => o.parentId === p.id).length}</td>
                <td><button className="btn btn-ghost btn-xs" onClick={() => setView(p)} style={{ marginRight: 6 }}>View</button><button className="btn btn-danger btn-xs" onClick={() => del(p.id)}>Delete</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {view && (
        <div className="modal-overlay" onClick={() => setView(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{view.name}<button className="modal-close" onClick={() => setView(null)}>×</button></div>
            <div className="grid2">
              <div><b>Phone</b><br /><span style={{ fontSize: 13 }}>{view.phone || "N/A"}</span></div>
              <div><b>Location</b><br /><span style={{ fontSize: 13 }}>{view.location}</span></div>
            </div>
            <div className="divider" />
            <b>Children</b>
            {(view.children || []).map(c => <div key={c.id} className="child-card" style={{ marginTop: 8 }}><b>{c.name}</b><div style={{ fontSize: 12, color: "var(--text2)" }}>{c.grade} • {formatDietary(c.dietary)}</div></div>)}
            {(!view.children || view.children.length === 0) && <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 8 }}>No children added.</div>}
            <div className="divider" />
            <b>Recent Orders</b>
            {orders.filter(o => o.parentId === view.id).slice(-5).map(o => (
              <div key={o.id} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                <span>{formatDate(o.date)} — {o.childName}</span><span style={{ color: "var(--text2)" }}>{o.mainItem} (${(o.price || 0).toFixed(2)})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SAStudents() {
  const { parents, orders, locations } = useApp();
  const all = parents.flatMap(p => (p.children || []).map(c => ({ ...c, parentName: p.name, location: p.location })));
  return (
    <div>
      <div className="page-title">🎒 Students</div>
      <div className="page-subtitle">All enrolled students across locations.</div>
      <div className="stats-grid">
        {locations.map(loc => {
          const n = parents.filter(p => p.location === loc).reduce((s, p) => s + (p.children?.length || 0), 0);
          return <div key={loc} className="stat-card"><div className="stat-value">{n}</div><div className="stat-label">{loc.split(" ")[0]}</div></div>;
        })}
      </div>
      <div className="card">
        {all.length === 0 ? <div className="empty-state"><div className="empty-icon">🎒</div><div className="empty-text">No students yet</div></div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Student</th><th>Grade</th><th>Dietary</th><th>Parent</th><th>Location</th><th>Orders</th></tr></thead>
            <tbody>{all.map(c => (
              <tr key={c.id}><td style={{ fontWeight: 600 }}>{c.name}</td><td>{c.grade}</td>
                <td>{hasDietary(c.dietary) ? <span className="tag tag-gold" style={{ maxWidth: 180, whiteSpace: "normal" }}>{formatDietary(c.dietary)}</span> : "—"}</td>
                <td>{c.parentName}</td><td><span className="tag tag-teal" style={{ fontSize: 10 }}>{c.location?.split(" ")[0]}</span></td>
                <td>{orders.filter(o => o.childId === c.id).length}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function ReportTabs({ tab, setTab }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--bg2)", borderRadius: "var(--radius-sm)", padding: 4, marginBottom: 24, width: "fit-content" }}>
      {["daily", "weekly", "monthly"].map(t => (
        <button key={t} onClick={() => setTab(t)} style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, transition: "all 0.15s", background: tab === t ? "var(--surface)" : "transparent", color: tab === t ? "var(--primary)" : "var(--text2)", boxShadow: tab === t ? "0 2px 8px rgba(0,0,0,0.08)" : "none" }}>
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}

function ReportPanel({ orders, parents, locations, scopedToLocation = null }) {
  const [tab, setTab] = useState("daily");
  const [filterLoc, setFilterLoc] = useState(scopedToLocation || "All");
  const today = todayStr();
  const thisWeek = getWeekDates(0).filter(d => ![0, 6].includes(new Date(d + "T12:00:00").getDay()));
  const thisMonth = new Date().toISOString().slice(0, 7);

  const locFilter = (list) => filterLoc === "All" ? list : list.filter(o => o.location === filterLoc);

  const OrderTable = ({ rows, showDate = false }) => (
    rows.length === 0
      ? <div className="empty-state" style={{ padding: "24px" }}><div className="empty-icon" style={{ fontSize: 32 }}>📭</div><div className="empty-text">No orders</div></div>
      : <div className="table-wrap"><table>
        <thead><tr>{showDate && <th>Date</th>}<th>Student</th><th>Location</th><th>Food</th><th>Drink</th><th>Price</th></tr></thead>
        <tbody>{rows.map(o => (
          <tr key={o.id}>
            {showDate && <td>{formatDate(o.date)}</td>}
            <td style={{ fontWeight: 600 }}>{o.childName}<br /><span style={{ fontSize: 11, color: "var(--text3)" }}>{o.childGrade}</span></td>
            <td><span className="tag tag-teal" style={{ fontSize: 10 }}>{o.location?.split(" ")[0]}</span></td>
            <td>{o.mainItem}</td><td>{o.drink}</td>
            <td style={{ fontWeight: 700, color: "var(--primary)" }}>${(o.price || 0).toFixed(2)}</td>
          </tr>
        ))}</tbody>
      </table></div>
  );

  const SummaryBar = ({ rows }) => {
    const rev = rows.reduce((s, o) => s + (o.price || 0), 0);
    return (
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-value">{rows.length}</div><div className="stat-label">Orders</div></div>
        <div className="stat-card teal"><div className="stat-value">${rev.toFixed(2)}</div><div className="stat-label">Revenue</div></div>
        {locations.map(loc => {
          const n = rows.filter(o => o.location === loc).length;
          return <div key={loc} className="stat-card gold"><div className="stat-value">{n}</div><div className="stat-label">{loc.split(" ")[0]}</div></div>;
        })}
      </div>
    );
  };

  return (
    <div>
      <div className="page-title">📈 Reports</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 4, flexWrap: "wrap" }}>
        <ReportTabs tab={tab} setTab={setTab} />
        {!scopedToLocation && (
          <div style={{ marginBottom: 20 }}>
            <select className="form-input form-select" style={{ width: 200 }} value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
              <option>All</option>{locations.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        )}
      </div>

      {tab === "daily" && (() => {
        const rows = locFilter(orders.filter(o => o.date === today));
        return (<>
          <div className="page-subtitle">Orders for {formatDate(today)}</div>
          <SummaryBar rows={rows} />
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">📋 Today's Order Detail</div>
            <OrderTable rows={rows} />
          </div>
          <div className="card">
            <div className="card-title">🍽️ Item Breakdown</div>
            {Object.entries(rows.reduce((a, o) => { a[o.mainItem] = (a[o.mainItem] || 0) + 1; return a; }, {})).map(([item, n]) => (
              <div key={item} className="menu-item-row"><span style={{ fontWeight: 600 }}>{item}</span><span className="tag tag-orange">{n} order{n !== 1 ? "s" : ""}</span></div>
            ))}
            {rows.length === 0 && <div style={{ fontSize: 13, color: "var(--text3)" }}>No orders today.</div>}
          </div>
        </>);
      })()}

      {tab === "weekly" && (() => {
        const rows = locFilter(orders.filter(o => thisWeek.includes(o.date)));
        return (<>
          <div className="page-subtitle">Orders for {formatDate(thisWeek[0])} – {formatDate(thisWeek[4])}</div>
          <SummaryBar rows={rows} />
          {thisWeek.map(ds => {
            const dayOrders = locFilter(orders.filter(o => o.date === ds));
            return (<div key={ds} className="card" style={{ marginBottom: 12 }}>
              <div className="flex-between" style={{ marginBottom: 10 }}>
                <div className="card-title" style={{ margin: 0 }}>{formatDate(ds)}</div>
                <div className="flex-gap">
                  <span className="tag tag-orange">{dayOrders.length} orders</span>
                  <span className="tag tag-green">${dayOrders.reduce((s, o) => s + (o.price || 0), 0).toFixed(2)}</span>
                </div>
              </div>
              <OrderTable rows={dayOrders} />
            </div>);
          })}
        </>);
      })()}

      {tab === "monthly" && (() => {
        const rows = locFilter(orders.filter(o => o.date?.startsWith(thisMonth)));
        const months = {};
        locFilter(orders).forEach(o => { const m = o.date?.slice(0, 7); if (!m) return; if (!months[m]) months[m] = { orders: 0, revenue: 0 }; months[m].orders++; months[m].revenue += o.price || 0; });
        return (<>
          <div className="page-subtitle">{new Date(thisMonth + "-15").toLocaleDateString("en-US", { month: "long", year: "numeric" })} summary</div>
          <SummaryBar rows={rows} />
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">📅 Month History</div>
            <div className="table-wrap"><table>
              <thead><tr><th>Month</th><th>Orders</th><th>Revenue</th><th>Avg/Order</th></tr></thead>
              <tbody>{Object.entries(months).sort((a, b) => b[0].localeCompare(a[0])).map(([m, d]) => (
                <tr key={m}><td style={{ fontWeight: 600 }}>{new Date(m + "-15").toLocaleDateString("en-US", { month: "long", year: "numeric" })}</td><td>{d.orders}</td><td style={{ fontWeight: 700, color: "var(--primary)" }}>${d.revenue.toFixed(2)}</td><td>${(d.revenue / d.orders || 0).toFixed(2)}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
          {parents && parents.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">💰 Parent Invoice — {new Date(thisMonth + "-15").toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
              <div className="table-wrap"><table>
                <thead><tr><th>Parent</th><th>Location</th><th>Orders</th><th>Amount Due</th></tr></thead>
                <tbody>{parents.map(p => {
                  const po = locFilter(orders.filter(o => o.parentId === p.id && o.date?.startsWith(thisMonth)));
                  return <tr key={p.id}><td style={{ fontWeight: 600 }}>{p.name}</td><td><span className="tag tag-teal" style={{ fontSize: 10 }}>{p.location?.split(" ")[0]}</span></td><td>{po.length}</td><td style={{ fontWeight: 700, color: "var(--primary)" }}>${po.reduce((s, o) => s + (o.price || 0), 0).toFixed(2)}</td></tr>;
                })}</tbody>
              </table></div>
            </div>
          )}
          <div className="card">
            <div className="card-title">🍽️ Top Items This Month</div>
            {Object.entries(rows.reduce((a, o) => { a[o.mainItem] = (a[o.mainItem] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).map(([item, n]) => (
              <div key={item} className="menu-item-row"><span style={{ fontWeight: 600 }}>{item}</span><span className="tag tag-orange">{n}</span></div>
            ))}
            {rows.length === 0 && <div style={{ fontSize: 13, color: "var(--text3)" }}>No orders this month.</div>}
          </div>
        </>);
      })()}
    </div>
  );
}

function SAReports() {
  const { orders, parents, locations } = useApp();
  return <ReportPanel orders={orders} parents={parents} locations={locations} />;
}

function SAHolidays() {
  const { blockedDays, locations, actions } = useApp();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [label, setLabel] = useState("");
  const [loc, setLoc] = useState("all");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const addDays = async () => {
    setError("");
    if (!startDate || !label) return setError("Please enter a start date and label.");
    if (endDate && endDate < startDate) return setError("End date is before start date.");
    setBusy(true);
    try {
      if (endDate && endDate !== startDate) {
        const n = await actions.addBlockedDayRange({ startDate, endDate, label, location: loc });
        setSaved(`✓ Blocked ${n} day${n === 1 ? "" : "s"}!`);
      } else {
        await actions.addBlockedDay({ date: startDate, label, location: loc });
        setSaved("✓ Day blocked!");
      }
      setLabel(""); setStartDate(""); setEndDate("");
      setTimeout(() => setSaved(false), 2500);
    } catch (err) { setError(err.message || "Failed to block day(s)."); }
    finally { setBusy(false); }
  };

  const removeGroup = async (group) => {
    const isRange = group.ids.length > 1;
    const promptMsg = isRange
      ? `Unblock all ${group.ids.length} days of "${group.label}" (${formatDate(group.startDate)} – ${formatDate(group.endDate)})?`
      : `Unblock ${formatDate(group.startDate)} (${group.label})?`;
    if (!confirm(promptMsg)) return;
    try {
      if (isRange) await actions.removeBlockedDays(group.ids);
      else         await actions.removeBlockedDay(group.ids[0]);
    } catch (err) { alert(err.message || "Failed to remove."); }
  };

  const groups = groupBlockedDays(blockedDays);

  return (
    <div>
      <div className="page-title">🚫 Blocked Days</div>
      <div className="page-subtitle">Block holidays and no-school days. Use the end date for breaks (e.g. Spring Break, Summer Break). Parents cannot order on blocked dates.</div>
      {saved && <div className="success-banner">{saved}</div>}
      {error && <div style={{ background: "#FDEEF3", border: "1px solid #F5B8C9", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 13, color: "var(--danger)", marginBottom: 16 }}>{error}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Add Blocked Day or Range</div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 160px 1fr 180px auto", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Start Date</label><input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">End Date <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text3)" }}>(optional)</span></label><input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate || undefined} /></div>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Label</label><input className="form-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Spring Break, Thanksgiving" /></div>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Applies To</label>
            <select className="form-input form-select" value={loc} onChange={e => setLoc(e.target.value)}>
              <option value="all">All Locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={addDays} style={{ marginBottom: 0 }} disabled={busy}>{busy ? "Saving…" : (endDate && endDate !== startDate ? "Block Range" : "Block Day")}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Blocked ({groups.length} {groups.length === 1 ? "entry" : "entries"})</div>
        {groups.length === 0 ? <div className="empty-state"><div className="empty-icon">📅</div><div className="empty-text">No blocked days</div></div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date(s)</th><th>Label</th><th>Applies To</th><th></th></tr></thead>
            <tbody>{groups.map((g, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>
                  {g.startDate === g.endDate
                    ? formatDate(g.startDate)
                    : <>{formatDate(g.startDate)} – {formatDate(g.endDate)} <span style={{ fontWeight: 400, color: "var(--text3)", fontSize: 11 }}>({g.ids.length} days)</span></>}
                </td>
                <td>{g.label}</td>
                <td>{g.locations === "all" ? <span className="tag tag-orange">All Locations</span> : <span className="tag tag-teal">{g.locations.split(" ")[0]}</span>}</td>
                <td><button className="btn btn-danger btn-xs" onClick={() => removeGroup(g)}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function SALocations() {
  const { locations, parents, orders, actions } = useApp();
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const flash = (msg) => { setSaved(msg); setTimeout(() => setSaved(false), 2000); };

  const addLocation = async () => {
    const trimmed = newName.trim();
    setError("");
    if (!trimmed) return setError("Please enter a location name.");
    if (locations.includes(trimmed)) return setError("That location already exists.");
    setBusy(true);
    try { await actions.addLocation(trimmed); setNewName(""); flash("✓ Location added!"); }
    catch (err) { setError(err.message || "Failed to add."); }
    finally { setBusy(false); }
  };

  const startEdit = (name) => { setEditId(name); setEditName(name); setError(""); };

  const saveEdit = async () => {
    const trimmed = editName.trim();
    setError("");
    if (!trimmed) return;
    if (locations.includes(trimmed) && trimmed !== editId) return setError("That name is already taken.");
    setBusy(true);
    try { await actions.renameLocation(editId, trimmed); setEditId(null); flash("✓ Location renamed!"); }
    catch (err) { setError(err.message || "Failed to rename."); }
    finally { setBusy(false); }
  };

  const removeLocation = async (name) => {
    setError("");
    const inUse = parents.some(p => p.location === name) || orders.some(o => o.location === name);
    if (inUse) return setError(`Cannot delete "${name}" — it has parents or orders assigned to it.`);
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setBusy(true);
    try { await actions.deleteLocation(name); flash("✓ Location deleted."); }
    catch (err) { setError(err.message || "Failed to delete."); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-title">🏫 Locations</div>
      <div className="page-subtitle">Add, rename, or remove service locations.</div>
      {saved && <div className="success-banner">{saved}</div>}
      {error && <div style={{ background: "#FDEEF3", border: "1px solid #F5B8C9", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 13, color: "var(--danger)", marginBottom: 16 }}>{error}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Add New Location</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <label className="form-label">Location Name</label>
            <input className="form-input" value={newName} onChange={e => { setNewName(e.target.value); setError(""); }}
              placeholder="e.g. Maplewood Academy" onKeyDown={e => e.key === "Enter" && addLocation()} />
          </div>
          <button className="btn btn-primary" onClick={addLocation} disabled={busy}>{busy ? "…" : "Add Location"}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">All Locations ({locations.length})</div>
        {locations.length === 0
          ? <div className="empty-state"><div className="empty-icon">🏫</div><div className="empty-text">No locations yet</div></div>
          : locations.map(name => {
            const parentCount = parents.filter(p => p.location === name).length;
            const studentCount = parents.filter(p => p.location === name).reduce((s, p) => s + (p.children?.length || 0), 0);
            const todayOrders = orders.filter(o => o.location === name && o.date === todayStr()).length;
            return (
              <div key={name} style={{ padding: "14px 0", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {editId === name ? (
                  <>
                    <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)}
                      style={{ flex: 1, minWidth: 180 }} onKeyDown={e => e.key === "Enter" && saveEdit()} />
                    <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={busy}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
                      <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>
                        {parentCount} parent{parentCount !== 1 ? "s" : ""} · {studentCount} student{studentCount !== 1 ? "s" : ""} · {todayOrders} order{todayOrders !== 1 ? "s" : ""} today
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(name)}>✏️ Rename</button>
                    <button className="btn btn-danger btn-sm" onClick={() => removeLocation(name)}>Delete</button>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function SADrinks() {
  const { drinks, actions } = useApp();
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const flash = (msg) => { setSaved(msg); setTimeout(() => setSaved(false), 2000); };

  const addDrink = async () => {
    const trimmed = newName.trim();
    setError("");
    if (!trimmed) return setError("Please enter a drink name.");
    if (drinks.some(d => d.name.toLowerCase() === trimmed.toLowerCase())) return setError("That drink already exists.");
    setBusy(true);
    try { await actions.addDrink({ name: trimmed, emoji: newEmoji.trim() }); setNewName(""); setNewEmoji(""); flash("✓ Drink added!"); }
    catch (err) { setError(err.message || "Failed to add."); }
    finally { setBusy(false); }
  };

  const startEdit = (d) => { setEditId(d.id); setEditName(d.name); setEditEmoji(d.emoji || ""); setError(""); };

  const saveEdit = async () => {
    const trimmedName = editName.trim();
    setError("");
    if (!trimmedName) return setError("Name cannot be empty.");
    if (drinks.some(d => d.id !== editId && d.name.toLowerCase() === trimmedName.toLowerCase())) return setError("That name is already taken.");
    setBusy(true);
    try { await actions.updateDrink(editId, { name: trimmedName, emoji: editEmoji.trim() }); setEditId(null); flash("✓ Drink updated!"); }
    catch (err) { setError(err.message || "Failed to update."); }
    finally { setBusy(false); }
  };

  const removeDrink = async (d) => {
    if (!confirm(`Delete "${d.name}"? Existing orders that already chose this drink will keep the name.`)) return;
    setBusy(true);
    try { await actions.deleteDrink(d.id); flash("✓ Drink deleted."); }
    catch (err) { setError(err.message || "Failed to delete."); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-title">🥤 Drinks</div>
      <div className="page-subtitle">Manage the drink choices parents see when placing an order. Existing orders keep whatever drink was chosen, even if the option is later removed.</div>
      {saved && <div className="success-banner">{saved}</div>}
      {error && <div style={{ background: "#FDEEF3", border: "1px solid #F5B8C9", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 13, color: "var(--danger)", marginBottom: 16 }}>{error}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Add New Drink</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px auto", gap: 12, alignItems: "end" }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Name</label>
            <input className="form-input" value={newName} onChange={e => { setNewName(e.target.value); setError(""); }}
              placeholder="e.g. Lemonade" onKeyDown={e => e.key === "Enter" && addDrink()} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Emoji (optional)</label>
            <input className="form-input" value={newEmoji} onChange={e => setNewEmoji(e.target.value)}
              placeholder="🍋" maxLength={4} style={{ textAlign: "center", fontSize: 18 }} />
          </div>
          <button className="btn btn-primary" onClick={addDrink} disabled={busy}>{busy ? "…" : "Add Drink"}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">All Drinks ({drinks.length})</div>
        {drinks.length === 0
          ? <div className="empty-state"><div className="empty-icon">🥤</div><div className="empty-text">No drinks configured</div></div>
          : drinks.map(d => (
            <div key={d.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {editId === d.id ? (
                <>
                  <input className="form-input" value={editEmoji} onChange={e => setEditEmoji(e.target.value)}
                    style={{ width: 60, textAlign: "center", fontSize: 18 }} maxLength={4} placeholder="🥤" />
                  <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)}
                    style={{ flex: 1, minWidth: 180 }} onKeyDown={e => e.key === "Enter" && saveEdit()} />
                  <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={busy}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 28, width: 40, textAlign: "center" }}>{d.emoji || "🥤"}</div>
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>{d.name}</div>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(d)}>✏️ Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => removeDrink(d)}>Delete</button>
                </>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function SANotifications() {
  const { notifications } = useApp();
  return (
    <div>
      <div className="page-title">🔔 Notifications</div>
      <div className="page-subtitle">Log of all parent notifications from menu changes.</div>
      <div className="card">
        {notifications.length === 0
          ? <div className="empty-state"><div className="empty-icon">🔕</div><div className="empty-text">No notifications yet</div></div>
          : notifications.map(n => (
            <div key={n.id} className="notification-item">
              <div style={{ fontWeight: 600, fontSize: 14 }}>📬 {n.message}</div>
              <div className="notification-time">{new Date(n.sent_at).toLocaleString()}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

function SchoolAdminPages({ page }) {
  const map = {
    dashboard: <SchoolToday />,
    weekly: <SchoolWeekly />,
    students: <SchoolStudents />,
    reports: <SchoolReports />,
    holidays: <SchoolHolidays />,
  };
  return map[page] || map.dashboard;
}

function SchoolToday() {
  const { profile, orders } = useApp();
  const today = todayStr();
  const dayOrders = orders.filter(o => o.date === today && o.location === profile.location);
  return (
    <div>
      <div className="print-header"><h2>Lunchbox by Chumpys Kitchen — Daily Order Sheet</h2><p>{profile.location} — {formatDate(today)}</p></div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div><div className="page-title">Today's Orders</div><div className="page-subtitle">{profile.location} — {formatDate(today)}</div></div>
        <button className="btn btn-secondary no-print" onClick={() => window.print()}>🖨️ Print</button>
      </div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{dayOrders.length}</div><div className="stat-label">Total Orders</div></div>
        <div className="stat-card teal"><div className="stat-value">{[...new Set(dayOrders.map(o => o.childId))].length}</div><div className="stat-label">Students</div></div>
      </div>
      <div className="card">
        {dayOrders.length === 0 ? <div className="empty-state"><div className="empty-icon">📭</div><div className="empty-text">No orders for today</div></div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Student</th><th>Grade</th><th>Dietary</th><th>Parent</th><th>Food Item</th><th>Drink</th><th>✓</th></tr></thead>
            <tbody>{dayOrders.map((o, i) => (
              <tr key={o.id}>
                <td style={{ color: "var(--text3)" }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{o.childName}</td><td>{o.childGrade}</td>
                <td>{hasDietary(o.dietary) ? <span className="tag tag-gold" style={{ fontSize: 10, maxWidth: 160, whiteSpace: "normal" }}>{formatDietary(o.dietary)}</span> : "—"}</td>
                <td style={{ fontSize: 12 }}>{o.parentName}</td><td>{o.mainItem}</td><td>{o.drink}</td>
                <td><input type="checkbox" /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function SchoolWeekly() {
  const { profile, orders } = useApp();
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = getWeekDates(weekOffset).filter(ds => ![0, 6].includes(new Date(ds + "T12:00:00").getDay()));
  return (
    <div>
      <div className="page-title">📅 Weekly View</div>
      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w - 1)}>← Prev</button>
        <span style={{ fontWeight: 700 }}>{formatDate(weekDates[0])} – {formatDate(weekDates[4])}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w + 1)}>Next →</button>
        <button className="btn btn-secondary btn-sm no-print" onClick={() => window.print()}>🖨️ Print</button>
      </div>
      {weekDates.map(ds => {
        const dayOrders = orders.filter(o => o.date === ds && o.location === profile.location);
        return <div key={ds} className="card" style={{ marginBottom: 12 }}>
          <div className="flex-between" style={{ marginBottom: 8 }}><div className="card-title" style={{ margin: 0 }}>{formatDate(ds)}</div><span className="tag tag-orange">{dayOrders.length} orders</span></div>
          {dayOrders.length === 0 ? <div style={{ fontSize: 13, color: "var(--text3)" }}>No orders</div> : dayOrders.map(o => (
            <div key={o.id} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
              <span><b>{o.childName}</b> ({o.childGrade})</span><span style={{ color: "var(--text2)" }}>{o.mainItem} + {o.drink}</span>
            </div>
          ))}
        </div>;
      })}
    </div>
  );
}

function SchoolStudents() {
  const { profile, orders } = useApp();
  const seen = new Map();
  for (const o of orders.filter(x => x.location === profile.location)) {
    if (!seen.has(o.childId)) {
      seen.set(o.childId, { id: o.childId, name: o.childName, grade: o.childGrade, parentName: o.parentName, dietary: o.dietary, orderCount: 1 });
    } else { seen.get(o.childId).orderCount++; }
  }
  const students = [...seen.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return (
    <div>
      <div className="page-title">🎒 My Students</div><div className="page-subtitle">{profile.location} · {students.length} student{students.length !== 1 ? "s" : ""} with orders</div>
      <div className="card">
        {students.length === 0 ? <div className="empty-state"><div className="empty-icon">🎒</div><div className="empty-text">No student orders yet</div></div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Student</th><th>Grade</th><th>Dietary</th><th>Parent</th><th>Orders</th></tr></thead>
            <tbody>{students.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td><td>{c.grade}</td>
                <td>{hasDietary(c.dietary) ? <span className="tag tag-gold" style={{ maxWidth: 180, whiteSpace: "normal" }}>{formatDietary(c.dietary)}</span> : "—"}</td>
                <td>{c.parentName}</td><td>{c.orderCount}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function SchoolReports() {
  const { profile, orders } = useApp();
  return <ReportPanel orders={orders} parents={[]} locations={[profile.location]} scopedToLocation={profile.location} />;
}


function SchoolHolidays() {
  const { profile, blockedDays, actions } = useApp();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [label, setLabel] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const addDays = async () => {
    setError("");
    if (!startDate || !label) return setError("Please enter a start date and label.");
    if (endDate && endDate < startDate) return setError("End date is before start date.");
    setBusy(true);
    try {
      if (endDate && endDate !== startDate) {
        const n = await actions.addBlockedDayRange({ startDate, endDate, label, location: profile.location });
        setSaved(`✓ Blocked ${n} day${n === 1 ? "" : "s"}!`);
      } else {
        await actions.addBlockedDay({ date: startDate, label, location: profile.location });
        setSaved("✓ Day blocked!");
      }
      setLabel(""); setStartDate(""); setEndDate("");
      setTimeout(() => setSaved(false), 2500);
    } catch (err) { setError(err.message || "Failed to block day(s)."); }
    finally { setBusy(false); }
  };
  const removeGroup = async (group) => {
    const isRange = group.ids.length > 1;
    const promptMsg = isRange
      ? `Unblock all ${group.ids.length} days of "${group.label}" (${formatDate(group.startDate)} – ${formatDate(group.endDate)})?`
      : `Unblock ${formatDate(group.startDate)} (${group.label})?`;
    if (!confirm(promptMsg)) return;
    try {
      if (isRange) await actions.removeBlockedDays(group.ids);
      else         await actions.removeBlockedDay(group.ids[0]);
    } catch (err) { alert(err.message || "Failed to remove."); }
  };

  const relevantBlocked = Object.fromEntries(
    Object.entries(blockedDays || {}).filter(([_, info]) => info.locations === "all" || info.locations === profile.location)
  );
  const groups = groupBlockedDays(relevantBlocked);

  return (
    <div>
      <div className="page-title">🚫 Blocked Days</div>
      <div className="page-subtitle">{profile.location} — block days or ranges (e.g. snow days, breaks). Parents at this location won't be able to order on those dates.</div>
      {saved && <div className="success-banner">{saved}</div>}
      {error && <div style={{ background: "#FDEEF3", border: "1px solid #F5B8C9", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 13, color: "var(--danger)", marginBottom: 16 }}>{error}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Add Blocked Day or Range</div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 160px 1fr auto", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Start Date</label><input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">End Date <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text3)" }}>(optional)</span></label><input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate || undefined} /></div>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Label</label><input className="form-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Spring Break, Snow Day" /></div>
          <button className="btn btn-primary" onClick={addDays} disabled={busy}>{busy ? "Saving…" : (endDate && endDate !== startDate ? "Block Range" : "Block Day")}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Blocked ({groups.length} {groups.length === 1 ? "entry" : "entries"})</div>
        {groups.length === 0 ? <div className="empty-state"><div className="empty-icon">📅</div><div className="empty-text">No blocked days</div></div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date(s)</th><th>Label</th><th>Applies To</th><th></th></tr></thead>
            <tbody>{groups.map((g, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>
                  {g.startDate === g.endDate
                    ? formatDate(g.startDate)
                    : <>{formatDate(g.startDate)} – {formatDate(g.endDate)} <span style={{ fontWeight: 400, color: "var(--text3)", fontSize: 11 }}>({g.ids.length} days)</span></>}
                </td>
                <td>{g.label}</td>
                <td>{g.locations === "all" ? <span className="tag tag-orange">All Locations</span> : <span className="tag tag-teal">{g.locations.split(" ")[0]}</span>}</td>
                <td>{g.locations === profile.location
                  ? <button className="btn btn-danger btn-xs" onClick={() => removeGroup(g)}>Remove</button>
                  : <span style={{ fontSize: 11, color: "var(--text3)" }}>Set by super admin</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function ParentPages({ page }) {
  const { children } = useApp();
  const map = {
    dashboard: <ParentDashboard />,
    order: children.length === 0 ? <NoChildrenCard /> : <ParentOrderCalendar />,
    myorders: <ParentMyOrders />,
    profile: <ParentProfile />,
    children: <ParentChildren />,
  };
  return map[page] || map.dashboard;
}

function NoChildrenCard() {
  return <div className="card"><div className="empty-state"><div className="empty-icon">🎒</div><div className="empty-text">No children added yet</div><div className="empty-sub">Go to <b>My Children</b> to add your kids first.</div></div></div>;
}

function ParentDashboard() {
  const { profile, children, orders, menu, repeatOrders } = useApp();
  const today = todayStr();
  const todayOrders = orders.filter(o => o.date === today);
  const upcoming = orders.filter(o => o.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthOrders = orders.filter(o => o.date?.startsWith(thisMonth));
  const WEEKDAY_NAME = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div>
      <div className="page-title">Hi, {profile.name.split(" ")[0]}! 👋</div>
      <div className="page-subtitle">{profile.location}</div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{children.length}</div><div className="stat-label">Children</div></div>
        <div className="stat-card teal"><div className="stat-value">{todayOrders.length}</div><div className="stat-label">Today's Orders</div></div>
        <div className="stat-card gold"><div className="stat-value">{monthOrders.length}</div><div className="stat-label">This Month</div></div>
        <div className="stat-card green"><div className="stat-value">{repeatOrders.length}</div><div className="stat-label">Active Repeats</div></div>
      </div>
      {repeatOrders.length > 0 && (
        <div className="cutoff-notice" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>🔁 Active repeat orders</div>
          {repeatOrders.map(r => {
            const childName = r.children?.name || children.find(c => c.id === r.child_id)?.name || "Child";
            return (
              <div key={r.id} style={{ fontSize: 13, fontWeight: 400 }}>
                <b>{childName}</b> · every {WEEKDAY_NAME[r.weekday]} · menu option #{r.item_index} + {r.drink}
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
            Manage in <b>My Profile</b>. Orders are pre-created 3 weeks ahead.
          </div>
        </div>
      )}
      <div className="grid2">
        <div className="card">
          <div className="card-title">🍽️ Today's Menu</div>
          {menu[today]?.items?.map((it, i) => (
            <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 14 }}>{it.name}</div>
          )) || <div style={{ color: "var(--text3)" }}>No menu for today</div>}
          {todayOrders.length > 0 ? <div className="cal-ordered" style={{ marginTop: 12 }}>✓ {todayOrders.length} order{todayOrders.length !== 1 ? "s" : ""} placed</div>
            : !isPastCutoff(today) ? <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 8 }}>⏰ Cutoff: 8:00 AM today</div>
            : <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>⛔ Cutoff has passed</div>}
        </div>
        <div className="card">
          <div className="card-title">📅 Upcoming Orders</div>
          {upcoming.length === 0 ? <div style={{ fontSize: 13, color: "var(--text3)" }}>No upcoming orders</div> : upcoming.map(o => {
            const child = children.find(c => c.id === o.childId);
            return <div key={o.id} style={{ padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{formatDate(o.date)}</div>
              <div style={{ color: "var(--text2)" }}>{child?.name || o.childName} — {o.mainItem}</div>
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}

function ParentOrderCalendar() {
  const { profile, children, orders, menu, blockedDays, drinks, repeatOrders, actions } = useApp();
  const [weekOffset, setWeekOffset] = useState(0);
  const [pickModal, setPickModal] = useState(null);
  const [drinkModal, setDrinkModal] = useState(null);
  const [repeatModal, setRepeatModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedChild, setSelectedChild] = useState(children[0]?.id || "");
  const weekDates = getWeekDates(weekOffset);
  const today = todayStr();

  useEffect(() => {
    if (children.length === 0) return;
    if (!selectedChild || !children.find(c => c.id === selectedChild)) {
      setSelectedChild(children[0].id);
    }
  }, [children, selectedChild]);

  const getOrder = (ds, childId) => orders.find(o => o.childId === childId && o.date === ds);

  const handleCellClick = (ds) => {
    if (!selectedChild) return;
    if (isPastCutoff(ds)) return;
    if (isBlocked(ds, blockedDays, profile.location)) return;
    const existing = getOrder(ds, selectedChild);
    const child = children.find(c => c.id === selectedChild);
    if (existing) { setEditModal({ ds, child, existing }); return; }
    const m = menu[ds];
    if (!m?.items?.length) return;
    setPickModal({ ds, child, items: m.items, menuDayId: m.id });
  };

  const handleEditOrder = async () => {
    const { ds, child, existing } = editModal;
    setBusy(true);
    try {
      await actions.cancelOrder(existing.id);
      setEditModal(null);
      const m = menu[ds];
      setPickModal({ ds, child, items: m.items, menuDayId: m.id });
    } catch (err) { setError(err.message || "Failed to edit."); setEditModal(null); }
    finally { setBusy(false); }
  };

  const handleDeleteOrder = async () => {
    setBusy(true);
    try { await actions.cancelOrder(editModal.existing.id); setEditModal(null); }
    catch (err) { alert(err.message || "Failed to cancel."); }
    finally { setBusy(false); }
  };

  const confirmItem = (item, itemIndex) => {
    const { ds, child, menuDayId } = pickModal;
    setPickModal(null);
    setDrinkModal({ ds, child, item, itemIndex, menuDayId });
  };

  const confirmDrink = async (drink) => {
    const { ds, child, item, itemIndex, menuDayId } = drinkModal;
    setBusy(true); setError("");
    try {
      await actions.placeOrder({
        parentId: profile.id, childId: child.id, menuDayId, menuItemId: item.id,
        itemName: item.name, itemPrice: item.price, drink, location: profile.location, orderDate: ds,
      });
      setDrinkModal(null);
      const weekdayNum = new Date(ds + "T12:00:00").getDay();
      const weekdayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][weekdayNum];
      const isoWeekday = weekdayNum === 0 ? 7 : weekdayNum;
      const existingRepeat = repeatOrders.find(r => r.child_id === child.id && r.weekday === isoWeekday);
      setRepeatModal({ ds, child, weekday: isoWeekday, weekdayName, item, itemIndex, drink, alreadyRepeating: !!existingRepeat });
    } catch (err) { setError(err.message || "Failed to place order."); setDrinkModal(null); }
    finally { setBusy(false); }
  };

  const saveRepeat = async () => {
    const { child, weekday, itemIndex, drink } = repeatModal;
    try {
      await actions.upsertRepeatOrder({
        parentId: profile.id, childId: child.id, weekday, itemIndex, drink, location: profile.location,
      });
    } catch (err) { alert(err.message || "Failed to set up repeat."); }
    setRepeatModal(null);
  };

  return (
    <div>
      <div className="page-title">📅 Order Lunches</div>
      <div className="page-subtitle">Tap a day to choose a meal. Tap an ordered day to edit or cancel.</div>
      {error && <div style={{ background: "#FDEEF3", border: "1px solid #F5B8C9", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 13, color: "var(--danger)", marginBottom: 16 }}>⚠️ {error}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <label className="form-label">Ordering for</label>
        <select className="form-input form-select" style={{ maxWidth: 240 }} value={selectedChild} onChange={e => setSelectedChild(e.target.value)}>
          {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="cutoff-notice">⏰ Daily cutoff is 8:00 AM. Orders and cancellations are locked after that.</div>
      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w - 1)}>← Prev Week</button>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{formatDate(weekDates[0])} – {formatDate(weekDates[6])}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w + 1)}>Next Week →</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>This Week</button>
      </div>
      <div className="cal-header">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <div key={d} className="cal-day-label">{d}</div>)}</div>
      <div className="cal-grid">
        {weekDates.map(ds => {
          const isWknd = [0, 6].includes(new Date(ds + "T12:00:00").getDay());
          const m = menu[ds];
          const ordered = selectedChild && getOrder(ds, selectedChild);
          const pastCutoff = isPastCutoff(ds);
          const blocked = isBlocked(ds, blockedDays, profile.location);
          const blockInfo = blockedDays?.[ds];
          const canClick = !isWknd && !blocked && m?.items?.length > 0 && (!pastCutoff || ordered);
          return (
            <div key={ds} className={`cal-cell${ds === today ? " today" : ""}${isWknd ? " weekend" : ""}${blocked ? " weekend" : ""}${ordered && !blocked ? " has-order" : ""}${(pastCutoff && !ordered) || blocked ? " past" : ""}${canClick ? " clickable" : ""}`}
              onClick={() => canClick && handleCellClick(ds)}>
              <div className="cal-date">{new Date(ds + "T12:00:00").getDate()}</div>
              {isWknd ? <div style={{ fontSize: 11, color: "var(--text3)" }}>Weekend</div>
                : blocked ? <div style={{ fontSize: 10, color: "var(--danger)", fontWeight: 700 }}>🚫 {blockInfo?.label || "No School"}</div>
                : !m?.items?.length ? <div style={{ fontSize: 11, color: "var(--text3)" }}>No menu</div>
                : <>
                  <div className="cal-items">{m.items.map((it, i) => <div key={i}>• {it.name}</div>)}</div>
                  {ordered ? <div className="cal-ordered">✓ {ordered.mainItem}</div>
                    : pastCutoff ? <div style={{ fontSize: 10, color: "var(--danger)", fontWeight: 600 }}>Cutoff passed</div>
                    : <div style={{ fontSize: 10, color: "var(--secondary)", fontWeight: 600 }}>Tap to order</div>}
                </>}
            </div>
          );
        })}
      </div>

      {editModal && (
        <div className="modal-overlay" onClick={() => !busy && setEditModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">Manage Order <button className="modal-close" onClick={() => !busy && setEditModal(null)}>×</button></div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 4 }}>{formatDate(editModal.ds)} — {editModal.child?.name}</div>
            <div style={{ background: "var(--bg2)", borderRadius: "var(--radius-sm)", padding: "12px 16px", marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{editModal.existing.mainItem}</div>
              <div style={{ fontSize: 13, color: "var(--secondary)", fontWeight: 600, marginTop: 4 }}>🥤 {editModal.existing.drink}</div>
            </div>
            <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20 }}>Would you like to edit or delete this order?</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={handleEditOrder} disabled={busy}>✏️ Edit Order</button>
              <button className="btn btn-danger" style={{ flex: 1, justifyContent: "center" }} onClick={handleDeleteOrder} disabled={busy}>🗑️ Delete Order</button>
            </div>
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => setEditModal(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      {pickModal && (
        <div className="modal-overlay" onClick={() => setPickModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Step 1 of 2 — Choose a Meal <button className="modal-close" onClick={() => setPickModal(null)}>×</button></div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>{formatDate(pickModal.ds)} — {pickModal.child?.name}</div>
            {pickModal.items.map((item, i) => (
              <div key={i} className="item-pick" onClick={() => confirmItem(item, i + 1)}>
                <div className="item-pick-radio"><div className="item-pick-inner" /></div>
                <div className="item-pick-name"><span style={{ color: "var(--text3)", fontWeight: 700, marginRight: 8 }}>#{i + 1}</span>{item.name}</div>
              </div>
            ))}
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={() => setPickModal(null)}>Cancel</button>
          </div>
        </div>
      )}

      {drinkModal && (
        <div className="modal-overlay" onClick={() => !busy && setDrinkModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Step 2 of 2 — Choose a Drink <button className="modal-close" onClick={() => !busy && setDrinkModal(null)}>×</button></div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 4 }}>{formatDate(drinkModal.ds)} — {drinkModal.child?.name}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>🍽️ {drinkModal.item?.name}</div>
            {drinks.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text3)", padding: "12px 0" }}>
                No drink options available — please ask the school admin to add some.
              </div>
            ) : (
              drinks.map((d) => (
                <div key={d.id} className="item-pick" onClick={() => !busy && confirmDrink(d.name)}>
                  <div style={{ fontSize: 28, width: 36, textAlign: "center" }}>{d.emoji || "🥤"}</div>
                  <div className="item-pick-name">{d.name}</div>
                </div>
              ))
            )}
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={() => setDrinkModal(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      {repeatModal && (
        <RepeatModal info={repeatModal} onSave={saveRepeat} onClose={() => setRepeatModal(null)} />
      )}
    </div>
  );
}

function RepeatModal({ info, onSave, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: "center", paddingBottom: 16 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
          <div style={{ fontFamily: "'Nunito',sans-serif", fontWeight: 900, fontSize: 22 }}>Order Placed!</div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 6, lineHeight: 1.5 }}>
            <b>{info.child.name}</b> will have <b>{info.item.name}</b> with <b>{info.drink}</b> on {formatDate(info.ds)}.
          </div>
        </div>
        <div className="repeat-section">
          <div className="repeat-title">🔁 Repeat this order every {info.weekdayName}?</div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8, lineHeight: 1.5 }}>
            We'll auto-order <b>menu option #{info.itemIndex}</b> with <b>{info.drink}</b> for <b>{info.child.name}</b> every {info.weekdayName}, 3 weeks in advance, until you turn it off.
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.5, padding: "8px 12px", background: "var(--bg2)", borderRadius: 8 }}>
            <b>Important:</b> the menu rotates between weeks, so the actual food may differ. We'll always pick the <b>{info.itemIndex === 1 ? "first" : info.itemIndex === 2 ? "second" : info.itemIndex === 3 ? "third" : `#${info.itemIndex}`}</b> item from each {info.weekdayName}'s menu. Today that's <b>{info.item.name}</b>.
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>
            Blocked days and days where the menu has fewer items are skipped automatically. Manage repeats anytime in <b>My Profile</b>.
          </div>
          {info.alreadyRepeating && (
            <div style={{ fontSize: 12, color: "#7A6000", marginTop: 8, fontWeight: 600 }}>
              ⚠️ You already have a repeat for {info.child.name} on {info.weekdayName}s — saving will replace it with this new pick.
            </div>
          )}
        </div>
        <div className="flex-gap" style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>No, just this once</button>
          <button className="btn btn-primary" onClick={onSave}>Yes, repeat every {info.weekdayName}</button>
        </div>
      </div>
    </div>
  );
}

function ParentMyOrders() {
  const { children, orders, actions } = useApp();
  const sorted = useMemo(() => orders.slice().sort((a, b) => a.date.localeCompare(b.date)), [orders]);
  const cancel = async (o) => {
    if (isPastCutoff(o.date)) return alert("Cannot cancel — the 8AM cutoff has passed.");
    if (!confirm("Cancel this order?")) return;
    try { await actions.cancelOrder(o.id); }
    catch (err) { alert(err.message || "Failed to cancel."); }
  };
  return (
    <div>
      <div className="page-title">📋 My Orders</div>
      <div className="page-subtitle">View and cancel upcoming orders before the 8AM cutoff.</div>
      <div className="card">
        {sorted.length === 0 ? <div className="empty-state"><div className="empty-icon">📭</div><div className="empty-text">No orders yet</div></div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Child</th><th>Food</th><th>Drink</th><th>Status</th><th></th></tr></thead>
            <tbody>{sorted.map(o => {
              const child = children.find(c => c.id === o.childId);
              const past = isPastCutoff(o.date); const future = o.date > todayStr();
              return <tr key={o.id}>
                <td>{formatDate(o.date)}</td><td style={{ fontWeight: 600 }}>{child?.name || o.childName}</td>
                <td>{o.mainItem}</td><td>{o.drink}</td>
                <td>{past ? <span className="tag tag-gray">Past</span> : future ? <span className="tag tag-green">Upcoming</span> : <span className="tag tag-teal">Today</span>}</td>
                <td>{!past && <button className="btn btn-danger btn-xs" onClick={() => cancel(o)}>Cancel</button>}</td>
              </tr>;
            })}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function ParentProfile() {
  const { profile, children, locations, repeatOrders, actions } = useApp();
  const [form, setForm] = useState({ name: profile.name, phone: profile.phone || "", location: profile.location || "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setError("");
    if (!form.name?.trim()) return setError("Name cannot be empty.");
    if (!form.phone?.trim()) return setError("A contact phone number is required.");
    setBusy(true);
    try {
      await actions.updateProfile(profile.id, form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { setError(err.message || "Failed to save profile."); }
    finally { setBusy(false); }
  };
  const turnOffRepeat = async (r) => {
    const childName = r.children?.name || children.find(c => c.id === r.child_id)?.name || "this child";
    const WEEKDAY_FULL = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    if (!confirm(`Turn off the ${WEEKDAY_FULL[r.weekday]} repeat for ${childName}? Future auto-orders will be canceled.`)) return;
    try { await actions.deleteRepeatOrder(r.id); }
    catch (err) { alert(err.message || "Failed to turn off repeat."); }
  };
  return (
    <div>
      <div className="page-title">👤 My Profile</div>
      <div className="page-subtitle">Update your account details.</div>
      {saved && <div className="success-banner">✓ Profile saved!</div>}
      {error && <div className="login-error">⚠️ {error}</div>}
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Phone *</label><input className="form-input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="555-123-4567" /></div>
        </div>
        <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={profile.email || ""} disabled /></div>
        <div className="form-group">
          <label className="form-label">Location</label>
          <select className="form-input form-select" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
            {locations.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Changes"}</button>
      </div>

      <div className="card" style={{ maxWidth: 720, marginTop: 24 }}>
        <div className="card-title">🔁 Active Repeat Orders</div>
        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
          Each repeat auto-creates an order every week, three weeks in advance, until you turn it off. Blocked days and weeks where the menu isn't set yet are skipped.
        </div>
        {repeatOrders.length === 0 ? (
          <div className="empty-state" style={{ padding: "24px" }}>
            <div className="empty-icon" style={{ fontSize: 32 }}>🔁</div>
            <div className="empty-text">No active repeats</div>
            <div className="empty-sub">Place an order from the Order Lunches calendar; you'll be asked if you want to repeat it weekly.</div>
          </div>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr><th>Child</th><th>Day</th><th>Menu Pick</th><th>Drink</th><th></th></tr></thead>
            <tbody>{repeatOrders.map(r => {
              const WEEKDAY_FULL = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
              const childName = r.children?.name || children.find(c => c.id === r.child_id)?.name || "—";
              return (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{childName}</td>
                  <td>Every {WEEKDAY_FULL[r.weekday]}</td>
                  <td>Menu option <b>#{r.item_index}</b></td>
                  <td>{r.drink}</td>
                  <td><button className="btn btn-danger btn-xs" onClick={() => turnOffRepeat(r)}>Turn Off</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function ParentChildren() {
  const { children, actions } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", grade: GRADES[0], dietary: { selected: [], otherDetails: "" } });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!form.name.trim()) return setError("Please enter a name.");
    setBusy(true); setError("");
    try {
      await actions.upsertChild(form);
      setForm({ name: "", grade: GRADES[0], dietary: { selected: [], otherDetails: "" } });
      setShowAdd(false);
    } catch (err) { setError(err.message || "Failed to add child."); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!confirm("Remove this child?")) return;
    try { await actions.deleteChild(id); }
    catch (err) { alert(err.message || "Failed to remove."); }
  };
  const updateField = async (child, key, val) => {
    try { await actions.upsertChild({ ...child, [key]: val }); }
    catch (err) { alert(err.message || "Failed to save."); }
  };

  return (
    <div>
      <div className="page-title">🎒 My Children</div>
      <div className="page-subtitle">Manage your children's profiles and dietary needs.</div>
      {children.map(c => (
        <ChildEditor key={c.id} child={c} onUpdate={(k, v) => updateField(c, k, v)} onRemove={() => remove(c.id)} />
      ))}
      {showAdd ? (
        <div className="card" style={{ border: "2px dashed var(--secondary)" }}>
          <div className="card-title">➕ Add Child</div>
          {error && <div className="login-error">⚠️ {error}</div>}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Child's full name" /></div>
            <div className="form-group"><label className="form-label">Grade</label><select className="form-input form-select" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}>{GRADES.map(g => <option key={g}>{g}</option>)}</select></div>
          </div>
          <DietaryPicker value={form.dietary} onChange={val => setForm(f => ({ ...f, dietary: val }))} />
          <div className="flex-gap">
            <button className="btn btn-secondary" onClick={add} disabled={busy}>{busy ? "Adding…" : "Add Child"}</button>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-secondary" onClick={() => setShowAdd(true)}>➕ Add a Child</button>
      )}
    </div>
  );
}

function ChildEditor({ child, onUpdate, onRemove }) {
  const [name, setName] = useState(child.name);
  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== child.name) onUpdate("name", trimmed);
    else if (!trimmed) setName(child.name);
  };
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: "'Nunito',sans-serif", fontWeight: 800, fontSize: 18 }}>👦 {child.name}</div>
        <button className="btn btn-danger btn-xs" onClick={onRemove}>Remove</button>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Name</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} onBlur={commitName} />
        </div>
        <div className="form-group">
          <label className="form-label">Grade</label>
          <select className="form-input form-select" value={child.grade} onChange={e => onUpdate("grade", e.target.value)}>
            {GRADES.map(g => <option key={g}>{g}</option>)}
          </select>
        </div>
      </div>
      <DietaryPicker value={child.dietary} onChange={val => onUpdate("dietary", val)} />
      {hasDietary(child.dietary) && <div className="cutoff-notice">⚠️ Dietary restrictions: <b>{formatDietary(child.dietary)}</b> — visible to school admin on order sheets.</div>}
    </div>
  );
}

function DietaryPicker({ value, onChange }) {
  const norm = (v) => {
    if (!v || (typeof v === "string" && v === "None")) return { selected: [], otherDetails: "" };
    if (typeof v === "string") return { selected: [v], otherDetails: "" };
    return v;
  };
  const val = norm(value);
  const toggle = (opt) => {
    const already = val.selected.includes(opt);
    onChange({ ...val, selected: already ? val.selected.filter(x => x !== opt) : [...val.selected, opt] });
  };
  const setOther = (text) => onChange({ ...val, otherDetails: text });
  const showOther = val.selected.includes("Other");
  const toggleOther = () => {
    if (showOther) onChange({ ...val, selected: val.selected.filter(x => x !== "Other"), otherDetails: "" });
    else onChange({ ...val, selected: [...val.selected, "Other"] });
  };
  return (
    <div className="form-group">
      <label className="form-label">Dietary Restrictions <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text3)" }}>— select all that apply</span></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: showOther ? 10 : 0 }}>
        {DIETARY_OPTIONS.map(opt => {
          const active = val.selected.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                cursor: "pointer", border: "1.5px solid", transition: "all 0.15s",
                background: active ? "var(--primary)" : "var(--surface)",
                color: active ? "white" : "var(--text2)",
                borderColor: active ? "var(--primary)" : "var(--border)",
              }}>
              {active && <span style={{ fontSize: 11 }}>✓</span>}
              {opt}
            </button>
          );
        })}
        <button type="button" onClick={toggleOther}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
            cursor: "pointer", border: "1.5px solid", transition: "all 0.15s",
            background: showOther ? "var(--secondary)" : "var(--surface)",
            color: showOther ? "white" : "var(--text2)",
            borderColor: showOther ? "var(--secondary)" : "var(--border)",
          }}>
          {showOther && <span style={{ fontSize: 11 }}>✓</span>}
          Other / Not Listed
        </button>
      </div>
      {showOther && (
        <div style={{ marginTop: 8 }}>
          <input className="form-input" placeholder="Please describe the restriction(s)…" value={val.otherDetails || ""} onChange={e => setOther(e.target.value)} />
        </div>
      )}
      {(val.selected.length === 0) && (
        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>No restrictions selected — child has no dietary restrictions.</div>
      )}
    </div>
  );
}
