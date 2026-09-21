// Edge Function: sepay-ipn
//
// Nhan webhook "bien dong so du" tu SePay moi khi co tien vao tai khoan ngan
// hang da lien ket. Xac thuc bang chu ky HMAC-SHA256 (header X-SePay-Signature
// dang "sha256={hex}", ket hop voi X-SePay-Timestamp).
//
// Sau khi xac thuc: doc noi dung chuyen khoan (content), tim ma don hang
// (vd DH482913) dang cho thanh toan trong bang orders, neu khop (va so tien
// >= gia don) thi tu dong danh dau da thanh toan + them vao bang purchases,
// ROI GOI TIEP Google Apps Script Web App de tu dong them quyen xem file/
// folder Drive tuong ung cho dung email tai khoan khach (profiles.email) -
// thay cho viec admin phai tu tay cap quyen web LAN tu vao Drive share tay.
// Dong thoi gui 1 email bao don hang moi cho admin (qua Brevo API) de biet
// ngay co giao dich thanh cong ma khong can mo Supabase Dashboard.
//
// Moi giao dich CO MA DON (DH...) deu duoc ghi vao bang bank_transactions (khop hay
// khong). Truoc day tien ve ma khong khop don nao chi co 1 dong console.log nen
// admin khong the biet "tien da ve ma khach chua nhan tab". Nay khoan khong khop
// duoc luu voi ly do cu the va gui email bao admin.
// SePay gui webhook cho MOI giao dich cua tai khoan (ke ca ban be chuyen tien ca nhan,
// tien ra): khoan KHONG co ma don thi bo qua hoan toan - khong luu noi dung, khong
// gui email, khong ghi vao log - vi khong lien quan toi viec ban tab va la du lieu
// tai chinh ca nhan cua chu tai khoan. Ghi log KHONG BAO GIO duoc
// lam hong viec cap tab: moi loi khi ghi log deu chi duoc bo qua.
//
// Secret dung de ky HMAC, secret goi Apps Script, va API key Brevo deu luu
// trong bang app_secrets (chi service role doc duoc qua RLS), KHONG nhung
// thang vao source code.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  decideTransfer,
  extractOrderCode,
  parseTransfer,
  sanitizeRaw,
  type OrderLite,
  type TransferInfo,
} from "./transfer.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const ADMIN_NOTIFY_EMAIL = "quanggg104204@gmail.com";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function getSecret(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("app_secrets").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

/**
 * Trich file/folder ID tu link Google Drive dang
 * https://drive.google.com/file/d/<ID>/view?... hoac
 * https://drive.google.com/drive/folders/<ID>?...
 */
function extractDriveId(url: string): { id: string; isFolder: boolean } | null {
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return { id: fileMatch[1], isFolder: false };
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return { id: folderMatch[1], isFolder: true };
  return null;
}

async function grantDriveAccess(songId: string, userId: string) {
  try {
    const [{ data: song }, { data: profile }, webAppUrl, driveSecret] = await Promise.all([
      supabaseAdmin.from("songs").select("target_url").eq("id", songId).maybeSingle(),
      supabaseAdmin.from("profiles").select("email").eq("id", userId).maybeSingle(),
      getSecret("drive_grant_webapp_url"),
      getSecret("drive_grant_apps_script_secret"),
    ]);

    if (!song?.target_url || !profile?.email || !webAppUrl || !driveSecret) {
      console.warn("[sepay-ipn] skip drive grant: missing song/profile/config", {
        hasSong: !!song?.target_url,
        hasProfile: !!profile?.email,
        hasWebAppUrl: !!webAppUrl,
      });
      return;
    }

    const drive = extractDriveId(song.target_url);
    if (!drive) {
      console.warn("[sepay-ipn] skip drive grant: could not parse drive id from", song.target_url);
      return;
    }

    const resp = await fetch(webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: driveSecret,
        fileId: drive.id,
        email: profile.email,
        isFolder: drive.isFolder,
      }),
    });
    const result = await resp.text();
    console.log("[sepay-ipn] drive grant result:", result);
  } catch (err) {
    console.error("[sepay-ipn] drive grant failed:", err);
  }
}

/**
 * Bao admin qua email (Brevo Transactional Email API) ngay khi co don hang
 * thanh toan thanh cong - du thong tin khach mua, bai gi, bao nhieu tien de
 * doc la hieu ngay, khong can mo Supabase Dashboard kiem tra.
 */
async function notifyAdminByEmail(
  orderCode: string,
  order: { user_id: string; song_id: string; amount: number }
) {
  try {
    const [{ data: song }, { data: profile }, brevoKey] = await Promise.all([
      supabaseAdmin.from("songs").select("title").eq("id", order.song_id).maybeSingle(),
      supabaseAdmin.from("profiles").select("email, full_name").eq("id", order.user_id).maybeSingle(),
      getSecret("brevo_api_key"),
    ]);

    if (!brevoKey) {
      console.warn("[sepay-ipn] skip admin email: missing brevo_api_key secret");
      return;
    }

    const customerName = profile?.full_name || "(chưa đặt tên)";
    const customerEmail = profile?.email || "(không rõ email)";
    const songTitle = song?.title || order.song_id;
    const amountFormatted = Number(order.amount).toLocaleString("vi-VN") + "đ";
    const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

    const html = `
      <div style="font-family: sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.6;">
        <h2 style="color: #c1602f;">💰 Có đơn hàng mới vừa thanh toán thành công!</h2>
        <table cellpadding="6" style="border-collapse: collapse;">
          <tr><td><strong>Mã đơn:</strong></td><td>${orderCode}</td></tr>
          <tr><td><strong>Khách hàng:</strong></td><td>${escapeHtml(customerName)}</td></tr>
          <tr><td><strong>Email khách:</strong></td><td>${escapeHtml(customerEmail)}</td></tr>
          <tr><td><strong>Bài hát:</strong></td><td>${escapeHtml(songTitle)}</td></tr>
          <tr><td><strong>Số tiền:</strong></td><td><strong>${amountFormatted}</strong></td></tr>
          <tr><td><strong>Thời gian:</strong></td><td>${now}</td></tr>
        </table>
        <p style="color: #16a34a;">✓ Hệ thống đã tự động cấp quyền xem Google Drive cho khách, không cần làm gì thêm.</p>
      </div>
    `;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": brevoKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Guitar By Quang", email: ADMIN_NOTIFY_EMAIL },
        to: [{ email: ADMIN_NOTIFY_EMAIL }],
        subject: `💰 Đơn mới: ${songTitle} - ${amountFormatted} (${orderCode})`,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      console.error("[sepay-ipn] brevo notify email failed:", await res.text());
    } else {
      console.log("[sepay-ipn] admin notify email sent for", orderCode);
    }
  } catch (err) {
    console.error("[sepay-ipn] notifyAdminByEmail failed:", err);
  }
}

const REASON_TEXT: Record<string, string> = {
  no_code: "Nội dung chuyển khoản không có mã đơn (DH…)",
  order_not_found: "Có mã đơn nhưng không tìm thấy đơn nào",
  order_already_paid: "Đơn này đã được thanh toán rồi — khách chuyển thừa một khoản",
  order_expired: "Đơn đã hết hạn (khách trả muộn)",
  amount_low: "Số tiền chuyển thấp hơn giá đơn",
};

/**
 * Ghi giao dich vao bang bank_transactions.
 * Tra ve: true = vua ghi moi, false = giao dich nay da duoc ghi tu truoc (SePay
 * gui lai), null = ghi loi (vd. chua chay file SQL). KHONG bao gio nem loi.
 */
async function logTransfer(
  t: TransferInfo,
  raw: Record<string, unknown>,
  o: { status: string; reason?: string | null; orderCode?: string | null; orderId?: string | null }
): Promise<boolean | null> {
  try {
    const row = {
      external_id: t.externalId,
      direction: t.direction,
      amount: t.amount,
      content: t.content,
      occurred_at: t.occurredAt,
      gateway: t.gateway,
      reference_code: t.referenceCode,
      status: o.status,
      reason: o.reason ?? null,
      order_code: o.orderCode ?? null,
      order_id: o.orderId ?? null,
      raw,
    };
    const table = supabaseAdmin.from("bank_transactions");
    const { data, error } = t.externalId
      ? await table.upsert(row, { onConflict: "external_id", ignoreDuplicates: true }).select("id")
      : await table.insert(row).select("id");
    if (error) {
      console.warn("[sepay-ipn] could not log bank transaction:", error.message);
      return null;
    }
    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.warn("[sepay-ipn] bank transaction log threw:", err);
    return null;
  }
}

/** Email bao admin: co tien ve nhung khong khop don nao, can vao xu ly. */
async function notifyUnmatchedTransfer(t: TransferInfo, reason: string, orderCode: string | null) {
  try {
    const brevoKey = await getSecret("brevo_api_key");
    if (!brevoKey) return;

    const amount = Number(t.amount).toLocaleString("vi-VN") + "đ";
    const html = `
      <div style="font-family: sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.6;">
        <h2 style="color: #d97706;">⚠️ Có tiền về nhưng chưa khớp đơn nào</h2>
        <table cellpadding="6" style="border-collapse: collapse;">
          <tr><td><strong>Số tiền:</strong></td><td><strong>${amount}</strong></td></tr>
          <tr><td><strong>Nội dung:</strong></td><td>${escapeHtml(t.content) || "(trống)"}</td></tr>
          <tr><td><strong>Vì sao không khớp:</strong></td><td>${escapeHtml(REASON_TEXT[reason] ?? reason)}</td></tr>
          ${orderCode ? `<tr><td><strong>Mã đơn trong nội dung:</strong></td><td>${escapeHtml(orderCode)}</td></tr>` : ""}
        </table>
        <p>Khách có thể đã chuyển khoản mà chưa nhận được tab. Vào trang quản trị mục <strong>Tiền về</strong> để gán khoản này cho đúng khách:</p>
        <p><a href="https://guitar-by-quang-v2.vercel.app/admin-dashboard.html#/tien-ve">Mở trang Tiền về</a></p>
      </div>`;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": brevoKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Guitar By Quang", email: ADMIN_NOTIFY_EMAIL },
        to: [{ email: ADMIN_NOTIFY_EMAIL }],
        subject: `⚠️ Tiền về chưa khớp đơn: ${amount}`,
        htmlContent: html,
      }),
    });
    if (!res.ok) console.error("[sepay-ipn] unmatched-transfer email failed:", await res.text());
  } catch (err) {
    console.error("[sepay-ipn] notifyUnmatchedTransfer failed:", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const timestamp = req.headers.get("x-sepay-timestamp") ?? "";
  const signatureHeader = req.headers.get("x-sepay-signature") ?? "";
  const providedSig = signatureHeader.replace(/^sha256=/, "").trim();

  const rawBody = await req.text();

  const hmacSecret = await getSecret("sepay_webhook_hmac_secret");

  if (!hmacSecret || !timestamp || !providedSig) {
    console.warn("[sepay-ipn] rejected: missing signature/timestamp or secret unavailable");
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const expectedSig = await hmacSha256Hex(hmacSecret, `${timestamp}.${rawBody}`);

  if (!timingSafeEqual(expectedSig, providedSig)) {
    console.warn("[sepay-ipn] rejected: signature mismatch");
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    console.error("[sepay-ipn] invalid JSON:", err);
    return new Response(JSON.stringify({ error: "invalid_payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const transfer = parseTransfer(body);
  const orderCode = extractOrderCode(transfer.content);

  // Loc som, TRUOC khi ghi bat ky log/dong du lieu nao co noi dung chuyen khoan: tien RA va
  // tien vao khong co ma don khong lien quan toi web (xem decideTransfer).
  const early = decideTransfer(transfer, orderCode, null);
  if (early.kind === "ignore_outgoing" || early.kind === "ignore_unrelated") {
    console.log(`[sepay-ipn] ignored (${early.kind})`);
    return new Response(
      JSON.stringify({
        success: true,
        matched: false,
        reason: early.kind === "ignore_outgoing" ? "outgoing" : "unrelated",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // Chi log ban da bo so du/so tai khoan.
  console.log("[sepay-ipn] verified webhook received:", JSON.stringify(sanitizeRaw(body)));

  // Tra don theo ma o MOI trang thai (khong chi "pending") de biet chinh xac vi
  // sao mot khoan khong khop: da tra roi, da het han, hay khong co don.
  let order: OrderLite | null = null;
  if (orderCode) {
    const { data, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, song_id, amount, status")
      .eq("order_code", orderCode)
      .maybeSingle();

    if (orderErr) {
      // Loi DB tam thoi: tra 500 de SePay gui lai, thay vi ghi nhan sai la "khong khop".
      console.error("[sepay-ipn] order lookup failed:", orderErr);
      return new Response(JSON.stringify({ error: "internal_error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    order = data;
  }

  const decision = decideTransfer(transfer, orderCode, order);
  if (decision.kind === "ignore_outgoing" || decision.kind === "ignore_unrelated") {
    // Không tới được (đã lọc ở trên) — giữ để TypeScript thu hẹp kiểu và phòng hờ.
    return new Response(JSON.stringify({ success: true, matched: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (decision.kind === "unmatched") {
    console.warn(
      `[sepay-ipn] unmatched transfer (${decision.reason}): ${transfer.amount} - ${transfer.content}`
    );
    const logged = await logTransfer(transfer, sanitizeRaw(body), {
      status: "unmatched",
      reason: decision.reason,
      orderCode: decision.orderCode,
      orderId: order?.id ?? null,
    });
    // logged === false: giao dich nay da duoc ghi + bao truoc do (SePay gui lai)
    // nen khong bao lai. null (ghi loi) van bao, de khong bo sot tien ve.
    if (logged !== false) {
      EdgeRuntime.waitUntil(notifyUnmatchedTransfer(transfer, decision.reason, decision.orderCode));
    }
    return new Response(
      JSON.stringify({ success: true, matched: false, reason: decision.reason }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // decision.kind === "match": don dang cho va so tien >= gia don. Tu day tro
  // xuong giu nguyen luong cu.
  const matchedOrder = order!;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", matchedOrder.id)
    .eq("status", "pending")
    .select("id");

  if (updateErr) {
    console.error("[sepay-ipn] failed to mark order paid:", updateErr);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!updated || updated.length === 0) {
    // Mot request khac (webhook gui trung dong thoi) vua danh dau don nay - khong
    // cap quyen + gui email lan thu hai.
    console.log("[sepay-ipn] order already processed by a concurrent request:", decision.orderCode);
    return new Response(JSON.stringify({ success: true, matched: false, reason: "already_processed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: existingPurchase } = await supabaseAdmin
    .from("purchases")
    .select("id")
    .eq("user_id", matchedOrder.user_id)
    .eq("song_id", matchedOrder.song_id)
    .maybeSingle();

  if (!existingPurchase) {
    const { error: purchaseErr } = await supabaseAdmin
      .from("purchases")
      .insert({ user_id: matchedOrder.user_id, song_id: matchedOrder.song_id, purchased_at: new Date().toISOString() });
    if (purchaseErr) {
      console.error("[sepay-ipn] failed to insert purchase:", purchaseErr);
      return new Response(JSON.stringify({ error: "internal_error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  console.log(
    `[sepay-ipn] auto-granted access: order ${decision.orderCode}, user ${matchedOrder.user_id}, song ${matchedOrder.song_id}`
  );

  await logTransfer(transfer, sanitizeRaw(body), {
    status: "matched",
    orderCode: decision.orderCode,
    orderId: matchedOrder.id,
  });

  // Dung EdgeRuntime.waitUntil de dam bao cap quyen Drive + gui email admin
  // chay xong ngay ca sau khi da tra response cho SePay - fire-and-forget
  // thuong bi cat ngang khi function instance bi huy sau khi response duoc gui.
  EdgeRuntime.waitUntil(
    Promise.all([
      grantDriveAccess(matchedOrder.song_id, matchedOrder.user_id),
      notifyAdminByEmail(decision.orderCode, matchedOrder),
    ])
  );

  return new Response(JSON.stringify({ success: true, matched: true, orderCode: decision.orderCode }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
