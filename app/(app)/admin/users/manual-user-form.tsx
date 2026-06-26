"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

const ROLE_OPTIONS = [
  { value: "applicant", label: "Applicant" },
  { value: "guest_applicant", label: "Guest Applicant" },
  { value: "contractor", label: "Contractor" },
  { value: "assessor", label: "Safety Assessor" },
  { value: "srm", label: "SRM" },
  { value: "admin", label: "Admin" },
];

const QUALIFICATION_OPTIONS = [
  { value: "hot_work_applicant", label: "Hot Work Applicant" },
  { value: "hot_work_assessor", label: "Hot Work Assessor" },
  { value: "hot_work_srm", label: "Hot Work SRM" },
];

export function ManualUserForm() {
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [form, setForm] = React.useState({
    email: "",
    password: "",
    full_name: "",
    department: "",
    role: "applicant",
    qualified_for: [] as string[],
    active: true,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleQualification(value: string) {
    setForm((current) => ({
      ...current,
      qualified_for: current.qualified_for.includes(value)
        ? current.qualified_for.filter((item) => item !== value)
        : [...current.qualified_for, value],
    }));
  }

  function resetForm() {
    setForm({
      email: "",
      password: "",
      full_name: "",
      department: "",
      role: "applicant",
      qualified_for: [],
      active: true,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.email.trim()) {
      toast.error("Email is required");
      return;
    }

    if (!form.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }

    if (!form.password.trim() || form.password.length < 8) {
      toast.error("Temporary password must be at least 8 characters");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          full_name: form.full_name.trim(),
          department: form.department.trim() || null,
          role: form.role,
          qualified_for: form.qualified_for,
          active: form.active,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error || "Failed to create user");
        return;
      }

      toast.success("User created successfully");
      resetForm();
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Add User Manually
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Add User Manually
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Create a user account without CSV import.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            resetForm();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
        />

        <Input
          label="Temporary Password"
          type="password"
          required
          hint="Minimum 8 characters"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Full Name"
          required
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
        />

        <Input
          label="Department"
          value={form.department}
          onChange={(e) => set("department", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Role"
          required
          value={form.role}
          onChange={(e) => set("role", e.target.value)}
          options={ROLE_OPTIONS}
        />

        <label className="field">
          <span className="field-label">Status</span>
          <select
            className="input"
            value={form.active ? "active" : "inactive"}
            onChange={(e) => set("active", e.target.value === "active")}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <p className="field-label">Qualified For</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {QUALIFICATION_OPTIONS.map((item) => (
            <label
              key={item.value}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={form.qualified_for.includes(item.value)}
                onChange={() => toggleQualification(item.value)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          Create User
        </Button>
      </div>
    </form>
  );
}