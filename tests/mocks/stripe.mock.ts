// Manual mock for src/config/stripe.ts, wired up per test file via:
//   jest.mock('<relative path>/src/config/stripe', () => require('<relative path>/mocks/stripe.mock'));
// Keeps every test offline: no real requests ever hit Stripe's API.

export const stripeMock = {
  checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
  subscriptions: {
    retrieve: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
  },
  products: { update: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
  billingPortal: { sessions: { create: jest.fn() } },
};

export const stripe = stripeMock;
