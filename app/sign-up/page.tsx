"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, Mail, Lock, User, ArrowRight, Eye, EyeOff, CheckCircle } from "lucide-react";

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed");
      } else {
        router.push("/sign-in?registered=true");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = form.password.length === 0 ? 0
    : form.password.length < 6 ? 1
    : form.password.length < 10 ? 2
    : 3;

  const strengthColors = ["", "#FF5A5F", "#FFB547", "#00C896"];
  const strengthLabels = ["", "Weak", "Good", "Strong"];

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0B1020" }}>
      <div className="fixed inset-0 pointer-events-none">
        <div className="orb orb-1" style={{ opacity: 0.5 }} />
        <div className="orb orb-2" style={{ opacity: 0.5 }} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6D5DF6, #8B7CFF)" }}>
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold" style={{ color: "#E8EAF6" }}>ScoutFlow</span>
          </Link>
          <h1 className="text-3xl font-bold mb-2" style={{ color: "#E8EAF6" }}>Create your account</h1>
          <p className="text-sm" style={{ color: "#6B7BA4" }}>Start automating outbound in minutes</p>
        </div>

        <div className="rounded-2xl p-8"
          style={{ background: "rgba(18,25,43,0.8)", border: "1px solid rgba(109,93,246,0.2)", backdropFilter: "blur(20px)" }}>
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm"
              style={{ background: "rgba(255,90,95,0.1)", border: "1px solid rgba(255,90,95,0.3)", color: "#FF5A5F" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "#E8EAF6" }}>Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#6B7BA4" }} />
                <input id="signup-name" type="text" value={form.name} onChange={update("name")}
                  placeholder="Sarah Johnson" required className="input-field pl-10" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "#E8EAF6" }}>Work Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#6B7BA4" }} />
                <input id="signup-email" type="email" value={form.email} onChange={update("email")}
                  placeholder="you@company.com" required className="input-field pl-10" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "#E8EAF6" }}>Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#6B7BA4" }} />
                <input id="signup-password" type={showPass ? "text" : "password"} value={form.password}
                  onChange={update("password")} placeholder="Min. 8 characters" required className="input-field pl-10 pr-10" />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#6B7BA4" }}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {form.password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="h-1 flex-1 rounded-full transition-all"
                        style={{ background: n <= passwordStrength ? strengthColors[passwordStrength] : "rgba(109,93,246,0.15)" }} />
                    ))}
                  </div>
                  <span className="text-xs" style={{ color: strengthColors[passwordStrength] }}>
                    {strengthLabels[passwordStrength]}
                  </span>
                </div>
              )}
            </div>

            <button id="signup-submit" type="submit" disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Create Account <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t" style={{ borderColor: "rgba(109,93,246,0.15)" }}>
            <div className="flex flex-col gap-2">
              {["No credit card required", "Free forever plan available", "Setup in under 5 minutes"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs" style={{ color: "#6B7BA4" }}>
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#00C896" }} />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <p className="text-center mt-4 text-sm" style={{ color: "#6B7BA4" }}>
            Already have an account?{" "}
            <Link href="/sign-in" style={{ color: "#8B7CFF" }} className="font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
