"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { UserRow } from "@/lib/supabase/types";

const ROLE_OPTIONS = [
  { value: "applicant", label: "Applicant" },
  { value: "guest_applicant", label: "Guest Applicant" },
  { value: "contractor", label: "Contractor" },
  { value: "assessor", label: "Safety Assessor" },
  { value: "srm", label: "SRM" },
  { value: "admin", label: "Admin" },
];

const QUALIFICATION_OPTIONS = [
  "hot_work_applicant",
  "hot_work_assessor",
  "hot_work_srm",
];

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();

  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const [editForm, setEditForm] = React.useState<{
    full_name: string;
    department: string;
    role: UserRow["role"];
    qualified_for: string[];
    active: boolean;
  } | null>(null);

  function startEdit(user: UserRow) {
    setEditingId(user.id);
    setEditForm({
      full_name: user.full_name,
      department: user.department ?? "",
      role: user.role,
      qualified_for: user.qualified_for ?? [],
      active: user.active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  function toggleQualification(value: string) {
    setEditForm((current) => {
      if (!current) return current;

      return {
        ...current,
        qualified_for: current.qualified_for.includes(value)
          ? current.qualified_for.filter((item) => item !== value)
          : [...current.qualified_for, value],
      };
    });
  }

  async function saveEdit(user: UserRow) {
    if (!editForm) return;

    if (!editForm.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }

    if (user.id === currentUserId && editForm.active === false) {
      toast.error("You cannot deactivate your own admin account");
      return;
    }

    if (user.id === currentUserId && editForm.role !== "admin") {
      toast.error("You cannot remove your own admin role");
      return;
    }

    setBusyId(user.id);

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editForm.full_name.trim(),
          department: editForm.department.trim() || null,
          role: editForm.role,
          qualified_for: editForm.qualified_for,
          active: editForm.active,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error || "Update failed");
        return;
      }

      toast.success("User updated");
      cancelEdit();
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(user: UserRow) {
    if (user.id === currentUserId && user.active) {
      toast.error("You cannot deactivate your own admin account");
      return;
    }

    setBusyId(user.id);

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active }),
      });

      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error || "Update failed");
        return;
      }

      toast.success(
        `${user.full_name} ${!user.active ? "activated" : "deactivated"}`,
      );

      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (!users.length) {
    return (
      <div className="p-6 text-sm text-slate-500 text-center">No users yet.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Department</th>
            <th>Role</th>
            <th>Qualified for</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>

        <tbody>
          {users.map((user) => {
            const isEditing = editingId === user.id && editForm;
            const isSelf = user.id === currentUserId;

            if (isEditing) {
              return (
                <tr key={user.id}>
                  <td className="min-w-[180px] align-top">
                    <Input
                      label="Name"
                      value={editForm.full_name}
                      onChange={(e) =>
                        setEditForm((current) =>
                          current
                            ? { ...current, full_name: e.target.value }
                            : current,
                        )
                      }
                    />
                  </td>

                  <td className="text-slate-600 align-top">{user.email}</td>

                  <td className="min-w-[160px] align-top">
                    <Input
                      label="Department"
                      value={editForm.department}
                      onChange={(e) =>
                        setEditForm((current) =>
                          current
                            ? { ...current, department: e.target.value }
                            : current,
                        )
                      }
                    />
                  </td>

                  <td className="min-w-[170px] align-top">
                    <Select
                      label="Role"
                      value={editForm.role}
                      onChange={(e) =>
                        setEditForm((current) =>
                          current
                            ? {
                                ...current,
                                role: e.target.value as UserRow["role"],
                              }
                            : current,
                        )
                      }
                      options={ROLE_OPTIONS}
                      disabled={isSelf}
                    />
                  </td>

                  <td className="min-w-[220px] align-top">
                    <div className="space-y-1">
                      {QUALIFICATION_OPTIONS.map((q) => (
                        <label
                          key={q}
                          className="flex items-center gap-2 text-xs text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={editForm.qualified_for.includes(q)}
                            onChange={() => toggleQualification(q)}
                          />
                          <span>{q}</span>
                        </label>
                      ))}
                    </div>
                  </td>

                  <td className="align-top">
                    <select
                      className="input min-w-[110px]"
                      value={editForm.active ? "active" : "inactive"}
                      onChange={(e) =>
                        setEditForm((current) =>
                          current
                            ? {
                                ...current,
                                active: e.target.value === "active",
                              }
                            : current,
                        )
                      }
                      disabled={isSelf}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </td>

                  <td className="text-right align-top">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        loading={busyId === user.id}
                        onClick={() => saveEdit(user)}
                      >
                        Save
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            }

            return (
              <tr key={user.id}>
                <td className="font-medium">
                  {user.full_name}
                  {isSelf ? (
                    <span className="ml-2 text-xs text-slate-400">(you)</span>
                  ) : null}
                </td>

                <td className="text-slate-600">{user.email}</td>

                <td className="text-slate-600">{user.department ?? "—"}</td>

                <td>
                  <Badge tone="info" className="capitalize">
                    {user.role}
                  </Badge>
                </td>

                <td className="text-xs text-slate-600">
                  {(user.qualified_for ?? []).length
                    ? user.qualified_for.join(", ")
                    : "—"}
                </td>

                <td>
                  <Badge tone={user.active ? "ok" : "neutral"}>
                    {user.active ? "Active" : "Inactive"}
                  </Badge>
                </td>

                <td className="text-right">
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                      disabled={busyId === user.id}
                      onClick={() => startEdit(user)}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="text-sm text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={busyId === user.id || (isSelf && user.active)}
                      onClick={() => toggleActive(user)}
                      title={
                        isSelf && user.active
                          ? "You cannot deactivate your own account"
                          : undefined
                      }
                    >
                      {user.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}