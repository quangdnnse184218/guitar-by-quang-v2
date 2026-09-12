// Edge Function: verify-hssv-card
//
// Khách tick "Tôi là Học sinh/Sinh viên" trong modal thanh toán rồi upload
// ảnh thẻ HSSV lên bucket riêng tư "hssv-cards" (RLS: mỗi user chỉ đọc/ghi
// được đúng thư mục {user_id}/ của mình). Hàm này tải lại ảnh đó bằng
// service role, nhờ Gemini (Google AI Studio) đọc ảnh và trả lời 2 câu hỏi:
// có đúng là thẻ HSSV không, và năm hiệu lực có >= năm hiện tại không —
// CHỈ kiểm tra lỏng như vậy, không đối chiếu tên/trường với chủ tài khoản.
// Nếu đạt, tự hạ giá đơn hàng (orders.amount) xuống giá HSSV lấy từ
// songs.discount_note (vd "HSSV: 179k" -> 179000) để SePay webhook đối
// chiếu đúng số tiền thấp hơn khi khách chuyển khoản.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// btoa(String.fromCharCode(...bytes)) sập ngay với ảnh vài MB thật từ điện
// thoại vì spread hàng triệu phần tử vượt giới hạn tham số hàm của JS — phải
// nối base64 theo từng đoạn nhỏ (32KB) thay vì truyền cả mảng một lần.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// "HSSV: 179k" -> 179000. Cùng logic quy đổi "179" -> 179k như
// formatCompactPrice ở phía client (src/kho-tab.js, src/main.js).
function parseVndAmount(text: string | null | undefined): number | null {
  if (!text) return null;
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) return null;
  let n = Number(digits);
  if (n > 0 && n < 1000) n *= 1000;
  return n > 0 ? n : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ approved: false, error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) return json({ approved: false, error: "unauthorized" }, 401);

    const { orderId, imagePath } = await req.json();
    if (!orderId || !imagePath) return json({ approved: false, error: "missing_params" }, 400);

    // Chặn IDOR: path upload phải nằm đúng thư mục của chính user gọi hàm này.
    if (!String(imagePath).startsWith(`${user.id}/`)) {
      return json({ approved: false, error: "path_mismatch" }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, user_id, song_id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order || order.user_id !== user.id) {
      return json({ approved: false, error: "order_not_found" }, 404);
    }
    if (order.status === "paid") {
      return json({ approved: false, error: "already_paid" });
    }

    const { data: fileBlob, error: downloadErr } = await admin.storage
      .from("hssv-cards")
      .download(imagePath);

    if (downloadErr || !fileBlob) {
      return json({ approved: false, error: "image_download_failed" }, 500);
    }

    const { data: secretRow } = await admin
      .from("app_secrets")
      .select("value")
      .eq("key", "gemini_api_key")
      .maybeSingle();

    const geminiKey = secretRow?.value;
    if (!geminiKey) return json({ approved: false, error: "ai_not_configured" }, 500);

    const arrayBuffer = await fileBlob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = fileBlob.type || "image/jpeg";
    const currentYear = new Date().getFullYear();

    const prompt = `Bạn đang xem một ảnh chụp thẻ Học sinh/Sinh viên (HSSV) tại Việt Nam.
Nhiệm vụ: xác định 2 điều, KHÔNG cần kiểm tra tên/trường/ảnh có khớp với ai đang dùng thẻ hay không.
1. is_student_card: ảnh có phải là một tấm thẻ học sinh hoặc sinh viên thật (có logo trường, chữ "THẺ HỌC SINH"/"THẺ SINH VIÊN" hoặc tương đương) hay không.
2. valid_year: thẻ có ghi năm hiệu lực / niên khóa / giá trị sử dụng đến năm mà năm đó >= ${currentYear} hay không (nếu ghi dạng niên khóa như "2023-2027" thì lấy năm kết thúc). Nếu ảnh mờ không đọc được năm, để valid_year = false.
Trả lời DUY NHẤT bằng JSON hợp lệ, không thêm chữ nào khác:
{"is_student_card": boolean, "valid_year": boolean, "reason": "giải thích ngắn gọn bằng tiếng Việt"}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      }
    );

    if (!geminiRes.ok) {
      console.error("Gemini API error:", await geminiRes.text());
      await admin
        .from("orders")
        .update({ is_hssv: true, hssv_image_path: imagePath, hssv_status: "rejected" })
        .eq("id", orderId);
      return json({ approved: false, error: "ai_error" }, 502);
    }

    const geminiJson = await geminiRes.json();
    // Model "thinking" đôi khi trả về nhiều phần tử trong parts[] (phần suy
    // luận nội bộ + phần trả lời cuối) — lấy đúng phần có "text" và không
    // đánh dấu thought:true thay vì luôn tin chắc parts[0] là câu trả lời.
    const parts: Array<{ text?: string; thought?: boolean }> =
      geminiJson?.candidates?.[0]?.content?.parts ?? [];
    const rawText = parts.find((p) => p.text && !p.thought)?.text ?? parts[0]?.text ?? "{}";

    let parsed: { is_student_card?: boolean; valid_year?: boolean; reason?: string } = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {};
    }

    const approved = Boolean(parsed.is_student_card && parsed.valid_year);

    if (approved) {
      const { data: song } = await admin
        .from("songs")
        .select("discount_note")
        .eq("id", order.song_id)
        .maybeSingle();

      const discountedAmount = parseVndAmount(song?.discount_note);

      await admin
        .from("orders")
        .update({
          is_hssv: true,
          hssv_image_path: imagePath,
          hssv_status: "approved",
          ...(discountedAmount ? { amount: discountedAmount } : {}),
        })
        .eq("id", orderId);

      return json({ approved: true, newAmount: discountedAmount, reason: parsed.reason });
    }

    await admin
      .from("orders")
      .update({ is_hssv: true, hssv_image_path: imagePath, hssv_status: "rejected" })
      .eq("id", orderId);

    return json({
      approved: false,
      reason: parsed.reason || "Không nhận diện được thẻ HSSV hợp lệ hoặc còn hiệu lực.",
    });
  } catch (err) {
    console.error("verify-hssv-card error:", err);
    return json({ approved: false, error: "internal_error" }, 500);
  }
});
