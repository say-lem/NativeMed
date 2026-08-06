/**
 * test-stripe-connection.ts
 * -------------------------
 * Validates Stripe API connectivity, price IDs, and checkout session creation.
 *
 * Usage: npm run test:stripe
 */

import { env } from '../config/env';
import { stripe } from '../config/stripe';

const PRICE_VARS = [
  ['STRIPE_PRICE_CASE_BANK_MONTHLY', env.STRIPE_PRICE_CASE_BANK_MONTHLY],
  ['STRIPE_PRICE_COURSE_PDF_MONTHLY', env.STRIPE_PRICE_COURSE_PDF_MONTHLY],
  ['STRIPE_PRICE_COURSE_PDF_QUARTERLY', env.STRIPE_PRICE_COURSE_PDF_QUARTERLY],
  ['STRIPE_PRICE_COURSE_FULL_MONTHLY', env.STRIPE_PRICE_COURSE_FULL_MONTHLY],
  ['STRIPE_PRICE_COURSE_FULL_QUARTERLY', env.STRIPE_PRICE_COURSE_FULL_QUARTERLY],
] as const;

const formatInterval = (interval: string, intervalCount: number) => {
  if (intervalCount === 3 && interval === 'month') return 'every 3 months';
  if (intervalCount === 1) return `/${interval}`;
  return `every ${intervalCount} ${interval}s`;
};

const main = async () => {
  const results: string[] = [];
  const errors: string[] = [];

  const mode = env.STRIPE_SECRET_KEY.startsWith('sk_live_')
    ? 'live'
    : env.STRIPE_SECRET_KEY.startsWith('sk_test_')
      ? 'test'
      : 'unknown';

  try {
    const balance = await stripe.balance.retrieve();
    const gbp = balance.available.find((b) => b.currency === 'gbp');
    results.push(
      `API connection: OK (${mode} mode${gbp !== undefined ? ', GBP balance accessible' : ''})`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`API connection failed: ${message}`);
    printReport(results, errors);
    process.exit(1);
  }

  if (!env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
    errors.push('STRIPE_WEBHOOK_SECRET should start with whsec_');
  } else {
    results.push('Webhook secret: format OK (whsec_*)');
  }

  for (const [name, priceId] of PRICE_VARS) {
    try {
      const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
      const product = typeof price.product === 'object' && price.product ? price.product : null;
      const issues: string[] = [];

      if (!price.active) issues.push('inactive');
      if (price.currency !== 'gbp') issues.push(`currency=${price.currency} (expected gbp)`);
      if (price.type !== 'recurring') issues.push('not recurring');
      if (!price.recurring) issues.push('missing recurring config');
      if (price.unit_amount == null) issues.push('missing unit_amount');

      const label =
        product && 'name' in product && product.name ? product.name : priceId;

      if (issues.length) {
        errors.push(`${name} (${priceId}): ${issues.join(', ')}`);
        continue;
      }

      const recurring = price.recurring!;
      results.push(
        `${name}: OK — £${(price.unit_amount! / 100).toFixed(2)} ${formatInterval(recurring.interval, recurring.interval_count ?? 1)} — ${label}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${name} (${priceId}): retrieve failed — ${message}`);
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: 'stripe-test@example.com',
      line_items: [{ price: env.STRIPE_PRICE_CASE_BANK_MONTHLY, quantity: 1 }],
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      metadata: { userId: 'test', type: 'case_bank', interval: 'monthly' },
      subscription_data: {
        metadata: { userId: 'test', type: 'case_bank', interval: 'monthly' },
      },
    });
    await stripe.checkout.sessions.expire(session.id);
    results.push('Checkout session create/expire: OK');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Checkout session test failed: ${message}`);
  }

  printReport(results, errors);
  process.exit(errors.length > 0 ? 1 : 0);
};

const printReport = (results: string[], errors: string[]) => {
  console.log('\n=== Stripe Connection Test ===\n');
  for (const line of results) console.log(`  ✓ ${line}`);
  for (const line of errors) console.log(`  ✗ ${line}`);
  console.log(`\nResult: ${errors.length === 0 ? 'PASS' : 'FAIL'} (${errors.length} issue(s))\n`);
};

main().catch((error) => {
  console.error('Stripe test crashed:', error);
  process.exit(1);
});
