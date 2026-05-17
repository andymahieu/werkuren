import { Outlet, Link, useLocation } from 'react-router-dom';
import { Calendar, CalendarDays, BarChart, Settings, LogOut, User, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../store/useStore';

export default function Layout() {
    const location = useLocation();
    const { user, logout } = useAuth();
    const reset = useStore(s => s.reset);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        reset();
        logout();
    };

    const navigation = [
        { name: 'Weekkalender', href: '/', icon: Calendar },
        { name: 'Maandkalender', href: '/maand', icon: CalendarDays },
        { name: 'Rapportage', href: '/rapportage', icon: BarChart },
        { name: 'Instellingen', href: '/instellingen', icon: Settings },
    ];

    const closeMenu = () => setIsMobileMenuOpen(false);

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div 
                    className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden transition-opacity"
                    onClick={closeMenu}
                />
            )}

            {/* Sidebar (Desktop & Mobile) */}
            <div className={`
                fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-800 border-r dark:border-slate-700 z-50 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="h-16 flex items-center justify-between px-6 border-b dark:border-slate-700">
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Calendar className="h-6 w-6 text-blue-600" />
                        Werkuren
                    </h1>
                    <button onClick={closeMenu} className="md:hidden text-slate-500">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
                    {navigation.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                onClick={closeMenu}
                                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200'
                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                                    }`}
                            >
                                <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                {/* User info + logout */}
                <div className="p-4 border-t dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-3 px-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                            {user?.username}
                        </span>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 rounded-md transition-colors"
                    >
                        <LogOut className="h-4 w-4" />
                        Uitloggen
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden flex flex-col min-w-0">
                <header className="h-16 bg-white dark:bg-slate-800 border-b dark:border-slate-700 flex items-center justify-between px-4 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="md:hidden p-2 -ml-2 text-slate-600 dark:text-slate-400"
                        >
                            <Menu className="h-6 w-6" />
                        </button>
                        <h1 className="text-xl font-bold flex items-center gap-2 md:hidden truncate">
                            {navigation.find(n => n.href === location.pathname)?.name || 'Werkuren'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                         {/* User info compact for mobile header if needed */}
                    </div>
                </header>
                
                <div className="flex-1 overflow-auto p-4 md:p-8">
                    <div className="max-w-7xl mx-auto w-full">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}
