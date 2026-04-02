import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

type LoginProps = {
  onLogin: (user: { id: string; username: string; role: string }) => void;
};

export default function LoginPage({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Login failed");
      }
      return response.json();
    },
    onSuccess: (user) => {
      onLogin(user);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-slate-900 to-zinc-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-800/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md" data-testid="card-login">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/leapup-logo.png"
            alt="LeapUp"
            className="h-10 mb-8 brightness-0 invert opacity-90"
            data-testid="img-leapup-logo"
          />
          <div className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mb-4">
            <Lock className="h-7 w-7 text-violet-400" />
          </div>
          <h1
            className="text-3xl font-bold text-white tracking-tight"
            data-testid="heading-login"
          >
            AI Mock Viva
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Admin Portal — Sign in to continue
          </p>
        </div>

        <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-2xl shadow-2xl backdrop-blur-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-zinc-300 text-sm font-medium">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500 h-11 rounded-xl focus:border-violet-500 focus:ring-violet-500/20"
                data-testid="input-username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300 text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500 h-11 rounded-xl pr-11 focus:border-violet-500 focus:ring-violet-500/20"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
                  data-testid="button-toggle-password"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-all mt-2"
              disabled={loginMutation.isPending || !username.trim() || !password.trim()}
              data-testid="button-login"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          © {new Date().getFullYear()} LeapUp. All rights reserved.
        </p>
      </div>
    </div>
  );
}
