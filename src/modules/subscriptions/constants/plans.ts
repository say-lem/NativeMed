import { env } from '../../../config/env';
import {
  BillingInterval,
  CourseAccessTier,
  SubscriptionType,
} from '../../../shared/types';

export interface PlanPrice {
  amount: number;       // in pence
  currency: 'gbp';
  interval: BillingInterval;
  stripePriceId: string;
  label: string;
}

export interface PlanDefinition {
  type: SubscriptionType;
  tier?: CourseAccessTier;
  name: string;
  description: string;
  prices: PlanPrice[];
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

/** Access tiers for course checkout — amounts come from each course's priceMonthly / priceQuarterly. */
export const COURSE_PLANS: PlanDefinition[] = [
  {
    type: 'course',
    tier: 'mocksessions_only',
    name: 'Course — Mock Sessions Only',
    description: 'Access to mock session materials on Google Drive. Price is set per course.',
    prices: [],
  },
  {
    type: 'course',
    tier: 'mocksession_and_lectures',
    name: 'Course — Mock Sessions + Lectures',
    description: 'Access to mock sessions and lecture materials on Google Drive. Price is set per course.',
    prices: [],
  },
];

export const ALL_PLANS: PlanDefinition[] = [CASE_BANK_PLAN, ...COURSE_PLANS];

export const resolveCaseBankPlanPrice = (interval: BillingInterval): PlanPrice => {
  const price = CASE_BANK_PLAN.prices.find((p) => p.interval === interval);
  if (!price) throw new Error(`No case bank plan for interval: ${interval}`);
  return price;
};
