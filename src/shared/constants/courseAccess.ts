import { CourseAccessTier } from '../types';

export const COURSE_ACCESS_TIER_LABELS: Record<CourseAccessTier, string> = {
  mocksessions_only: 'Mock Sessions Only',
  mocksession_and_lectures: 'Mock Sessions + Lectures',
};

export const formatCourseAccessTier = (tier: CourseAccessTier): string =>
  COURSE_ACCESS_TIER_LABELS[tier];
