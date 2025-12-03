import React from 'react';
import { Zap, Sun, Moon } from 'lucide-react'; // Using lucide icons

// This component uses hardcoded 'light' theme for simplicity 
// in a single-page output without a shared context. 
// For a full app, use a Context Provider (like in the previous full example).
const ThemeToggle = () => {
    const [theme, setTheme] = React.useState('light');
    const toggleTheme = () => setTheme(current => (current === 'light' ? 'dark' : 'light'));

    return (
        <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
    );
};

const BackgroundShapes = () => (
    <React.Fragment>
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
    </React.Fragment>
);

const AuthHome = () => {
  const [theme, setTheme] = React.useState('light'); // Local state for theme class
  const toggleTheme = () => setTheme(current => (current === 'light' ? 'dark' : 'light'));

  return (
    <div className={`auth-container theme-${theme}`}>
      <BackgroundShapes />
      <div className="auth-card welcome-card">
        {/* Local Theme Toggle for demonstration */}
        <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
        
        <div className="auth-header">
          <div className="logo-icon"><Zap size={48} /></div>
          <h1 className="title">Welcome to VisionDesk</h1>
          <p className="subtitle">
            Seamlessly connect, meet, and collaborate. Your new workspace awaits.
          </p>
        </div>

        <div className="auth-actions">
          {/* Note: In a real React app, these would be <Link to="/login"> components */}
          <a href="#" className="btn btn-primary" onClick={(e) => e.preventDefault()}>
            Get Started (Sign In)
          </a>
          <a href="#" className="btn btn-secondary" onClick={(e) => e.preventDefault()}>
            Create Account
          </a>
        </div>
      </div>
    </div>
  );
};

// --- Styles (Adapted from auth.css) ---
const style = document.createElement('style');
style.innerHTML = `
/* --- Base Variables --- */
:root {
  /* Light Theme Defaults (Professional & Friendly) */
  --primary-color: #4a6cf7; /* VisionDesk Blue */
  --primary-hover: #3a5ce4;
  --text-primary: #1a1a1a;
  --text-secondary: #666;
  --border-color: #eaeaea;
  --bg-light: #f8f9ff;
  --card-bg: #ffffff;
  --shadow-md: 0 10px 30px rgba(0, 0, 0, 0.08);
  --border-radius: 12px;
  --transition: all 0.3s ease;
}

/* --- Dark Theme Variables --- */
.theme-dark {
  --primary-color: #6d89ff; /* Brighter Blue for Dark BG */
  --primary-hover: #4a6cf7;
  --text-primary: #f0f0f0;
  --text-secondary: #a0a0a0;
  --border-color: #333;
  --bg-light: #1e1e1e;
  --card-bg: #282828;
  --shadow-md: 0 10px 30px rgba(0, 0, 0, 0.4);
}

/* --- Global Styles --- */
.auth-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-light);
  color: var(--text-primary);
  transition: background-color var(--transition), color var(--transition);
  position: relative;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
  width: 100%;
}

/* --- Background Shapes --- */
.shape {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  z-index: 0;
  opacity: 0.3;
  transition: background var(--transition);
}

.shape-1 {
  width: 350px;
  height: 350px;
  top: -10%;
  left: -10%;
  background: var(--primary-color);
}

.shape-2 {
  width: 300px;
  height: 300px;
  bottom: -15%;
  right: -10%;
  background: var(--primary-hover);
}

/* --- Authentication Card --- */
.auth-card {
  background: var(--card-bg);
  padding: 3rem;
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-md);
  width: 100%;
  max-width: 400px;
  text-align: center;
  border: 1px solid var(--border-color);
  transition: var(--transition);
  position: relative;
  z-index: 1;
}

/* --- Theme Toggle Button --- */
.theme-toggle {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: var(--border-color);
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  transition: var(--transition);
  padding: 0.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.theme-dark .theme-toggle {
    background: rgba(255, 255, 255, 0.1);
}

.theme-toggle:hover {
  color: var(--primary-color);
  transform: scale(1.05);
}

/* --- Header --- */
.auth-header {
    margin-bottom: 2rem;
}

.logo-icon {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.auth-header .title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.auth-header .subtitle {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

/* --- Buttons --- */
.btn {
  display: inline-block;
  width: 100%;
  padding: 0.875rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
  text-decoration: none;
  text-align: center;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--primary-color);
  color: white;
  margin-top: 0.5rem; 
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--primary-hover);
  box-shadow: 0 4px 15px rgba(74, 108, 247, 0.4);
}

.btn-secondary {
  background-color: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  margin-top: 1rem;
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--border-color);
}

/* Responsive Design */
@media (max-width: 480px) {
  .auth-card {
    padding: 2rem 1.5rem;
    max-width: 90%;
  }
  .auth-header .title {
    font-size: 1.75rem;
  }
}
`;
document.head.appendChild(style);

export default AuthHome;