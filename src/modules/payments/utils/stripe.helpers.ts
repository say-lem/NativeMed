import Stripe from 'stripe';

type LegacyInvoice = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
};

const resolveStripeId = (value: string | { id: string } | null | undefined): string | null => {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
};

export const getInvoiceSubscriptionId = (invoice: Stripe.Invoice): string | null => {
  if (invoice.parent?.type === 'subscription_details') {
    const fromParent = resolveStripeId(invoice.parent.subscription_details?.subscription ?? null);
    if (fromParent) return fromParent;
  }

  return resolveStripeId((invoice as LegacyInvoice).subscription ?? null);
};

export const getSubscriptionPeriod = (stripeSub: Stripe.Subscription) => {
  const item = stripeSub.items.data[0];
  const start = item?.current_period_start ?? stripeSub.start_date;
  const end = item?.current_period_end ?? stripeSub.start_date;

  return {
    currentPeriodStart: new Date(start * 1000),
    currentPeriodEnd: new Date(end * 1000),
  };
};

export const getInvoicePaymentIntentId = (invoice: Stripe.Invoice): string | undefined => {
  const fromPayments = resolveStripeId(
    invoice.payments?.data?.[0]?.payment?.payment_intent ?? null,
  );
  if (fromPayments) return fromPayments;

  const fromLegacy = resolveStripeId((invoice as LegacyInvoice).payment_intent ?? null);
  if (fromLegacy) return fromLegacy;

  const fromError = resolveStripeId(invoice.last_finalization_error?.payment_intent ?? null);
  if (fromError) return fromError;

  return undefined;
};

export type StripeSubscriptionStatus = Stripe.Subscription['status'];

export const mapStripeSubscriptionStatus = (
  status: StripeSubscriptionStatus,
): 'active' | 'expired' | 'cancelled' | 'past_due' => {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return 'cancelled';
    default:
      return 'expired';
  }
};
