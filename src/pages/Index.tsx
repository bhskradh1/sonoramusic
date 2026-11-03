import React from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { AuthPage } from '@/components/auth/AuthPage';
import { SonoraApp } from '@/components/music/MelodiyaApp';
import { useAuth } from '@/components/auth/AuthProvider';
import { PreferencesProvider } from '@/contexts/PreferencesContext';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    // Same look as the splash in index.html so there is no visible jump
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <span className="sonora-brand-mark h-16 w-16"><i/><i/><i/><i/></span>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <SonoraApp />;
};

const Index = () => {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <AppContent />
      </PreferencesProvider>
    </AuthProvider>
  );
};

export default Index;
