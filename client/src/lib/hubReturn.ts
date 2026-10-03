// What the SmarThinkerz Hub appends to our return URL (Hub routes/checkout.ts, return
// handler): status=paid|cancelled|failed, order_id, tap_id and, when we sent one,
// external_ref. There is no plan parameter and no pending status: a charge still in
// progress goes to the Hub's own /checkout/pending page, never back to us. The redirect
// is a hint only; the plan is active when the signed webhook has been applied.
export interface HubReturn {
  status: 'paid' | 'cancelled' | 'failed';
  orderId: string | null;
  tapId: string | null;
  externalRef: string | null;
}

const clean = (v: string | null, re: RegExp) => (v && re.test(v) ? v : null);

export function parseHubReturn(search: string): HubReturn {
  const q = new URLSearchParams(search);
  const s = q.get('status');
  return {
    // Anything other than the two known outcomes, including a missing status, is a failure.
    status: s === 'paid' ? 'paid' : s === 'cancelled' ? 'cancelled' : 'failed',
    orderId: clean(q.get('order_id'), /^\d{1,12}$/),
    tapId: clean(q.get('tap_id'), /^[A-Za-z0-9_]{3,64}$/),
    externalRef: clean(q.get('external_ref'), /^[0-9a-f-]{36}$/),
  };
}
