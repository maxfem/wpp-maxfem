import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

type Tenant = Tables<"tenants">;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  currentTenant: Tenant | null;
  tenants: Tenant[];
  setCurrentTenant: (tenant: Tenant) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      supabase
        .from("tenants")
        .select("*")
        .then(({ data }) => {
          if (data && data.length > 0) {
            setTenants(data);
            const saved = localStorage.getItem("martz_tenant_id");
            const found = data.find((t) => t.id === saved);
            setCurrentTenant(found || data[0]);
          }
        });
    } else {
      setTenants([]);
      setCurrentTenant(null);
    }
  }, [user]);

  const handleSetCurrentTenant = (tenant: Tenant) => {
    setCurrentTenant(tenant);
    localStorage.setItem("martz_tenant_id", tenant.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setCurrentTenant(null);
    setTenants([]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        currentTenant,
        tenants,
        setCurrentTenant: handleSetCurrentTenant,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
