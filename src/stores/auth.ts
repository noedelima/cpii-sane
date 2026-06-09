import { defineStore } from "pinia";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    session: null,
    user: null,
    loading: true,
  }),
  getters: {
    isAuthenticated: (state) => !!state.user,
  },
  actions: {
    async init() {
      const { data } = await supabase.auth.getSession();
      this.session = data.session;
      this.user = data.session?.user ?? null;
      this.loading = false;

      supabase.auth.onAuthStateChange((_event, session) => {
        this.session = session;
        this.user = session?.user ?? null;
      });
    },
    async signInWithMagicLink(email: string) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (error) throw error;
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  },
});
