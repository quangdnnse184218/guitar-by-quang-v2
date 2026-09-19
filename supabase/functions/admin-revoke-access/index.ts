// Edge Function: admin-revoke-access
//
// Đối xứng với admin-grant-access: thu hồi quyền xem tab trong web VÀ gỡ luôn
// quyền xem file/folder Google Drive của đúng email tài khoản đó, để admin
// không phải vào Drive bỏ chia sẻ tay.
//
// 1. Gọi RPC admin_revoke_access bằng JWT của chính admin (RPC tự kiểm tra
//    auth.uid() bên trong — dùng service role sẽ làm auth.uid() = null và bị
//    chặn nhầm là "không có quyền"). RPC xoá dòng trong purchases, ghi nhật ký
//    vào access_revocations và trả về email khách + link Drive của bài.
// 2. Gọi Google Apps Script Web App để xoá quyền viewer của email đó.
// 3. Ghi lại vào nhật ký là đã gỡ được Drive hay chưa.
//
// ---------------------------------------------------------------------------
// VÌ SAO DÙNG KHOÁ SECRET RIÊNG `drive_revoke_webapp_url`?
// ---------------------------------------------------------------------------
// Bản Apps Script đầu tiên (chỉ biết cấp quyền) bỏ qua mọi field lạ và luôn
// addViewer. Nếu URL revoke lấy chung `drive_grant_webapp_url` thì khi Apps
// Script chưa được cập nhật, một lệnh "thu hồi" sẽ chạy thành "cấp quyền" —
// đúng ngược lại ý định, và không ai phát hiện ra.
//
// Nên ở đây có 2 lớp chặn:
//   • URL revoke nằm ở khoá app_secrets RIÊNG, chỉ được set sau khi Apps
//     Script bản mới đã deploy.
//   • Payload revoke KHÔNG chứa field `fileId`/`email` mà dùng `revokeFileId`/
//     `revokeEmail`. Script bản cũ đọc `data.fileId` = undefined nên
//     DriveApp.getFileById(undefined) sẽ ném lỗi — không thể cấp quyền nhầm.

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

type DriveResult = { ok: boolean; reason?: string };

async function revokeDriveAccess(targetUrl: string | null, email: string | null): Promise<DriveResult> {
  if (!targetUrl) return { ok: false, reason: "song_has_no_drive_link" };
  if (!email) return { ok: false, reason: "user_has_no_email" };

  const [webAppUrl, driveSecret] = await Promise.all([
    getSecret("drive_revoke_webapp_url"),
    getSecret("drive_grant_apps_script_secret"),
  ]);

  if (!webAppUrl) return { ok: false, reason: "revoke_webapp_not_configured" };
  if (!driveSecret) return { ok: false, reason: "apps_script_secret_missing" };

  const drive = extractDriveId(targetUrl);
  if (!drive) return { ok: false, reason: "could_not_parse_drive_id" };

  try {
    const resp = await fetch(webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: driveSecret,
        action: "revoke",
        // Cố tình KHÔNG đặt tên `fileId`/`email` — xem ghi chú đầu file.
        revokeFileId: drive.id,
        revokeEmail: email,
        isFolder: drive.isFolder,
      }),
    });

    const raw = await resp.text();
    console.log("[admin-revoke-access] drive revoke raw response:", raw);

    // Chỉ coi là thành công khi Apps Script xác nhận đúng là đã chạy nhánh
    // revoke. Bất kỳ phản hồi lạ nào (kể cả HTTP 200 của script bản cũ) đều
    // tính là thất bại để admin biết mà vào Drive gỡ tay.
    let parsed: { ok?: boolean; action?: string; reason?: string } | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "unexpected_apps_script_response" };
    }

    if (parsed?.ok === true && parsed?.action === "revoke") return { ok: true };
    return { ok: false, reason: parsed?.reason || "apps_script_refused_revoke" };
  } catch (err) {
    console.error("[admin-revoke-access] drive revoke failed:", err);
    return { ok: false, reason: "drive_revoke_request_failed" };
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

    // Xác nhận lại đúng là admin bằng service role (không tin riêng JWT) —
    // cùng bất biến bảo mật với các RPC admin_* khác trong dự án.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return json({ success: false, error: "forbidden" }, 403);
    }

    const { userId, songId, reason, note, removeDrive } = await req.json();
    if (!userId || !songId) return json({ success: false, error: "missing_userId_or_songId" }, 400);

    const { data: rpcResult, error: rpcError } = await userClient.rpc("admin_revoke_access", {
      p_user_id: userId,
      p_song_id: songId,
      p_reason: reason ?? null,
      p_note: note ?? null,
    });

    if (rpcError) {
      return json({ success: false, error: rpcError.message }, 400);
    }

    // Quyền trong web đã bị thu hồi xong ở trên. Bước Drive là bước phụ: thất
    // bại thì vẫn trả success = true nhưng báo rõ để admin gỡ tay.
    const shouldRemoveDrive = removeDrive !== false;
    const driveResult: DriveResult = shouldRemoveDrive
      ? await revokeDriveAccess(rpcResult?.song_target_url ?? null, rpcResult?.user_email ?? null)
      : { ok: false, reason: "skipped_by_admin" };

    if (rpcResult?.audit_id && shouldRemoveDrive) {
      await supabaseAdmin.rpc("admin_mark_revocation_drive", {
        p_audit_id: rpcResult.audit_id,
        p_drive_removed: driveResult.ok,
      });
    }

    return json({
      success: true,
      dbResult: rpcResult,
      driveRemoved: driveResult.ok,
      driveError: driveResult.ok ? undefined : driveResult.reason,
    });
  } catch (err) {
    console.error("[admin-revoke-access] error:", err);
    return json({ success: false, error: "internal_error" }, 500);
  }
});
