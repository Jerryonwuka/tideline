"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import type { Role } from "@/lib/schemas/common";
import {
  changeMembershipAction,
  inviteAction,
  removeMembershipAction,
  revokeInvitationAction,
  type MembersState,
} from "../actions";

export function InviteForm({ orgId, roles }: { orgId: string; roles: Role[] }) {
  const t = useTranslations("members");
  const te = useTranslations("errors");
  const tRoles = useTranslations("roles");
  const [state, action, pending] = useActionState<MembersState, FormData>(inviteAction, {});
  const [copied, setCopied] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="orgId" value={orgId} />
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-phone">{t("phoneLabel")}</Label>
          <Input id="invite-phone" name="phone" type="tel" inputMode="tel" required placeholder="0803 123 4567" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-role">{t("roleLabel")}</Label>
          <NativeSelect id="invite-role" name="role" defaultValue={roles.includes("captain") ? "captain" : roles[0]}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {tRoles(r)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? t("inviting") : t("invite")}
        </Button>
      </div>
      {state.ok && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-xs border border-success/40 bg-success/10 px-3 py-2 text-sm text-foreground"
        >
          <span>{t("invited", { phone: state.invitedPhone ?? "" })}</span>
          {!state.delivered && state.link && (
            <span className="flex flex-wrap items-center gap-2 text-body">
              {t("notDelivered")}
              <code className="max-w-full truncate rounded-xs bg-surface-raised px-2 py-0.5 text-xs">{state.link}</code>
              <button
                type="button"
                className="cursor-pointer text-accent hover:underline"
                onClick={() => navigator.clipboard.writeText(state.link ?? "").then(() => setCopied(true))}
              >
                {copied ? t("copied") : t("copyLink")}
              </button>
            </span>
          )}
        </div>
      )}
    </form>
  );
}

export function RoleSelect({
  membershipId,
  role,
  roles,
  label,
}: {
  membershipId: string;
  role: Role;
  roles: Role[];
  label: string;
}) {
  const tRoles = useTranslations("roles");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<MembersState, FormData>(changeMembershipAction, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="membershipId" value={membershipId} />
      <NativeSelect
        name="role"
        aria-label={label}
        defaultValue={role}
        disabled={pending}
        className="h-9 text-sm"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {tRoles(r)}
          </option>
        ))}
      </NativeSelect>
      {state.error && <span className="text-xs text-danger">{te(state.error)}</span>}
    </form>
  );
}

export function RemoveButton({ membershipId, name }: { membershipId: string; name: string }) {
  const t = useTranslations("members");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<MembersState, FormData>(removeMembershipAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(t("removeConfirm", { name }))) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="membershipId" value={membershipId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {t("remove")}
      </Button>
      {state.error && <span className="text-xs text-danger">{te(state.error)}</span>}
    </form>
  );
}

export function PendingInvite({
  id,
  phone,
  role,
  expiresAt,
}: {
  id: string;
  phone: string;
  role: Role;
  expiresAt: string;
}) {
  const t = useTranslations("members");
  const tRoles = useTranslations("roles");
  const format = useFormatter();
  const [, action, pending] = useActionState<MembersState, FormData>(revokeInvitationAction, {});
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
      <span className="flex flex-col">
        <span className="font-mono text-sm text-foreground">{phone}</span>
        <span className="text-xs text-meta">
          {t("expires", { date: format.dateTime(new Date(expiresAt), { dateStyle: "medium" }) })}
        </span>
      </span>
      <span className="flex items-center gap-3">
        <StatusChip tone="info">{tRoles(role)}</StatusChip>
        <form action={action}>
          <input type="hidden" name="invitationId" value={id} />
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            {t("revoke")}
          </Button>
        </form>
      </span>
    </li>
  );
}
