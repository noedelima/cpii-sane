import { defineStore } from "pinia";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Papel, Perfil } from "@/types/database";

interface AuthState {
  session: Session | null;
  user: User | null;
  perfil: Perfil | null;
  loading: boolean;
  _initPromise: Promise<void> | null;
}

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    session: null,
    user: null,
    perfil: null,
    loading: true,
    _initPromise: null,
  }),
  getters: {
    isAuthenticated: (state) => !!state.user,
    papel: (state): Papel | null => state.perfil?.papel ?? null,
    isAdmin: (state) => state.perfil?.papel === "admin",
    /** SANE ou admin: pode editar itens, empenhos e NFs. */
    isSane: (state) => state.perfil?.papel === "sane" || state.perfil?.papel === "admin",
    /** Campus (ou acima): pode cadastrar recibos. */
    isCampus: (state) =>
      state.perfil?.papel === "campus" ||
      state.perfil?.papel === "sane" ||
      state.perfil?.papel === "admin",
  },
  actions: {
    /** Idempotente: garante uma única inicialização (usada pelo router guard). */
    ensureInit(): Promise<void> {
      if (!this._initPromise) this._initPromise = this._init();
      return this._initPromise;
    },
    async _init() {
      const { data } = await supabase.auth.getSession();
      this.session = data.session;
      this.user = data.session?.user ?? null;
      await this.loadPerfil();
      this.loading = false;

      supabase.auth.onAuthStateChange((_event, session) => {
        const changedUser = session?.user?.id !== this.user?.id;
        this.session = session;
        this.user = session?.user ?? null;
        if (!session) this.perfil = null;
        else if (changedUser) void this.loadPerfil();
      });
    },
    async loadPerfil() {
      if (!this.user) {
        this.perfil = null;
        return;
      }
      const { data, error } = await supabase
        .from("perfis")
        .select("*")
        .eq("id", this.user.id)
        .maybeSingle();
      if (error) {
        console.error("[auth] falha ao carregar perfil:", error.message);
        this.perfil = null;
        return;
      }
      this.perfil = (data as Perfil | null) ?? null;
    },
    async signInWithPassword(email: string, password: string) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await this.loadPerfil();
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
    async updatePassword(newPassword: string) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    async signOut() {
      await supabase.auth.signOut();
      this.perfil = null;
    },
  },
});
