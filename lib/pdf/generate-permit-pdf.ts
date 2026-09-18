import "server-only";
import QRCode from "qrcode";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type {
  PermitDocumentRow,
  PermitEndorsementRow,
  PermitPhotoRow,
  PermitStageRow,
  PermitWithJoins,
} from "@/lib/supabase/types";

export interface PdfBundle {
  permit: PermitWithJoins;
  stages: PermitStageRow[];
  endorsements: PermitEndorsementRow[];
  photos: (PermitPhotoRow & {
    bytes?: Uint8Array;
    mime?: string;
    uploaderName?: string | null;
  })[];
  documents?: (PermitDocumentRow & { signedUrl?: string })[];
  publicPermitUrl?: string;
}

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 32;
const RIGHT_PANEL_W = 112;

const STAGE_III_SIMOPS_WORDING =
  "I have reviewed the permit for SIMOPS coordination, work location, schedule, and potential conflicts with other activities. Based on the submitted permit details and Safety Assessor endorsement, I confirm that the hot work may proceed under coordination approval.";

const COLOR = {
  ink: rgb(0.06, 0.09, 0.16),
  muted: rgb(0.4, 0.45, 0.55),
  border: rgb(0.78, 0.82, 0.88),
  lightBorder: rgb(0.88, 0.91, 0.95),
  band: rgb(0.88, 0.94, 1),
  bandText: rgb(0.06, 0.16, 0.42),
  soft: rgb(0.97, 0.98, 1),
  ok: rgb(0.05, 0.55, 0.35),
  bad: rgb(0.78, 0.18, 0.18),
};

interface DrawCtx {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  y: number;
}

type PermitExtra = PermitWithJoins & {
  contractor_company?: string | null;
  contractor_supervisor_name?: string | null;
  contractor_supervisor_registration_no?: string | null;
  worker_briefing_acknowledged?: boolean | null;
  top_controls_summary?: string | null;
  display_applicant_name?: string | null;
  display_applicant_department?: string | null;
  job_type?: string | null;
  other_hazard_text?: string | null;
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";

  const d = new Date(s);

  return d.toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function fmtTime(s: string | null | undefined): string {
  if (!s) return "—";

  return new Date(s).toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function text(
  page: PDFPage,
  s: string,
  x: number,
  yFromTop: number,
  opts: {
    font: PDFFont;
    size?: number;
    color?: ReturnType<typeof rgb>;
    maxWidth?: number;
  },
) {
  const size = opts.size ?? 9;
  const color = opts.color ?? COLOR.ink;

  page.drawText(s, {
    x,
    y: A4.h - yFromTop - size,
    size,
    font: opts.font,
    color,
    maxWidth: opts.maxWidth,
  });
}

function box(
  page: PDFPage,
  x: number,
  yFromTop: number,
  w: number,
  h: number,
  fill?: ReturnType<typeof rgb>,
  border = COLOR.border,
) {
  page.drawRectangle({
    x,
    y: A4.h - yFromTop - h,
    width: w,
    height: h,
    borderColor: border,
    borderWidth: 0.7,
    color: fill,
  });
}

function line(
  page: PDFPage,
  x1: number,
  y1FromTop: number,
  x2: number,
  y2FromTop: number,
  thickness = 0.5,
) {
  page.drawLine({
    start: { x: x1, y: A4.h - y1FromTop },
    end: { x: x2, y: A4.h - y2FromTop },
    color: COLOR.border,
    thickness,
  });
}

function band(ctx: DrawCtx, label: string, w: number) {
  const h = 17;

  box(ctx.page, MARGIN, ctx.y, w, h, COLOR.band);

  text(ctx.page, label, MARGIN + 7, ctx.y + 4.5, {
    font: ctx.fontBold,
    size: 8.7,
    color: COLOR.bandText,
  });

  ctx.y += h;
}

function wrap(s: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = String(s || "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;

    if (font.widthOfTextAtSize(test, size) > maxW) {
      if (current) out.push(current);
      current = word;
    } else {
      current = test;
    }
  }

  if (current) out.push(current);

  return out.length ? out : ["—"];
}

export async function generatePermitPdf(bundle: PdfBundle): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([A4.w, A4.h]);
  const ctx: DrawCtx = { page, font, fontBold, y: MARGIN };

  const contentW = A4.w - 2 * MARGIN;
  const leftW = contentW - RIGHT_PANEL_W - 10;

  drawHeader(ctx, contentW);
  ctx.y += 6;

  const headerStartY = ctx.y;

  drawHeaderFields(ctx, bundle, leftW);

  const rightPanelX = A4.w - MARGIN - RIGHT_PANEL_W;

  drawDayPanel(
    ctx,
    bundle.endorsements,
    rightPanelX,
    headerStartY,
    RIGHT_PANEL_W,
  );

  if (bundle.publicPermitUrl) {
    await drawQrCode(
      doc,
      ctx,
      bundle.publicPermitUrl,
      rightPanelX,
      headerStartY + 28 + 13 * 25 + 8,
      RIGHT_PANEL_W,
    );
  }

  ctx.y += 5;

  band(ctx, "SUPPORTING DOCUMENTS / RA", leftW);
  drawDocuments(ctx, bundle.documents, leftW);
  ctx.y += 5;

  band(ctx, "STAGE I : RAISING OF PERMIT-TO-WORK BY FOREMAN OR SUPERVISOR", leftW);
  drawStage1(ctx, bundle, leftW);
  ctx.y += 5;

  band(ctx, "STAGE II : ENDORSEMENT BY SAFETY ASSESSOR", leftW);
  drawStage2(ctx, bundle, leftW);
  ctx.y += 5;

  band(
    ctx,
    "STAGE III : APPROVED BY SHIP REPAIR-MANAGER / PROJECT MANAGER",
    leftW,
  );
  drawStage3(ctx, bundle, leftW);
  ctx.y += 5;

  band(ctx, "STAGE IV : NOTIFICATION OF COMPLETION OF HOT WORK", leftW);
  drawStage4(ctx, bundle, leftW);

  const photosWithBytes = bundle.photos.filter(
    (p) => p.bytes && p.bytes.length > 0,
  );

  if (photosWithBytes.length) {
    await drawPhotos(doc, photosWithBytes, font, fontBold, bundle.permit.serial_no);
  }

  return doc.save();
}

function formatHazardsForPdf(permit: PermitExtra) {
  return permit.hazard_types
    .map((hazard) => {
      if (hazard === "other" && permit.other_hazard_text) {
        return `Other: ${permit.other_hazard_text}`;
      }

      return hazard
        .replaceAll("_", " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    })
    .join(", ");
}

function documentTypeLabel(type: PermitDocumentRow["document_type"]) {
  switch (type) {
    case "risk_assessment":
      return "Risk Assessment / RA";
    case "jsa":
      return "JSA";
    case "method_statement":
      return "Method Statement";
    case "gas_test_record":
      return "Gas Test Record";
    default:
      return "Other";
  }
}

function drawDocuments(
  ctx: DrawCtx,
  documents: (PermitDocumentRow & { signedUrl?: string })[] | undefined,
  w: number,
) {
  if (!documents?.length) {
    text(ctx.page, "No supporting documents uploaded.", MARGIN + 7, ctx.y, {
      font: ctx.font,
      size: 8,
      color: COLOR.muted,
    });

    ctx.y += 12;
    return;
  }

  for (const doc of documents.slice(0, 6)) {
    const label = documentTypeLabel(doc.document_type);
    const fileSize =
      typeof doc.file_size === "number" && doc.file_size > 0
        ? `${(doc.file_size / 1024 / 1024).toFixed(2)} MB`
        : "—";

    const lineText = `${label}: ${doc.file_name} (${fileSize})`;
    const lines = wrap(lineText, ctx.font, 8, w - 14);

    for (const lineItem of lines.slice(0, 2)) {
      text(ctx.page, lineItem, MARGIN + 7, ctx.y, {
        font: ctx.font,
        size: 8,
      });

      ctx.y += 10;
    }
  }

  if (documents.length > 6) {
    text(
      ctx.page,
      `+${documents.length - 6} more supporting document(s).`,
      MARGIN + 7,
      ctx.y,
      {
        font: ctx.font,
        size: 8,
        color: COLOR.muted,
      },
    );

    ctx.y += 10;
  }
}

function drawHeaderFields(ctx: DrawCtx, bundle: PdfBundle, leftW: number) {
  const permit = bundle.permit as PermitExtra;

  drawSerialBlock(ctx, permit.serial_no, leftW);
  ctx.y += 4;

  const fieldH = 28;
  const colGap = 8;
  const colW = leftW / 2 - colGap / 2;

  drawField(
    ctx,
    "JOB TYPE",
    permit.job_type || "—",
    MARGIN,
    ctx.y,
    colW,
    fieldH,
  );

  drawField(
    ctx,
    "VESSEL / PROJECT",
    permit.vessel_project,
    MARGIN + colW + colGap,
    ctx.y,
    colW,
    fieldH,
  );
  ctx.y += fieldH + 4;

  drawField(
    ctx,
    "LOCATION OF WORK",
    permit.location_of_work,
    MARGIN,
    ctx.y,
    colW,
    fieldH,
  );

  drawField(
    ctx,
    "DATE OF COMMENCEMENT",
    fmtDate(permit.date_commencement),
    MARGIN + colW + colGap,
    ctx.y,
    colW,
    fieldH,
  );
  ctx.y += fieldH + 4;

  drawField(
    ctx,
    "DESCRIPTION OF WORK",
    permit.description,
    MARGIN,
    ctx.y,
    colW,
    fieldH + 16,
  );

  drawField(
    ctx,
    "DATE OF COMPLETION",
    fmtDate(permit.date_completion),
    MARGIN + colW + colGap,
    ctx.y,
    colW,
    fieldH + 16,
  );
  ctx.y += fieldH + 20;

  drawField(
    ctx,
    "TYPE OF HAZARD",
    formatHazardsForPdf(permit),
    MARGIN,
    ctx.y,
    colW,
    fieldH,
  );

  drawField(
    ctx,
    "CONTRACTOR",
    permit.contractor,
    MARGIN + colW + colGap,
    ctx.y,
    colW,
    fieldH,
  );

  ctx.y += fieldH + 4;

  if (
    permit.contractor_company ||
    permit.contractor_supervisor_name ||
    permit.contractor_supervisor_registration_no ||
    permit.top_controls_summary
  ) {
    drawField(
      ctx,
      "CONTRACTOR / CONTROL DETAILS",
      [
        permit.contractor_company
          ? `Company: ${permit.contractor_company}`
          : null,
        permit.contractor_supervisor_name
          ? `Supervisor: ${permit.contractor_supervisor_name}`
          : null,
        permit.contractor_supervisor_registration_no
          ? `Reg. No.: ${permit.contractor_supervisor_registration_no}`
          : null,
        permit.top_controls_summary
          ? `Controls: ${permit.top_controls_summary}`
          : null,
      ]
        .filter(Boolean)
        .join(" | "),
      MARGIN,
      ctx.y,
      leftW,
      28,
    );

    ctx.y += 32;
  }
}

async function drawQrCode(
  doc: PDFDocument,
  ctx: DrawCtx,
  publicPermitUrl: string,
  x: number,
  yFromTop: number,
  panelW: number,
) {
  try {
    const qrDataUrl = await QRCode.toDataURL(publicPermitUrl, {
      margin: 1,
      width: 260,
    });

    const base64 = qrDataUrl.split(",")[1];

    if (!base64) return;

    const qrBytes = Uint8Array.from(Buffer.from(base64, "base64"));
    const qrImage = await doc.embedPng(qrBytes);

    const titleH = 18;
    const qrSize = Math.min(88, panelW - 10);
    const blockH = titleH + qrSize + 34;

    box(ctx.page, x, yFromTop, panelW, blockH, rgb(1, 1, 1));

    text(ctx.page, "LIVE PERMIT", x + 7, yFromTop + 5, {
      font: ctx.fontBold,
      size: 8,
      color: COLOR.bandText,
    });

    const qrX = x + (panelW - qrSize) / 2;
    const qrTop = yFromTop + titleH + 4;

    ctx.page.drawImage(qrImage, {
      x: qrX,
      y: A4.h - qrTop - qrSize,
      width: qrSize,
      height: qrSize,
    });

    text(ctx.page, "Scan QR to view", x + 14, qrTop + qrSize + 7, {
      font: ctx.font,
      size: 6.5,
      color: COLOR.muted,
    });

    text(ctx.page, "current permit status", x + 10, qrTop + qrSize + 16, {
      font: ctx.font,
      size: 6.2,
      color: COLOR.muted,
    });
  } catch {
    // QR generation should not block PDF generation.
  }
}

function drawHeader(ctx: DrawCtx, w: number) {
  const h = 58;

  box(ctx.page, MARGIN, ctx.y, 58, h, rgb(1, 1, 1));

  ctx.page.drawCircle({
    x: MARGIN + 29,
    y: A4.h - ctx.y - 29,
    size: 17,
    color: COLOR.band,
    borderColor: COLOR.bandText,
    borderWidth: 0.7,
  });

  text(ctx.page, "F", MARGIN + 24, ctx.y + 18, {
    font: ctx.fontBold,
    size: 20,
    color: COLOR.bandText,
  });

  box(ctx.page, MARGIN + 58, ctx.y, w - 58 - 218, h, rgb(1, 1, 1));

  text(ctx.page, "FRANKLIN OFFSHORE INTERNATIONAL PTE LTD", MARGIN + 68, ctx.y + 7, {
    font: ctx.fontBold,
    size: 10.7,
  });

  text(ctx.page, "Title:", MARGIN + 68, ctx.y + 30, {
    font: ctx.fontBold,
    size: 8.5,
  });

  text(ctx.page, "Hot Work Permit (Onshore)", MARGIN + 108, ctx.y + 30, {
    font: ctx.font,
    size: 8.5,
  });

  text(ctx.page, "Approved By: GM", MARGIN + 68, ctx.y + 44, {
    font: ctx.font,
    size: 8,
    color: COLOR.muted,
  });

  const rx = MARGIN + w - 218;
  const rw = 218;

  box(ctx.page, rx, ctx.y, rw, h, rgb(1, 1, 1));
  drawMetaRow(ctx, rx, ctx.y, rw, "Form No.:", "FOI-SG-057");
  drawMetaRow(ctx, rx, ctx.y + 19.3, rw, "Rev.:", "0");
  drawMetaRow(ctx, rx, ctx.y + 38.6, rw, "Effective Date:", "04/02/2013");

  ctx.y += h;
}

function drawMetaRow(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  k: string,
  v: string,
) {
  line(ctx.page, x, y + 19.3, x + w, y + 19.3, 0.45);
  line(ctx.page, x + w / 2, y, x + w / 2, y + 19.3, 0.45);

  text(ctx.page, k, x + 6, y + 5.2, {
    font: ctx.fontBold,
    size: 7.8,
  });

  text(ctx.page, v, x + w / 2 + 6, y + 5.2, {
    font: ctx.font,
    size: 7.8,
  });
}

function drawSerialBlock(ctx: DrawCtx, serial: string, w: number) {
  const h = 18;

  box(ctx.page, MARGIN, ctx.y, w, h, COLOR.soft);

  text(ctx.page, "SERIAL NO.", MARGIN + 7, ctx.y + 5, {
    font: ctx.fontBold,
    size: 8.3,
    color: COLOR.bandText,
  });

  text(ctx.page, serial, MARGIN + 78, ctx.y + 5, {
    font: ctx.fontBold,
    size: 9.2,
  });

  ctx.y += h;
}

function drawField(
  ctx: DrawCtx,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  box(ctx.page, x, y, w, h, rgb(1, 1, 1), COLOR.lightBorder);

  text(ctx.page, label, x + 6, y + 4, {
    font: ctx.fontBold,
    size: 7.1,
    color: COLOR.muted,
  });

  const lines = wrap(value || "—", ctx.font, 8.3, w - 12);
  let yy = y + 15;

  for (const lineText of lines.slice(0, Math.floor((h - 15) / 10))) {
    text(ctx.page, lineText, x + 6, yy, {
      font: ctx.font,
      size: 8.3,
    });
    yy += 10;
  }
}

function drawDayPanel(
  ctx: DrawCtx,
  endorsements: PermitEndorsementRow[],
  x: number,
  yStart: number,
  w: number,
) {
  const titleH = 28;

  box(ctx.page, x, yStart, w, titleH, COLOR.band);

  text(ctx.page, "ENDORSEMENT", x + 7, yStart + 4, {
    font: ctx.fontBold,
    size: 7.8,
    color: COLOR.bandText,
  });

  text(ctx.page, "BY SRM", x + 7, yStart + 16, {
    font: ctx.fontBold,
    size: 7.8,
    color: COLOR.bandText,
  });

  const cellH = 34;
  let y = yStart + titleH;
  const map = new Map(endorsements.map((e) => [e.day_number, e]));

  for (let day = 2; day <= 14; day += 1) {
    const e = map.get(day);
    const thisCellH = e && e.action !== "continue" && e.remarks ? cellH + 10 : cellH;

    box(ctx.page, x, y, w, thisCellH, rgb(1, 1, 1));

    text(ctx.page, `DAY ${day}`, x + 7, y + 4, {
      font: ctx.fontBold,
      size: 7.5,
    });

    if (e) {
      const color =
        e.action === "continue"
          ? COLOR.ok
          : e.action === "reject" || e.action === "revoke"
            ? COLOR.bad
            : COLOR.ink;

      text(ctx.page, e.action.toUpperCase(), x + 48, y + 4, {
        font: ctx.fontBold,
        size: 6.7,
        color,
      });

      text(ctx.page, `${fmtDate(e.ts)}  ${fmtTime(e.ts)}`, x + 7, y + 15, {
        font: ctx.font,
        size: 6.2,
        color: COLOR.muted,
      });

      if (e.action !== "continue" && e.remarks) {
        const reasonLines = wrap(`Reason: ${e.remarks}`, ctx.font, 6, w - 14);

        reasonLines.slice(0, 2).forEach((lineText, lineIdx) => {
          text(ctx.page, lineText, x + 7, y + 25 + lineIdx * 8, {
            font: ctx.font,
            size: 6,
            color: COLOR.bad,
          });
        });
      }
    } else {
      text(ctx.page, "Pending", x + 48, y + 4, {
        font: ctx.font,
        size: 6.7,
        color: COLOR.muted,
      });
    }

    y += thisCellH;
  }
}

function drawStage1(ctx: DrawCtx, b: PdfBundle, w: number) {
  const stage = b.stages.find((s) => s.stage === "I");
  const data = (stage?.data as Record<string, boolean>) ?? {};

  const declaration =
    "I have taken measures to render the area safe and fit for hot work application. I shall comply with the following requirements prior to commencement and throughout the duration of hot work.";

  const lines = wrap(declaration, ctx.font, 8.3, w - 12);

  for (const lineText of lines) {
    text(ctx.page, lineText, MARGIN + 7, ctx.y, {
      font: ctx.font,
      size: 8.3,
    });
    ctx.y += 10;
  }

  ctx.y += 3;

  drawCheck(ctx, data.check_ventilation, "Maintain adequate ventilation & lighting.");
  drawCheck(ctx, data.check_display, "Prominent display of hot work permit with sketch.");
  drawCheck(ctx, data.check_watchman, "Provide watchman with fire extinguisher or hose.");

  ctx.y += 2;

  drawSignatureRow(ctx, w, {
    name: b.permit.applicant?.full_name ?? "",
    department: b.permit.applicant?.department ?? "",
    submitted_at: stage?.submitted_at,
  });
}

function drawStage2(ctx: DrawCtx, b: PdfBundle, w: number) {
  const stage = b.stages.find((s) => s.stage === "II");

  const data =
    (stage?.data as {
      fit?: boolean;
      remarks?: string;
      position?: string;
      checklist?: Record<string, boolean | string>;
      checklist_status?: Record<string, string>;
      corrective_action?: string;
      rectification_date?: string;
    }) ?? {};

  const intro =
    "I have reviewed the permit submission, supporting evidence, work conditions, and required safety controls. Based on this condition verification, I confirm whether the stated hot work location is fit to proceed.";

  const introLines = wrap(intro, ctx.font, 8.2, w - 12);

  for (const lineText of introLines.slice(0, 3)) {
    text(ctx.page, lineText, MARGIN + 7, ctx.y, {
      font: ctx.font,
      size: 8.2,
    });
    ctx.y += 9.7;
  }

  ctx.y += 2;

  if (!stage) {
    text(ctx.page, "Pending Safety Assessor condition verification.", MARGIN + 7, ctx.y, {
      font: ctx.font,
      size: 8.5,
      color: COLOR.muted,
    });

    ctx.y += 14;
    return;
  }

  const resultLabel =
    data.fit === true ? "FIT FOR HOT WORK" : "NOT FIT FOR HOT WORK";

  box(
    ctx.page,
    MARGIN + 7,
    ctx.y,
    Math.min(180, w - 14),
    16,
    data.fit === true ? rgb(0.92, 1, 0.96) : rgb(1, 0.93, 0.93),
    data.fit === true ? COLOR.ok : COLOR.bad,
  );

  text(ctx.page, resultLabel, MARGIN + 14, ctx.y + 4.5, {
    font: ctx.fontBold,
    size: 8.5,
    color: data.fit === true ? COLOR.ok : COLOR.bad,
  });

  const checkboxX = MARGIN + 7 + Math.min(180, w - 14) + 14;

  text(ctx.page, `Fit  ${data.fit === true ? "[X]" : "[ ]"}      Not Fit  ${data.fit === false ? "[X]" : "[ ]"}`, checkboxX, ctx.y + 4.5, {
    font: ctx.font,
    size: 8.5,
    color: COLOR.ink,
  });

  ctx.y += 23;

  const items: [string, string][] = [
    ["isolation_checked", "Isolation checked"],
    ["barricade_installed", "Barricade installed"],
    ["gas_test_completed", "Gas test completed"],
    ["fire_watch_assigned", "Fire watch assigned"],
    ["ppe_verified", "PPE verified"],
    ["evidence_reviewed", "Evidence reviewed"],
  ];

  if (data.checklist || data.checklist_status) {
    text(ctx.page, "Condition Verification Checklist", MARGIN + 7, ctx.y, {
      font: ctx.fontBold,
      size: 8,
      color: COLOR.bandText,
    });

    ctx.y += 12;

    const leftX = MARGIN + 7;
    const rightX = MARGIN + 213;
    const rowGap = 12;

    for (let i = 0; i < items.length; i += 2) {
      const left = items[i];
      const right = items[i + 1];

      drawStage2StatusAt(ctx, leftX, ctx.y, getStage2Status(data, left[0]), left[1]);

      if (right) {
        drawStage2StatusAt(ctx, rightX, ctx.y, getStage2Status(data, right[0]), right[1]);
      }

      ctx.y += rowGap;
    }

    ctx.y += 2;
  }

  drawSignatureRow(
    ctx,
    w,
    {
      name: b.permit.assessor?.full_name ?? "",
      department: data.position ?? b.permit.assessor?.department ?? "Safety Assessor",
      submitted_at: stage.submitted_at,
    },
    "POSITION",
  );

  if (data.remarks) {
    text(ctx.page, "Remarks:", MARGIN + 7, ctx.y, {
      font: ctx.fontBold,
      size: 8,
    });

    const lines = wrap(data.remarks, ctx.font, 8.2, w - 70);
    let yy = ctx.y;

    for (const lineText of lines.slice(0, 3)) {
      text(ctx.page, lineText, MARGIN + 50, yy, {
        font: ctx.font,
        size: 8.2,
      });
      yy += 9.7;
    }

    ctx.y = yy + 1;
  }

  if (data.fit === false && (data.corrective_action || data.rectification_date)) {
    ctx.y += 4;

    text(ctx.page, "Corrective Action Required:", MARGIN + 7, ctx.y, {
      font: ctx.fontBold,
      size: 8,
      color: COLOR.bad,
    });

    ctx.y += 11;

    const caLines = wrap(data.corrective_action || "—", ctx.font, 8.2, w - 14);

    for (const lineText of caLines.slice(0, 3)) {
      text(ctx.page, lineText, MARGIN + 7, ctx.y, {
        font: ctx.font,
        size: 8.2,
      });
      ctx.y += 9.7;
    }

    ctx.y += 3;

    text(
      ctx.page,
      `Expected Rectification Date: ${data.rectification_date ? fmtDate(data.rectification_date) : "—"}`,
      MARGIN + 7,
      ctx.y,
      {
        font: ctx.fontBold,
        size: 8,
        color: COLOR.bad,
      },
    );

    ctx.y += 14;
  }
}

function getStage2Status(
  data: {
    checklist?: Record<string, boolean | string>;
    checklist_status?: Record<string, string>;
  },
  key: string,
): "yes" | "no" | "na" | "unset" {
  const explicit = data.checklist_status?.[key];

  if (explicit === "yes" || explicit === "no" || explicit === "na") {
    return explicit;
  }

  const value = data.checklist?.[key];

  if (value === "yes" || value === "no" || value === "na") {
    return value;
  }

  if (value === true) return "yes";
  if (value === false) return "no";

  return "unset";
}

function drawStage2StatusAt(
  ctx: DrawCtx,
  x: number,
  yFromTop: number,
  status: "yes" | "no" | "na" | "unset",
  label: string,
) {
  const badgeW = 18;
  const badgeH = 8.5;

  const fill =
    status === "yes"
      ? COLOR.ok
      : status === "no"
        ? COLOR.bad
        : status === "na"
          ? COLOR.bandText
          : COLOR.border;

  const textLabel =
    status === "yes"
      ? "YES"
      : status === "no"
        ? "NO"
        : status === "na"
          ? "N/A"
          : "—";

  ctx.page.drawRectangle({
    x,
    y: A4.h - yFromTop - badgeH,
    width: badgeW,
    height: badgeH,
    borderColor: fill,
    borderWidth: 0.5,
    color: fill,
  });

  text(ctx.page, textLabel, x + 2.4, yFromTop + 0.1, {
    font: ctx.fontBold,
    size: 5.5,
    color: rgb(1, 1, 1),
  });

  text(ctx.page, label, x + badgeW + 5, yFromTop - 0.2, {
    font: ctx.font,
    size: 8,
  });
}

function drawStage3(ctx: DrawCtx, b: PdfBundle, w: number) {
  const stage = b.stages.find((s) => s.stage === "III");
  const data =
    (stage?.data as {
      decision?: string;
      reason?: string;
    }) ?? {};

  const lines = wrap(STAGE_III_SIMOPS_WORDING, ctx.font, 8.2, w - 12);

  for (const lineText of lines) {
    text(ctx.page, lineText, MARGIN + 7, ctx.y, {
      font: ctx.font,
      size: 8.2,
    });
    ctx.y += 9.7;
  }

  if (data.reason) {
    ctx.y += 1;

    text(ctx.page, "SRM / Project Manager Notes:", MARGIN + 7, ctx.y, {
      font: ctx.fontBold,
      size: 7.8,
      color: COLOR.muted,
    });

    const reasonLines = wrap(data.reason, ctx.font, 8, w - 146);

    for (const reasonLine of reasonLines.slice(0, 2)) {
      text(ctx.page, reasonLine, MARGIN + 132, ctx.y, {
        font: ctx.font,
        size: 8,
      });
      ctx.y += 9;
    }
  }

  ctx.y += 2;

  drawSignatureRow(ctx, w, {
    name: b.permit.srm?.full_name ?? "",
    department: b.permit.srm?.department ?? "",
    submitted_at: stage?.submitted_at,
  });
}

function drawStage4(ctx: DrawCtx, b: PdfBundle, w: number) {
  const stage = b.stages.find((s) => s.stage === "IV");

  const note =
    "Completion of hot work has been notified. Identity, department, date, and time are recorded from the authenticated session.";

  const lines = wrap(note, ctx.font, 8.2, w - 12);

  for (const lineText of lines) {
    text(ctx.page, lineText, MARGIN + 7, ctx.y, {
      font: ctx.font,
      size: 8.2,
    });
    ctx.y += 9.5;
  }

  ctx.y += 3;

  drawSignatureRow(ctx, w, {
    name: b.permit.closer?.full_name ?? "",
    department: b.permit.closer?.department ?? "",
    submitted_at: stage?.submitted_at,
  });
}

function drawCheck(
  ctx: DrawCtx,
  checked: boolean | undefined,
  label: string,
  sameLine?: boolean,
) {
  drawCheckAt(ctx, MARGIN + 7, ctx.y, checked, label);

  if (!sameLine) ctx.y += 11.5;
}

function drawCheckAt(
  ctx: DrawCtx,
  x: number,
  yFromTop: number,
  checked: boolean | undefined,
  label: string,
) {
  const size = 8.2;

  ctx.page.drawRectangle({
    x,
    y: A4.h - yFromTop - size,
    width: size,
    height: size,
    borderColor: checked ? COLOR.ok : COLOR.ink,
    borderWidth: 0.7,
  });

  if (checked) {
    ctx.page.drawLine({
      start: { x: x + 1.6, y: A4.h - yFromTop - 4.7 },
      end: { x: x + 3.5, y: A4.h - yFromTop - 6.7 },
      color: COLOR.ok,
      thickness: 1.05,
    });

    ctx.page.drawLine({
      start: { x: x + 3.5, y: A4.h - yFromTop - 6.7 },
      end: { x: x + 7.1, y: A4.h - yFromTop - 2.3 },
      color: COLOR.ok,
      thickness: 1.05,
    });
  }

  text(ctx.page, label, x + size + 5, yFromTop - 0.5, {
    font: ctx.font,
    size: 8,
  });
}

function drawSignatureRow(
  ctx: DrawCtx,
  w: number,
  meta: {
    name: string;
    department: string;
    submitted_at?: string;
  },
  deptLabel: string = "DEPARTMENT",
) {
  const h = 31;
  const x = MARGIN;
  const y = ctx.y;

  box(ctx.page, x, y, w, h, rgb(1, 1, 1), COLOR.lightBorder);

  const midX = x + w / 2;

  line(ctx.page, midX, y, midX, y + h, 0.45);
  line(ctx.page, x, y + h / 2, x + w, y + h / 2, 0.45);

  text(ctx.page, "NAME", x + 7, y + 4.5, {
    font: ctx.fontBold,
    size: 7,
    color: COLOR.muted,
  });

  text(ctx.page, meta.name || "________________________", x + 48, y + 4.5, {
    font: ctx.font,
    size: 8,
  });

  text(ctx.page, deptLabel, midX + 7, y + 4.5, {
    font: ctx.fontBold,
    size: 7,
    color: COLOR.muted,
  });

  text(ctx.page, meta.department || "______________", midX + 74, y + 4.5, {
    font: ctx.font,
    size: 8,
  });

  text(ctx.page, "DATE", x + 7, y + 19, {
    font: ctx.fontBold,
    size: 7,
    color: COLOR.muted,
  });

  text(ctx.page, fmtDate(meta.submitted_at), x + 48, y + 19, {
    font: ctx.font,
    size: 8,
  });

  text(ctx.page, "TIME", x + 145, y + 19, {
    font: ctx.fontBold,
    size: 7,
    color: COLOR.muted,
  });

  text(ctx.page, fmtTime(meta.submitted_at), x + 180, y + 19, {
    font: ctx.font,
    size: 8,
  });

  text(ctx.page, "SIGNATURE", midX + 7, y + 19, {
    font: ctx.fontBold,
    size: 7,
    color: COLOR.muted,
  });

  text(
    ctx.page,
    meta.name ? `${meta.name} (login)` : "_______________________",
    midX + 74,
    y + 19,
    {
      font: ctx.font,
      size: 8,
    },
  );

  ctx.y += h + 3;
}

/* =====================================================
   GAP-08: Annotated Evidence Rendering
   ===================================================== */

type AnnotationPoint = {
  x: number;
  y: number;
};

type RawAnnotation = Record<string, unknown>;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getAnnotationList(raw: unknown): RawAnnotation[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (item): item is RawAnnotation =>
        !!item && typeof item === "object" && !Array.isArray(item),
    );
  }

  const obj = asObject(raw);
  const candidates = [obj.annotations, obj.items, obj.shapes, obj.data];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is RawAnnotation =>
          !!item && typeof item === "object" && !Array.isArray(item),
      );
    }
  }

  return [];
}

function getSourceSize(raw: unknown, imgWidth: number, imgHeight: number) {
  const obj = asObject(raw);

  const sourceWidth =
    num(obj.canvasWidth) ??
    num(obj.imageWidth) ??
    num(obj.naturalWidth) ??
    num(obj.width) ??
    imgWidth;

  const sourceHeight =
    num(obj.canvasHeight) ??
    num(obj.imageHeight) ??
    num(obj.naturalHeight) ??
    num(obj.height) ??
    imgHeight;

  return {
    sourceWidth,
    sourceHeight,
  };
}

function mapX(value: unknown, sourceWidth: number, targetWidth: number): number {
  const n = num(value) ?? 0;

  if (n >= 0 && n <= 1) return n * targetWidth;
  if (sourceWidth > 0) return (n / sourceWidth) * targetWidth;

  return n;
}

function mapY(value: unknown, sourceHeight: number, targetHeight: number): number {
  const n = num(value) ?? 0;

  if (n >= 0 && n <= 1) return n * targetHeight;
  if (sourceHeight > 0) return (n / sourceHeight) * targetHeight;

  return n;
}

function getAnnotationColor(annotation: RawAnnotation) {
  const raw =
    str(annotation.color) ||
    str(annotation.stroke) ||
    str(annotation.strokeColor) ||
    str(annotation.fill);

  if (!raw) return COLOR.bad;

  const hex = raw.replace("#", "").trim();

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    return rgb(r, g, b);
  }

  if (raw.toLowerCase().includes("red")) return COLOR.bad;
  if (raw.toLowerCase().includes("green")) return COLOR.ok;
  if (raw.toLowerCase().includes("blue")) return COLOR.bandText;

  return COLOR.bad;
}

function getPoint(value: unknown): AnnotationPoint | null {
  if (Array.isArray(value)) {
    const x = num(value[0]);
    const y = num(value[1]);

    if (x !== null && y !== null) return { x, y };

    return null;
  }

  const obj = asObject(value);
  const x = num(obj.x);
  const y = num(obj.y);

  if (x !== null && y !== null) return { x, y };

  return null;
}

function getPoints(annotation: RawAnnotation): AnnotationPoint[] {
  const candidates = [annotation.points, annotation.path, annotation.lines];

  for (const candidate of candidates) {
    const arr = asArray(candidate)
      .map(getPoint)
      .filter((point): point is AnnotationPoint => Boolean(point));

    if (arr.length) return arr;
  }

  return [];
}

function pdfPoint(
  xValue: unknown,
  yValue: unknown,
  sourceWidth: number,
  sourceHeight: number,
  imageX: number,
  imageBottomY: number,
  imageWidth: number,
  imageHeight: number,
) {
  const x = imageX + mapX(xValue, sourceWidth, imageWidth);
  const yFromImageTop = mapY(yValue, sourceHeight, imageHeight);
  const y = imageBottomY + imageHeight - yFromImageTop;

  return { x, y };
}

function drawArrowHead(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: ReturnType<typeof rgb>,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 10;
  const spread = Math.PI / 7;

  const leftX = x2 - size * Math.cos(angle - spread);
  const leftY = y2 - size * Math.sin(angle - spread);

  const rightX = x2 - size * Math.cos(angle + spread);
  const rightY = y2 - size * Math.sin(angle + spread);

  page.drawLine({
    start: { x: x2, y: y2 },
    end: { x: leftX, y: leftY },
    color,
    thickness: 2,
  });

  page.drawLine({
    start: { x: x2, y: y2 },
    end: { x: rightX, y: rightY },
    color,
    thickness: 2,
  });
}

function drawAnnotationOverlay(
  page: PDFPage,
  annotation: RawAnnotation,
  font: PDFFont,
  imageX: number,
  imageBottomY: number,
  imageWidth: number,
  imageHeight: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  const type = (
    str(annotation.type) ||
    str(annotation.tool) ||
    str(annotation.kind)
  ).toLowerCase();

  const color = getAnnotationColor(annotation);
  const thickness = num(annotation.strokeWidth) ?? num(annotation.lineWidth) ?? 2;

  if (type === "arrow") {
    const start =
      getPoint(annotation.start) ??
      getPoint(annotation.from) ?? {
        x: num(annotation.startX) ?? num(annotation.x1) ?? num(annotation.x) ?? 0,
        y: num(annotation.startY) ?? num(annotation.y1) ?? num(annotation.y) ?? 0,
      };

    const end =
      getPoint(annotation.end) ??
      getPoint(annotation.to) ?? {
        x: num(annotation.endX) ?? num(annotation.x2) ?? 0,
        y: num(annotation.endY) ?? num(annotation.y2) ?? 0,
      };

    const p1 = pdfPoint(
      start.x,
      start.y,
      sourceWidth,
      sourceHeight,
      imageX,
      imageBottomY,
      imageWidth,
      imageHeight,
    );

    const p2 = pdfPoint(
      end.x,
      end.y,
      sourceWidth,
      sourceHeight,
      imageX,
      imageBottomY,
      imageWidth,
      imageHeight,
    );

    page.drawLine({
      start: p1,
      end: p2,
      color,
      thickness,
    });

    drawArrowHead(page, p1.x, p1.y, p2.x, p2.y, color);

    return;
  }

  if (type === "circle" || type === "ellipse") {
    const x = num(annotation.x) ?? num(annotation.left) ?? 0;
    const y = num(annotation.y) ?? num(annotation.top) ?? 0;

    const w =
      num(annotation.width) ??
      num(annotation.w) ??
      ((num(annotation.radius) ?? num(annotation.r) ?? 20) * 2);

    const h =
      num(annotation.height) ??
      num(annotation.h) ??
      ((num(annotation.radius) ?? num(annotation.r) ?? 20) * 2);

    const mappedX = imageX + mapX(x, sourceWidth, imageWidth);
    const mappedYTop = mapY(y, sourceHeight, imageHeight);
    const mappedW = mapX(w, sourceWidth, imageWidth);
    const mappedH = mapY(h, sourceHeight, imageHeight);

    const centerX = mappedX + mappedW / 2;
    const centerY = imageBottomY + imageHeight - mappedYTop - mappedH / 2;

    page.drawEllipse({
      x: centerX,
      y: centerY,
      xScale: Math.max(mappedW / 2, 4),
      yScale: Math.max(mappedH / 2, 4),
      borderColor: color,
      borderWidth: thickness,
    });

    return;
  }

  if (type === "rectangle" || type === "rect" || type === "box") {
    const x = num(annotation.x) ?? num(annotation.left) ?? 0;
    const y = num(annotation.y) ?? num(annotation.top) ?? 0;
    const w = num(annotation.width) ?? num(annotation.w) ?? 40;
    const h = num(annotation.height) ?? num(annotation.h) ?? 30;

    const mappedX = imageX + mapX(x, sourceWidth, imageWidth);
    const mappedW = mapX(w, sourceWidth, imageWidth);
    const mappedH = mapY(h, sourceHeight, imageHeight);
    const mappedYTop = mapY(y, sourceHeight, imageHeight);
    const mappedY = imageBottomY + imageHeight - mappedYTop - mappedH;

    page.drawRectangle({
      x: mappedX,
      y: mappedY,
      width: mappedW,
      height: mappedH,
      borderColor: color,
      borderWidth: thickness,
    });

    return;
  }

  if (type === "freehand" || type === "pen" || type === "draw") {
    const points = getPoints(annotation);

    if (points.length < 2) return;

    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const next = points[i];

      const p1 = pdfPoint(
        prev.x,
        prev.y,
        sourceWidth,
        sourceHeight,
        imageX,
        imageBottomY,
        imageWidth,
        imageHeight,
      );

      const p2 = pdfPoint(
        next.x,
        next.y,
        sourceWidth,
        sourceHeight,
        imageX,
        imageBottomY,
        imageWidth,
        imageHeight,
      );

      page.drawLine({
        start: p1,
        end: p2,
        color,
        thickness,
      });
    }

    return;
  }

  if (type === "text" || type === "label") {
    const label =
      str(annotation.text) ||
      str(annotation.label) ||
      str(annotation.value) ||
      "Note";

    const p = pdfPoint(
      num(annotation.x) ?? num(annotation.left) ?? 0,
      num(annotation.y) ?? num(annotation.top) ?? 0,
      sourceWidth,
      sourceHeight,
      imageX,
      imageBottomY,
      imageWidth,
      imageHeight,
    );

    const size = Math.max(num(annotation.fontSize) ?? 10, 7);

    page.drawText(label, {
      x: p.x,
      y: p.y - size,
      size,
      font,
      color,
      maxWidth: imageWidth - (p.x - imageX),
    });

    return;
  }
}

function drawAnnotations(
  page: PDFPage,
  photo: PermitPhotoRow & { bytes?: Uint8Array; mime?: string },
  font: PDFFont,
  imageX: number,
  imageBottomY: number,
  imageWidth: number,
  imageHeight: number,
  imgWidth: number,
  imgHeight: number,
) {
  const annotations = getAnnotationList(photo.annotation_data);

  if (!annotations.length) return;

  const { sourceWidth, sourceHeight } = getSourceSize(
    photo.annotation_data,
    imgWidth,
    imgHeight,
  );

  for (const annotation of annotations) {
    try {
      drawAnnotationOverlay(
        page,
        annotation,
        font,
        imageX,
        imageBottomY,
        imageWidth,
        imageHeight,
        sourceWidth,
        sourceHeight,
      );
    } catch {
      // Bad annotation data should not break PDF generation.
    }
  }
}

async function drawPhotos(
  doc: PDFDocument,
  photos: (PermitPhotoRow & {
    bytes?: Uint8Array;
    mime?: string;
    uploaderName?: string | null;
  })[],
  font: PDFFont,
  fontBold: PDFFont,
  serial: string,
) {
  let page = doc.addPage([A4.w, A4.h]);

  function drawPhotoHeader(targetPage: PDFPage, suffix = "") {
    targetPage.drawText(`Permit ${serial} - Photos & Annotated Evidence${suffix}`, {
      x: MARGIN,
      y: A4.h - MARGIN - 12,
      size: 11,
      font: fontBold,
      color: COLOR.ink,
    });

    targetPage.drawLine({
      start: { x: MARGIN, y: A4.h - MARGIN - 20 },
      end: { x: A4.w - MARGIN, y: A4.h - MARGIN - 20 },
      color: COLOR.border,
      thickness: 0.6,
    });
  }

  drawPhotoHeader(page);

  const gap = 14;
  const cardW = (A4.w - 2 * MARGIN - gap) / 2;
  const cardH = 278;
  const imgMaxH = 188;

  let index = 0;
  let y = MARGIN + 34;

  for (const photo of photos) {
    if (!photo.bytes) continue;

    let img;

    try {
      if (photo.mime?.includes("png")) {
        img = await doc.embedPng(photo.bytes);
      } else {
        img = await doc.embedJpg(photo.bytes);
      }
    } catch {
      continue;
    }

    const col = index % 2;
    const x = MARGIN + col * (cardW + gap);

    if (index > 0 && col === 0) {
      y += cardH + gap;
    }

    if (y + cardH > A4.h - MARGIN) {
      page = doc.addPage([A4.w, A4.h]);
      drawPhotoHeader(page, " (cont.)");
      y = MARGIN + 34;
    }

    box(page, x, y, cardW, cardH, rgb(1, 1, 1), COLOR.lightBorder);

    const scale = Math.min((cardW - 16) / img.width, imgMaxH / img.height);

    const imgW = img.width * scale;
    const imgH = img.height * scale;

    const imageX = x + (cardW - imgW) / 2;
    const imageTop = y + 10;
    const imageBottomY = A4.h - imageTop - imgH;

    page.drawImage(img, {
      x: imageX,
      y: imageBottomY,
      width: imgW,
      height: imgH,
    });

    drawAnnotations(
      page,
      photo,
      fontBold,
      imageX,
      imageBottomY,
      imgW,
      imgH,
      img.width,
      img.height,
    );

    const annotationCount = getAnnotationList(photo.annotation_data).length;
    const captionTop = y + imgMaxH + 18;

    page.drawLine({
      start: { x: x + 8, y: A4.h - captionTop + 6 },
      end: { x: x + cardW - 8, y: A4.h - captionTop + 6 },
      color: COLOR.border,
      thickness: 0.4,
    });

    page.drawText(`Evidence ${index + 1}`, {
      x: x + 10,
      y: A4.h - captionTop - 8,
      size: 8,
      font: fontBold,
      color: COLOR.ink,
    });

    page.drawText(
      annotationCount > 0
        ? `${annotationCount} annotation(s) included`
        : "No annotation",
      {
        x: x + 10,
        y: A4.h - captionTop - 20,
        size: 7.5,
        font,
        color: annotationCount > 0 ? COLOR.bad : COLOR.muted,
      },
    );

    if (photo.caption) {
      const captionLines = wrap(
        `Comment: ${photo.caption}`,
        font,
        7.5,
        cardW - 20,
      );

      captionLines.slice(0, 2).forEach((lineText, lineIdx) => {
        page.drawText(lineText, {
          x: x + 10,
          y: A4.h - captionTop - 32 - lineIdx * 10,
          size: 7.5,
          font,
          color: COLOR.ink,
        });
      });
    }

    const metaTop = captionTop + (photo.caption ? 44 : 22);

    page.drawText(
      `Uploaded by: ${photo.uploaderName || "—"}`,
      {
        x: x + 10,
        y: A4.h - metaTop,
        size: 7.2,
        font,
        color: COLOR.muted,
      },
    );

    page.drawText(
      `Date: ${fmtDate(photo.uploaded_at)}  ${fmtTime(photo.uploaded_at)}`,
      {
        x: x + 10,
        y: A4.h - metaTop - 10,
        size: 7.2,
        font,
        color: COLOR.muted,
      },
    );

    index += 1;
  }
}