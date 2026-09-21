import { env } from '../../../config/env';
import { BillingInterval, SubscriptionType } from '../../../shared/types';

export interface PlanPrice {
  amount: number;       // in pence
  currency: 'gbp';
  interval: BillingInterval;
  stripePriceId: string;
  label: string;
}

export interface PlanDefinition {
  type: SubscriptionType;
  name: string;
  description: string;
  prices: PlanPrice[];
  // Live toggle, only meaningful (and populated) for the case_bank plan —
  // see getAvailablePlans() in the service, which merges this in at request
  // time since it's runtime-mutable admin state, not a static plan detail.
  paymentsPaused?: boolean;
}

export const CASE_BANK_PLAN: PlanDefinition = {
  type: 'case_bank',
  name: 'Case Bank Access',
  description: 'Unlimited access to all mock clinical cases for one month.',
  prices: [
    {
      amount: 2499,
      currency: 'gbp',
      interval: 'monthly',
      stripePriceId: env.STRIPE_PRICE_CASE_BANK_MONTHLY,
      label: '£24.99 / month',
    },
  ],
};

/** Course checkout plan — amount comes from each course's own pricing. */
export const COURSE_PLANS: PlanDefinition[] = [
  {
    type: 'course',
    name: 'Course',
    description: 'Access to course materials on Google Drive. Price is set per course.',
    prices: [],
  },
];

export const ALL_PLANS: PlanDefinition[] = [CASE_BANK_PLAN, ...COURSE_PLANS];

export const resolveCaseBankPlanPrice = (interval: BillingInterval): PlanPrice => {
  const price = CASE_BANK_PLAN.prices.find((p) => p.interval === interval);
  if (!price) throw new Error(`No case bank plan for interval: ${interval}`);
  return price;
};
