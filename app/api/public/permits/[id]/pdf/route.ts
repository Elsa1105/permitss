import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { buildPermitPdfBytes } from "@/lib/pdf/build-permit-pdf";

// Public, no-auth PDF endpoint — this is what the permit QR code should link
// to (via /public/permits/[id], which embeds/links here) so that scanning
// the QR shows the endorsed PDF record directly, with no login required.
//
// Safe because: (1) this only exposes the same permit that the /public
// permits page already exposes without auth, and (2) it uses the
// service-role client specifically to read data for display, not to allow
// any mutation.
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createServiceRoleSupabase();

  const result = await buildPermitPdfBytes(supabase, id);

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.bytes).buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${result.serialNo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
