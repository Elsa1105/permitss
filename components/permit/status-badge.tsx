import { Badge } from "@/components/ui/badge";
import { STATE_BADGE, STATE_LABEL } from "@/lib/permits/state-machine";
import type { PermitState } from "@/lib/supabase/types";

export function PermitStatusBadge({ state }: { state: PermitState }) {
  const meta = STATE_BADGE[state];
  return <Badge tone={meta.tone}>{STATE_LABEL[state]}</Badge>;
}
