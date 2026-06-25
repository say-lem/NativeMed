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

export const COURSE_PLANS: PlanDefinition[] = [
  {
    type: 'course',
    tier: 'pdf_only',
    name: 'Course — PDF Only',
    description: 'Access to course PDF materials on the website.',
    prices: [
      {
        amount: 6999,
        currency: 'gbp',
        interval: 'monthly',
        stripePriceId: env.STRIPE_PRICE_COURSE_PDF_MONTHLY,
        label: '£69.99 / month',
      },
      {
        amount: 19900,
        currency: 'gbp',
        interval: 'quarterly',
        stripePriceId: env.STRIPE_PRICE_COURSE_PDF_QUARTERLY,
        label: '£199 / 3 months',
      },
    ],
  },
  {
    type: 'course',
    tier: 'pdf_drive',
    name: 'Course — PDF + Drive',
    description: 'Access to course PDFs plus audio and video on Google Drive.',
    prices: [
      {
        amount: 9999,
        currency: 'gbp',
        interval: 'monthly',
        stripePriceId: env.STRIPE_PRICE_COURSE_FULL_MONTHLY,
        label: '£99.99 / month',
      },
      {
        amount: 28900,
        currency: 'gbp',
        interval: 'quarterly',
        stripePriceId: env.STRIPE_PRICE_COURSE_FULL_QUARTERLY,
        label: '£289 / 3 months',
      },
    ],
  },
];

export const ALL_PLANS: PlanDefinition[] = [CASE_BANK_PLAN, ...COURSE_PLANS];

export const resolvePlanPrice = (
  type: SubscriptionType,
  interval: BillingInterval,
  tier?: CourseAccessTier,
): PlanPrice => {
  if (type === 'case_bank') {
    const price = CASE_BANK_PLAN.prices.find((p) => p.interval === interval);
    if (!price) throw new Error(`No case bank plan for interval: ${interval}`);
    return price;
  }

  if (!tier) throw new Error('Course subscriptions require a tier');
  const plan = COURSE_PLANS.find((p) => p.tier === tier);
  if (!plan) throw new Error(`Unknown course tier: ${tier}`);

  const price = plan.prices.find((p) => p.interval === interval);
  if (!price) throw new Error(`No course plan for tier ${tier} and interval ${interval}`);
  return price;
};
