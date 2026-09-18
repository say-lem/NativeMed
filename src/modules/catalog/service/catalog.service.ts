import * as coursesService from '../../courses/service/courses.service';
import * as liveCoursesService from '../../liveCourses/service/liveCourses.service';
import * as caseBankOverviewService from '../../cases/service/caseBankOverview.service';
import { BookingProduct } from '../../booking/model/booking.model';
import { MockCase } from '../../cases/model/cases.model';
import { CASE_BANK_PLAN } from '../../subscriptions/constants/plans';

// ─────────────────────────────────────────────────────────────────────────────
// Public catalog — everything a user can pay for on the platform, in one list:
// courses, live courses, one-on-one booking sessions, and the case bank.
// Read-only, no persistence of its own — it aggregates the other modules'
// public data.
// ─────────────────────────────────────────────────────────────────────────────

export const getAllProducts = async () => {
  const [courses, liveCourses, bookingProducts, caseCount, caseBankOverview] = await Promise.all([
    coursesService.getAllPublished(),
    liveCoursesService.getAllPublishedLiveCourses(),
    BookingProduct.find({ isPublished: true })
      .select('title description price')
      .sort({ createdAt: -1 }),
    MockCase.countDocuments({ isPublished: true }),
    caseBankOverviewService.getCaseBankOverview(),
  ]);

  const courseProducts = courses.map((course) => ({
    type: 'course' as const,
    _id: course._id,
    title: course.title,
    description: course.description,
    thumbnailUrl: course.thumbnailUrl,
    pricing: course.pricing,
  }));

  const liveCourseProducts = liveCourses.map((course) => ({
    type: 'live_course' as const,
    _id: course._id,
    title: course.title,
    description: course.description,
    thumbnailUrl: course.thumbnailUrl,
    price: course.price,
    startDate: course.startDate,
    endDate: course.endDate,
  }));

  const oneOnOneProducts = bookingProducts.map((product) => ({
    type: 'one_on_one' as const,
    _id: product._id,
    title: product.title,
    description: product.description,
    price: product.price,
  }));

  // Not a persisted document of its own — the case bank is a single site-wide
  // offering, so it carries no _id. title/description/imageUrl come from the
  // admin-editable CaseBankOverview (see cases/caseBankOverview.service.ts);
  // prices still come from CASE_BANK_PLAN (Stripe), and caseCount is live,
  // same as the homepage's caseNumber.
  const caseBankProduct = {
    type: 'case_bank' as const,
    title: caseBankOverview.title,
    description: caseBankOverview.description,
    imageUrl: caseBankOverview.imageUrl ?? null,
    prices: CASE_BANK_PLAN.prices,
    caseCount,
  };

  return [...courseProducts, ...liveCourseProducts, ...oneOnOneProducts, caseBankProduct];
};
