import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase, Profile } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  fetchProfile: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
  startActiveCheck: () => () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,
  profileError: null,

  setSession: (session) => {
    set({ session, user: session?.user ?? null });
  },

  setProfile: (profile) => {
    set({ profile });
  },

  fetchProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      set({ profile: null, loading: false, profileError: error.message });
      return;
    }

    if (!data) {
      await supabase.auth.signOut();
      set({
        profile: null,
        session: null,
        user: null,
        loading: false,
        profileError: 'No profile found for this account. Please contact your administrator.',
      });
      return;
    }

    if (!data.is_active) {
      await supabase.auth.signOut();
      set({
        profile: null,
        session: null,
        user: null,
        loading: false,
        profileError: 'Your account has been deactivated. Please contact your administrator.',
      });
      return;
    }

    set({ profile: data, loading: false, profileError: null });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, loading: false, profileError: null });
  },

  startActiveCheck: () => {
    const interval = setInterval(async () => {
      const { user } = get();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', user.id)
        .maybeSingle();
      if (data && !data.is_active) {
        await supabase.auth.signOut();
        set({
          profile: null, session: null, user: null, loading: false,
          profileError: 'Your account has been deactivated. Please contact your administrator.',
        });
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  },
}));
