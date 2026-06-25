import Stripe from 'stripe';

export const getInvoiceSubscriptionId = (invoice: Stripe.Invoice): string | null => {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
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
  const fromError = invoice.last_finalization_error?.payment_intent;
  if (fromError) return typeof fromError === 'string' ? fromError : fromError.id;
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
