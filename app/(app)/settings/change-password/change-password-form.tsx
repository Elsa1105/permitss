"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body.error || "Failed to update password");
        return;
      }

      toast.success("Password updated");
      router.replace(forced ? "/dashboard" : "/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        label="New Password"
        type="password"
        name="password"
        autoComplete="new-password"
        required
        hint="Minimum 8 characters."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Input
        label="Confirm New Password"
        type="password"
        name="confirm"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <Button type="submit" loading={loading} className="w-full">
        Update Password
      </Button>
    </form>
  );
}
