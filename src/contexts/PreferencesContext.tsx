import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

export interface UserPreferences {
  favorite_genres: string[];
  preferred_language: string;
  auto_play: boolean;
  sound_quality: string;
}

interface PreferencesContextType {
  preferences: UserPreferences;
  /** Increments on every preference change — use as an effect dependency to refresh recommendations. */
  version: number;
  loading: boolean;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
}

export const GENRE_OPTIONS = [
  'Pop',
  'Hip-Hop',
  'Rock',
  'R&B',
  'EDM',
  'Indie',
  'Bollywood',
  'K-Pop',
  'Lo-Fi',
  'Jazz',
  'Classical',
  'Country',
  'Metal',
  'Afrobeats',
  'Latin',
  'Devotional',
] as const;

export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  ne: 'Nepali',
};

const STORAGE_KEY = 'melodiya-preferences';

const defaultPreferences: UserPreferences = {
  favorite_genres: [],
  preferred_language: 'en',
  auto_play: true,
  sound_quality: 'high',
};

const readLocal = (): UserPreferences => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultPreferences, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultPreferences;
};

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const usePreferences = () => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
};

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(readLocal);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) {
        setPreferences(readLocal());
        setLoading(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          const next: UserPreferences = {
            favorite_genres: data.favorite_genres || [],
            preferred_language: data.preferred_language || 'en',
            auto_play: data.auto_play ?? true,
            sound_quality: data.sound_quality || 'high',
          };
          setPreferences(next);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          setVersion((v) => v + 1);
        }
      } catch (e) {
        console.error('Error loading preferences:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const updatePreferences = useCallback(
    async (updates: Partial<UserPreferences>) => {
      const next = { ...preferences, ...updates };

      // Save remotely before reporting success, so the UI never claims a
      // preference was saved when Supabase rejected it.
      if (user) {
        const { error } = await supabase
          .from('user_preferences')
          .upsert({ user_id: user.id, ...next }, { onConflict: 'user_id' });
        if (error) throw error;
      }

      setPreferences(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* Local persistence is best-effort when browser storage is unavailable. */
      }
      setVersion((v) => v + 1);
    },
    [user, preferences]
  );

  return (
    <PreferencesContext.Provider value={{ preferences, version, loading, updatePreferences }}>
      {children}
    </PreferencesContext.Provider>
  );
};
