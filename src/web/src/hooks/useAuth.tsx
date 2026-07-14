import { createContext, useContext, useState } from 'react';

export type Role = 'AUDIENCE' | 'ORGANIZER' | 'SCANNER' | null;

interface AuthContextType {
  role: Role;
  token: string | null;
  login: (token: string, selectedRole: Role) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [role, setRole] = useState<Role>((localStorage.getItem('role') as Role) || null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token') || null);

  const login = (newToken: string, newRole: Role) => {
    setToken(newToken);
    setRole(newRole);
    localStorage.setItem('token', newToken);
    if (newRole) localStorage.setItem('role', newRole);
  };

  const logout = () => {
    setToken(null);
    setRole(null);
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ role, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};