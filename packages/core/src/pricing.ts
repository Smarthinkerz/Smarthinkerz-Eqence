// Pricing is configuration, not code (brief, Phase 3). Two candidate ladders are kept
// side by side until Fathi confirms one; PRICING_LADDER selects the active one. Until
// then no ladder is active, so only super users can run billable AI actions.

export interface Plan {
  slug: string;              // Hub plan slug, e.g. eqence-basic
  name: string;
  monthlyUsd: number;
  yearlyUsd: number | null;
  channels: number;          // connected sources allowed
  aiActionsPerMonth: number; // billable AI actions; -1 = unlimited
  contactOnly?: boolean;     // sold by contract, never through self-serve checkout
}

// The ladder on eqence.com, confirmed by Fathi on 2026-10-01: Starter $29, Basic $59,
// Advance $99, Premium $199 self-serve; Enterprise $499 by contact. Annual = 10x monthly
// (two months free). Metered on AI-drafted replies; analysis is free; no free tier.
export const SITE_LADDER: Plan[] = [
  { slug: 'eqence-starter', name: 'Starter', monthlyUsd: 29, yearlyUsd: 290, channels: 1, aiActionsPerMonth: 100 },
  { slug: 'eqence-basic', name: 'Basic', monthlyUsd: 59, yearlyUsd: 590, channels: 3, aiActionsPerMonth: 500 },
  { slug: 'eqence-advance', name: 'Advance', monthlyUsd: 99, yearlyUsd: 990, channels: 5, aiActionsPerMonth: 2000 },
  { slug: 'eqence-premium', name: 'Premium', monthlyUsd: 199, yearlyUsd: 1990, channels: 10, aiActionsPerMonth: 10000 },
  { slug: 'eqence-enterprise', name: 'Enterprise', monthlyUsd: 499, yearlyUsd: 4990, channels: -1, aiActionsPerMonth: -1, contactOnly: true },
];

// The merge spec's metered ladder (docs/merge-spec.md §7). Enterprise is "custom" there
// and is sold by contract, not through self-serve checkout.
export const METERED_LADDER: Plan[] = [
  { slug: 'eqence-growth', name: 'Growth', monthlyUsd: 39, yearlyUsd: null, channels: 3, aiActionsPerMonth: 500 },
  { slug: 'eqence-pro', name: 'Pro', monthlyUsd: 99, yearlyUsd: null, channels: 7, aiActionsPerMonth: 3000 },
  { slug: 'eqence-scale', name: 'Scale', monthlyUsd: 249, yearlyUsd: null, channels: 15, aiActionsPerMonth: 15000 },
];

export function activeLadder(name = process.env.PRICING_LADDER): Plan[] {
  if (name === 'site') return SITE_LADDER;
  if (name === 'metered') return METERED_LADDER;
  return [];
}

export function planBySlug(slug: string | null | undefined, ladder = activeLadder()): Plan | undefined {
  return slug ? ladder.find((p) => p.slug === slug) : undefined;
}

/** Plans a customer can buy through the Hub checkout (contact-only plans excluded). */
export function selfServePlans(ladder = activeLadder()): Plan[] {
  return ladder.filter((p) => !p.contactOnly);
}
