// Logic thuần (không I/O) của webhook sepay-ipn: đọc payload SePay và quyết định
// một khoản tiền về thuộc trường hợp nào.
//
// Tách ra file riêng để kiểm thử được bằng vitest mà không cần Deno hay
// Supabase — đây là đoạn quyết định "cấp tab hay không" nên phải có test.

export type Direction = "in" | "out" | "unknown";

export interface TransferInfo {
  /** Mã giao dịch phía SePay, dùng để chống ghi trùng khi webhook bị gửi lại. */
  externalId: string | null;
  content: string;
  amount: number;
  direction: Direction;
  /** ISO 8601, hiểu theo giờ Việt Nam; null nếu payload không có. */
  occurredAt: string | null;
  gateway: string | null;
  referenceCode: string | null;
}

export interface OrderLite {
  id: string;
  user_id: string;
  song_id: string;
  amount: number;
  status: string;
}

export type UnmatchedReason =
  | "no_code"
  | "order_not_found"
  | "order_already_paid"
  | "order_expired"
  | "amount_low";

export type Decision =
  | { kind: "ignore_outgoing" }
  | { kind: "unmatched"; reason: UnmatchedReason; orderCode: string | null }
  | { kind: "match"; orderCode: string };

function textOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * SePay gửi thời gian dạng "2023-03-25 14:02:37" theo giờ Việt Nam (UTC+7),
 * không kèm múi giờ. Gắn +07:00 để lưu đúng thời điểm thay vì hiểu thành UTC.
 */
export function parseVietnamTime(value: unknown): string | null {
  const s = textOrNull(value);
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  const iso = m ? `${m[1]}T${m[2]}+07:00` : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseTransfer(body: Record<string, unknown>): TransferInfo {
  const type = String(body.transferType ?? "").toLowerCase();
  const direction: Direction = type === "in" ? "in" : type === "out" ? "out" : "unknown";

  return {
    externalId: textOrNull(body.id) ?? textOrNull(body.referenceCode),
    content: String(body.content ?? ""),
    amount: Number(body.transferAmount ?? 0),
    direction,
    occurredAt: parseVietnamTime(body.transactionDate),
    gateway: textOrNull(body.gateway),
    referenceCode: textOrNull(body.referenceCode),
  };
}

/** Mã đơn dạng DH + ít nhất 6 chữ số, không phân biệt hoa thường. */
export function extractOrderCode(content: string): string | null {
  const m = content.toUpperCase().match(/DH\d{6,}/);
  return m ? m[0] : null;
}

/**
 * Quyết định cho một khoản tiền về. Nhánh "match" giữ NGUYÊN điều kiện cũ (đơn
 * đang chờ VÀ số tiền >= giá đơn) — phần mới chỉ là nói rõ VÌ SAO các trường hợp
 * còn lại không khớp, để admin thấy được thay vì chỉ có một dòng console.log.
 */
export function decideTransfer(
  transfer: TransferInfo,
  orderCode: string | null,
  order: OrderLite | null
): Decision {
  // Tiền RA khỏi tài khoản không phải khách thanh toán. Trước đây không kiểm
  // tra hướng, nên một giao dịch chuyển ra có chứa mã DH cũng có thể bị hiểu là
  // tiền vào.
  if (transfer.direction === "out") return { kind: "ignore_outgoing" };

  if (!orderCode) return { kind: "unmatched", reason: "no_code", orderCode: null };
  if (!order) return { kind: "unmatched", reason: "order_not_found", orderCode };

  if (order.status === "paid") {
    // Cùng một giao dịch bị gửi lại thì đã bị chặn bằng external_id; đến được
    // đây nghĩa là khách chuyển THÊM một khoản nữa cho đơn đã trả — cần hoàn tiền.
    return { kind: "unmatched", reason: "order_already_paid", orderCode };
  }
  if (order.status !== "pending") {
    return { kind: "unmatched", reason: "order_expired", orderCode };
  }
  if (transfer.amount < Number(order.amount)) {
    return { kind: "unmatched", reason: "amount_low", orderCode };
  }

  return { kind: "match", orderCode };
}
