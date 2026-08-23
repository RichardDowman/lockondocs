"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, getSession } from "next-auth/react";
import { Mail, Lock, User, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { validatePassword, PASSWORD_POLICY_HINT } from "@/lib/validation";

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter your email and password.");
      return;
    }
    const pw = validatePassword(password);
    if (!pw.ok) {
      toast.error(pw.error ?? "Please choose a stronger password.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not create your account.");
        setLoading(false);
        return;
      }

      const signInRes = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (signInRes?.error) {
        toast.error("Account created. Please sign in.");
        window.location.replace("/login");
        return;
      }
      toast.success("Your account is ready.");
      // In an in-app browser / webview the new session cookie is not always
      // readable immediately, so navigating straight to /home can bounce the
      // user back to /login. Poll getSession until the cookie is committed,
      // THEN do a full-document navigation so the cookie is sent on the request.
      for (let i = 0; i < 15; i++) {
        const session = await getSession();
        if ((session?.user as any)?.id) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      // replace, not assign: pushing would leave /register sitting behind the
      // vault, so the first back press would land on the sign-up screen again
      // instead of leaving the app. Same reason the sign-in form uses replace.
      window.location.replace("/home");
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" suppressHydrationWarning>
      <div className="space-y-2" suppressHydrationWarning>
        <Label htmlFor="name">Name</Label>
        <div className="relative" suppressHydrationWarning>
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="space-y-2" suppressHydrationWarning>
        <Label htmlFor="email">Email</Label>
        <div className="relative" suppressHydrationWarning>
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10"
            required
          />
        </div>
      </div>

      <div className="space-y-2" suppressHydrationWarning>
        <Label htmlFor="password">Password</Label>
        <div className="relative" suppressHydrationWarning>
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-10"
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_HINT}</p>
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
