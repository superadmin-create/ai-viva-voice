import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminPanel from "@/pages/admin";
import VivaPage from "@/pages/viva";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

type AuthUser = {
  id: string;
  username: string;
  role: string;
};

function AuthenticatedRouter({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  return (
    <Switch>
      <Route path="/">
        <AdminPanel user={user} onLogout={onLogout} />
      </Route>
      <Route path="/:subject" component={VivaPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function UnauthenticatedRouter({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  return (
    <Switch>
      <Route path="/">
        <LoginPage onLogin={onLogin} />
      </Route>
      <Route path="/:subject" component={VivaPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me");
      if (!response.ok) return null;
      return response.json();
    },
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!isLoading) {
      setUser(data || null);
      setChecked(true);
    }
  }, [data, isLoading]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    queryClient.clear();
  };

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (user) {
    return <AuthenticatedRouter user={user} onLogout={handleLogout} />;
  }

  return <UnauthenticatedRouter onLogin={(u) => setUser(u)} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster position="top-right" richColors />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
