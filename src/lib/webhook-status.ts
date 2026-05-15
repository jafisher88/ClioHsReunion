/**
 * Per-recipient status precedence for inbound Resend webhook events.
 *
 * The funnel goes sent → delivered → opened → clicked. Once a row reaches a
 * terminal negative state (bounced / complained / failed) we never overwrite
 * it with anything else. `delivery_delayed` is only meaningful while still
 * at "sent" — after delivered we stop reporting it.
 */
const POSITIVE_RANK: Record<string, number> = {
  sent:      1,
  delivered: 2,
  opened:    3,
  clicked:   4,
};

const NEGATIVE_STATUSES = new Set(['bounced', 'complained', 'failed']);

export function shouldUpdate(currentStatus: string, newStatus: string): boolean {
  if (NEGATIVE_STATUSES.has(newStatus))     return true;
  if (NEGATIVE_STATUSES.has(currentStatus)) return false;
  if (newStatus === 'delivery_delayed')     return currentStatus === 'sent';
  const cur = POSITIVE_RANK[currentStatus] ?? 0;
  const nxt = POSITIVE_RANK[newStatus] ?? 0;
  return nxt > cur;
}
