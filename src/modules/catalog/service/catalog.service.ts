import * as coursesService from '../../courses/service/courses.service';
import { BookingProduct } from '../../booking/model/booking.model';
import { MockCase } from '../../cases/model/cases.model';
import { CASE_BANK_PLAN } from '../../subscriptions/constants/plans';

// ─────────────────────────────────────────────────────────────────────────────
// Public catalog — everything a user can pay for on the platform, in one list:
// courses, one-on-one booking sessions, and the case bank. Read-only, no
// persistence of its own — it aggregates the other modules' public data.
// ─────────────────────────────────────────────────────────────────────────────

export const getAllProducts = async () => {
  const [courses, bookingProducts, caseCount] = await Promise.all([
    coursesService.getAllPublished(),
    BookingProduct.find({ isPublished: true })
      .select('title description price')
      .sort({ createdAt: -1 }),
    MockCase.countDocuments({ isPublished: true }),
  ]);

  const courseProducts = courses.map((course) => ({
    type: 'course' as const,
    _id: course._id,
    title: course.title,
    description: course.description,
    thumbnailUrl: course.thumbnailUrl,
    pricing: course.pricing,
  }));

  const oneOnOneProducts = bookingProducts.map((product) => ({
    type: 'one_on_one' as const,
    _id: product._id,
    title: product.title,
    description: product.description,
    price: product.price,
  }));

  // Not a persisted document — the case bank is a single site-wide offering,
  // so it carries no _id. caseCount is live, same as the homepage's caseNumber.
  const caseBankProduct = {
    type: 'case_bank' as const,
    title: CASE_BANK_PLAN.name,
    description: CASE_BANK_PLAN.description,
    prices: CASE_BANK_PLAN.prices,
    caseCount,
  };

  return [...courseProducts, ...oneOnOneProducts, caseBankProduct];
};
