import React, { useState, useEffect } from 'react'; 
import { Link } from 'react-router-dom';
import { Zap, Sun, Moon } from 'lucide-react'; 

// 💡 NOTE: This logic locks the page to the dark theme and applies the 'dark' class 
// globally. This ensures visual consistency with your other dark-themed components (Login, Signup).

const useForcedDarkTheme = () => {
    const [theme, setTheme] = useState('dark'); // Always start in dark mode

    useEffect(() => {
        const root = document.documentElement;
        // Apply the 'dark' class globally
        root.classList.add('dark');
        // Clean up on unmount (less critical here, but good practice)
        return () => root.classList.remove('dark');
    }, []);

    // Functionality to toggle the theme display, even if the underlying app stays dark
    const toggleTheme = () => {
        setTheme(current => (current === 'light' ? 'dark' : 'light'));
    };

    return { theme, toggleTheme };
};

// --- Helper Components ---

const BackgroundShapes = () => (
    <React.Fragment>
        {/* Dark theme shapes for visual appeal */}
        <div 
            className="absolute w-80 h-80 rounded-full blur-[150px] z-0 opacity-40 transition-colors 
                       top-[-10%] left-[-10%] bg-indigo-400/50"
        ></div>
        <div 
            className="absolute w-72 h-72 rounded-full blur-[150px] z-0 opacity-40 transition-colors 
                       bottom-[-15%] right-[-10%] bg-indigo-500/30"
        ></div>
    </React.Fragment>
);

const ThemeToggle = ({ theme, toggleTheme }) => (
    <button
        type="button"
        // Styling is fixed for dark mode components
        className="absolute top-4 right-4 bg-slate-800 border border-slate-700
                   cursor-pointer text-slate-400 transition-all p-2 rounded-full
                   hover:text-indigo-400 hover:scale-105"
        onClick={toggleTheme}
        aria-label={`Switch theme`}
        title="Toggle Theme"
    >
        {/* Icon still switches for visual feedback, even if the background is locked */}
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
    </button>
    
);


// --- Main Component ---

export default function Welcome() {
    const { theme, toggleTheme } = useForcedDarkTheme(); 
    
    return (
        <div 
            // 💡 FORCED DARK MODE: Matches Login/Signup pages (bg-slate-900/950)
            className="min-h-screen flex items-center justify-center relative overflow-hidden font-sans w-full 
                       bg-slate-950 text-slate-50 transition-colors"
        >
            <BackgroundShapes />
            
            <div className="flex flex-col md:flex-row items-center justify-center max-w-6xl mx-auto p-4 z-10">

                {/* 1. Brand/Quote Section (Enhanced Dark Contrast) */}
                <div className="text-center md:text-left md:w-1/2 p-6 md:pr-16 mb-12 md:mb-0">
                    <div className="text-indigo-400 mb-6 flex justify-center md:justify-start">
                        <Zap size={64} className="transform hover:rotate-6 transition-transform duration-300" />
                    </div>
                    
                    {/* 💡 Text is now bright white/light slate for excellent contrast */}
                    <h1 className="text-5xl md:text-7xl font-extrabold leading-tight tracking-tighter text-slate-50">
                        VisionDesk
                    </h1>
                    
                    <blockquote className="mt-8 border-l-4 border-indigo-500 pl-4">
                        <p className="text-xl md:text-2xl italic font-medium text-slate-300">
                            "Connect beyond borders. Collaborate without limits."
                        </p>
                    </blockquote>
                    
                    <p className="mt-3 text-base font-light text-slate-400">
                        — Your modern workspace.
                    </p>
                </div>
                
                {/* 2. Authentication Card (Dark Theme Card Style) */}
                <div 
                    // 💡 Card uses darker background and border to match other auth components
                    className="w-full max-w-sm md:w-1/2 bg-slate-900 p-8 md:p-10 border border-slate-700 
                               rounded-3xl shadow-2xl shadow-indigo-900/50 transition-all relative z-10
                               transform hover:scale-[1.02] duration-300 ease-in-out" 
                >
                    <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

                    <div className="text-center mb-8">
                        {/* Text set to lighter shades for high contrast */}
                        <h2 className="text-2xl font-bold mb-2 text-slate-100">
                            Start Your Journey 🚀
                        </h2>
                        <p className="text-slate-400 text-sm">
                            Sign in or create an account to enter your modern workspace.
                        </p>
                    </div>

                   <center><div className="space-y-4">
                        {/* Primary Button */}
                        <Link 
                            to="/login" 
                            className="btn block w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-all 
                                       text-white text-base font-semibold shadow-lg shadow-indigo-600/40 
                                       transform hover:translate-y-[-2px] duration-150"
                        >
                               Get Started (Sign In)
                        </Link>
                        
                        {/* Secondary Button */}
                        <Link 
                            to="/signup" 
                            className="btn block w-full py-3 rounded-xl bg-transparent 
                                       text-slate-50 
                                       border border-slate-700 
                                       hover:bg-slate-800
                                       transition-colors text-base font-semibold"
                        >
                            Create Account
                        </Link>
                    </div>
                    </center> 
                </div>
            </div>
        </div>
    );
}