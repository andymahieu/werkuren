import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Calendar } from 'lucide-react';

export default function Login() {
    const { login, register } = useAuth();
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isRegister) {
                await register(username, password);
            } else {
                await login(username, password);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
                        <Calendar className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white">Werkuren</h1>
                    <p className="text-slate-400 mt-1">Uren registratie systeem</p>
                </div>

                {/* Card */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
                        {isRegister ? 'Account aanmaken' : 'Inloggen'}
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Gebruikersnaam
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                required
                                autoComplete="username"
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                placeholder="bijv. jan.janssen"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Wachtwoord
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                autoComplete={isRegister ? 'new-password' : 'current-password'}
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                placeholder="••••••••"
                            />
                        </div>

                        {error && (
                            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg border border-red-200 dark:border-red-700">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            {loading ? 'Even geduld...' : isRegister ? 'Aanmaken' : 'Inloggen'}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        {isRegister ? (
                            <>Heb je al een account?{' '}
                                <button onClick={() => { setIsRegister(false); setError(''); }} className="text-blue-600 font-semibold hover:underline">
                                    Inloggen
                                </button>
                            </>
                        ) : (
                            <>Nog geen account?{' '}
                                <button onClick={() => { setIsRegister(true); setError(''); }} className="text-blue-600 font-semibold hover:underline">
                                    Aanmaken
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
