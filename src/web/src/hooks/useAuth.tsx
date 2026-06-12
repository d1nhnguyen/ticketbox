import { createContext, useContext, useState, type ReactNode } from 'react';

type Role = 'AUDIENCE' | 'ORGANIZER' | 'SCANNER' | null;

interface AuthContextType {
  role: Role;
  login: (selectedRole: Role) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<Role>(null);

  
  const login = (selectedRole: Role) => {
    setRole(selectedRole);
    
    localStorage.setItem('temp_role', selectedRole || ''); 
  };

  const logout = () => {
    setRole(null);
    localStorage.removeItem('temp_role');
  };

  return (
    <AuthContext.Provider value={{ role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};