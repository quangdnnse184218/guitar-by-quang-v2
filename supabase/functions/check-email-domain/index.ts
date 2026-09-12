// Edge Function: check-email-domain
//
// Kiểm tra domain của một địa chỉ email có thực sự nhận được thư hay không,
// bằng cách tra MX record (và fallback sang A/AAAA) qua DNS-over-HTTPS.
// Mục đích: chặn các domain rõ ràng không tồn tại (vd gõ nhầm "gmlai.con"
// thay vì "gmail.com") ngay lúc đăng ký, MÀ KHÔNG bắt người dùng phải xác
// minh email thật (không thêm bước "check hộp thư" gây phiền phức).
//
// Đây không phải xác minh 100% hộp thư có tồn tại (không đọc được điều đó
// từ bên ngoài), chỉ xác minh domain có hạ tầng nhận mail hợp lệ.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DNS_ENDPOINT = "https://dns.google/resolve";

// Vài domain phổ biến để gợi ý sửa lỗi gõ nhầm (khoảng cách Levenshtein <= 2)
const POPULAR_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
];

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function suggestDomain(domain: string): string | null {
  let best: string | null = null;
  let bestDist = 4; // chỉ gợi ý nếu đủ gần (<= 3)
  for (const candidate of POPULAR_DOMAINS) {
    const dist = levenshtein(domain, candidate);
    if (dist < bestDist && dist > 0) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

async function hasDnsRecord(domain: string, type: "MX" | "A"): Promise<boolean> {
  try {
    const res = await fetch(
      `${DNS_ENDPOINT}?name=${encodeURIComponent(domain)}&type=${type}`,
      { headers: { accept: "application/dns-json" } }
    );
    if (!res.ok) return false;
    const data = await res.json();
    // Status 0 = NOERROR. Answer array phải có ít nhất 1 record thật.
    return data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
  } catch {
    // Nếu DNS lookup lỗi mạng, không chặn đăng ký (fail-open) để tránh
    // biến lỗi hạ tầng tạm thời thành chặn nhầm người dùng hợp lệ.
    return true;
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ valid: false, reason: "invalid_format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const domain = email.trim().toLowerCase().split("@").pop() ?? "";

    if (!domain) {
      return new Response(
        JSON.stringify({ valid: false, reason: "invalid_format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Domain phổ biến: bỏ qua tra DNS để phản hồi nhanh, đỡ tốn quota.
    if (POPULAR_DOMAINS.includes(domain)) {
      return new Response(JSON.stringify({ valid: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Domain nhận mail hợp lệ cần có MX record; một số domain nhỏ dùng A
    // record làm fallback (implicit MX) nên vẫn chấp nhận nếu có A record.
    const hasMx = await hasDnsRecord(domain, "MX");
    const valid = hasMx || (await hasDnsRecord(domain, "A"));

    if (!valid) {
      const suggestion = suggestDomain(domain);
      return new Response(
        JSON.stringify({ valid: false, reason: "domain_not_found", suggestion }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ valid: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-email-domain error:", err);
    // Lỗi không lường trước: fail-open, không chặn nhầm người dùng hợp lệ.
    return new Response(JSON.stringify({ valid: true, reason: "check_failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
