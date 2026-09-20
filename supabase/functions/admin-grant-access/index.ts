// Edge Function: admin-grant-access
//
// Thay cho việc gọi thẳng RPC admin_grant_access từ trình duyệt (chỉ ghi vào
// bảng purchases, KHÔNG cấp quyền Google Drive) — hàm này làm luôn cả 2 việc:
// 1. Gọi RPC admin_grant_access (giữ nguyên toàn bộ kiểm tra quyền admin +
//    validate user/song đã có sẵn trong DB).
// 2. Gọi Google Apps Script Web App để tự động cấp quyền xem file/folder
//    Drive cho đúng email tài khoản khách — y hệt logic grantDriveAccess
//    trong sepay-ipn, dùng cho trường hợp admin cấp quyền tay (khách chuyển
//    khoản sai nội dung, lỗi webhook...) thay vì phải tự vào Drive share tay.
//
// Secret gọi Apps Script lấy từ bảng app_secrets (chỉ service role đọc
// được), KHÔNG nhúng vào code.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getSecret(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("app_secrets").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

function extractDriveId(url: string): { id: string; isFolder: boolean } | null {
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return { id: fileMatch[1], isFolder: false };
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return { id: folderMatch[1], isFolder: true };
  return null;
}

async function grantDriveAccess(songId: string, userId: string): Promise<{ ok: boolean; reason?: string }> {
  const [{ data: song }, { data: profile }, webAppUrl, driveSecret] = await Promise.all([
    supabaseAdmin.from("songs").select("target_url").eq("id", songId).maybeSingle(),
    supabaseAdmin.from("profiles").select("email").eq("id", userId).maybeSingle(),
    getSecret("drive_grant_webapp_url"),
    getSecret("drive_grant_apps_script_secret"),
  ]);

  if (!song?.target_url || !profile?.email || !webAppUrl || !driveSecret) {
    return { ok: false, reason: "missing_song_profile_or_config" };
  }

  const drive = extractDriveId(song.target_url);
  if (!drive) {
    return { ok: false, reason: "could_not_parse_drive_id" };
  }

  try {
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
    console.log("[admin-grant-access] drive grant result:", result);
    return { ok: true };
  } catch (err) {
    console.error("[admin-grant-access] drive grant failed:", err);
    return { ok: false, reason: "drive_grant_request_failed" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) return json({ success: false, error: "unauthorized" }, 401);

    // Xác nhận lại đúng là admin bằng service role (không tin tưởng riêng JWT) —
    // cùng bất biến bảo mật với các RPC admin_* khác trong dự án.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return json({ success: false, error: "forbidden" }, 403);
    }

    // orderId / transactionId / amount là tuỳ chọn:
    //   orderId        đóng đúng đơn này (kể cả đơn đã hết hạn — khách trả muộn)
    //   transactionId  khoản tiền về (bank_transactions) đang được gán cho lần
    //                  cấp này; xử lý xong sẽ đánh dấu "đã gán"
    //   amount         số tiền thực nhận, dùng khi phải tạo đơn để ghi doanh thu
    const { userId, songId, reason, note, orderId, transactionId, amount } = await req.json();
    if (!userId || !songId) return json({ success: false, error: "missing_userId_or_songId" }, 400);

    // Khoản tiền phải còn "chưa khớp" TRƯỚC KHI cấp: nếu hai admin (hoặc hai
    // lần bấm) cùng gán một khoản thì chỉ lần đầu được cấp tab, tránh cấp hai
    // tab cho một khoản tiền.
    if (transactionId) {
      const { data: tx } = await supabaseAdmin
        .from("bank_transactions")
        .select("status")
        .eq("id", transactionId)
        .maybeSingle();
      if (!tx) return json({ success: false, error: "Không tìm thấy khoản tiền này." }, 404);
      if (tx.status !== "unmatched") {
        return json({ success: false, error: "Khoản tiền này đã được xử lý trước đó." }, 409);
      }
    }

    // Bước 1: cấp quyền trong DB qua đúng RPC hiện có (giữ nguyên toàn bộ
    // validate: user tồn tại, chưa mua trùng...). Gọi bằng userClient (JWT
    // của chính admin) chứ không phải service role — RPC tự kiểm tra
    // auth.uid() bên trong, dùng service role sẽ làm auth.uid() = null và
    // bị chặn nhầm là "không có quyền".
    // Tham số tuỳ chọn chỉ gửi khi có, để lời gọi cũ vẫn chạy được trên bản
    // RPC chưa cập nhật.
    const rpcArgs: Record<string, unknown> = {
      p_user_id: userId,
      p_song_id: songId,
      p_reason: reason ?? "other",
      p_note: note ?? null,
    };
    if (orderId) rpcArgs.p_order_id = orderId;
    if (amount !== undefined && amount !== null && amount !== "") rpcArgs.p_amount = Number(amount);

    const { data: rpcResult, error: rpcError } = await userClient.rpc("admin_grant_access", rpcArgs);

    if (rpcError) {
      return json({ success: false, error: rpcError.message }, 400);
    }

    // Bước 2: đánh dấu khoản tiền đã được gán. Quyền đã cấp xong ở trên nên nếu
    // bước này lỗi thì báo kèm cảnh báo chứ không huỷ kết quả.
    let transactionResolved: boolean | undefined;
    if (transactionId) {
      const { error: resolveError } = await userClient.rpc("admin_resolve_transaction", {
        p_transaction_id: transactionId,
        p_action: "assign",
        p_order_id: orderId ?? rpcResult?.closed_order_id ?? null,
        p_note: note ?? null,
      });
      transactionResolved = !resolveError;
      if (resolveError) console.error("[admin-grant-access] resolve transaction failed:", resolveError.message);
    }

    // Bước 3: cấp quyền Google Drive tự động — không chặn phản hồi nếu lỗi,
    // chỉ báo kèm theo để admin biết cần tự cấp tay nếu bước này thất bại.
    const driveResult = await grantDriveAccess(songId, userId);

    return json({
      success: true,
      dbResult: rpcResult,
      driveGranted: driveResult.ok,
      driveError: driveResult.ok ? undefined : driveResult.reason,
      transactionResolved,
    });
  } catch (err) {
    console.error("[admin-grant-access] error:", err);
    return json({ success: false, error: "internal_error" }, 500);
  }
});
