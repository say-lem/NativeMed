import { Schema, model, Document, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-document interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface IBloodTestRow {
  test: string;           // e.g. "ALT"
  result: string;         // e.g. "91 U/L"
  referenceRange: string; // e.g. "10–45 U/L"
  isAbnormal: boolean;    // drives red-highlight in the UI table
}

export interface IBloodTestResults {
  summary: string;          // free-text summary of which panels were normal/abnormal
  rows: IBloodTestRow[];    // the actual table rows
}

export interface IRecentConsultation {
  date?: Date;
  seenBy: string;           // e.g. "HCA Mandy Overton"
  role?: string;            // e.g. "Healthcare Assistant"
  notes: string;            // free-text — vitals, reason, findings
}

export interface IPatientData {
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  pastMedicalHistory: string[];
  drugHistory: string[];
  recentConsultation: IRecentConsultation;
  bloodTestResults: IBloodTestResults;
}

export interface IMarkingSchemeSection {
  heading: string;          // e.g. "Data Gathering and Diagnosis"
  points: string[];         // bullet-point strings
}

export interface IFurtherResource {
  title: string;
  url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Root document interface
// ─────────────────────────────────────────────────────────────────────────────

export interface IMockCase extends Document {
  _id: Types.ObjectId;

  // ── Identity & discovery ──────────────────────────────────────────────────
  stationNumber: number;           // e.g. 2  (used for ordering/display)
  title: string;                   // e.g. "Abnormal LFTs – Fatty Liver"
  consultationType: string;        // e.g. "Video Consultation" | "Telephone Consultation"
  specialty: string;               // e.g. "Gastroenterology"
  difficulty: 'easy' | 'medium' | 'hard';
  isPublished: boolean;
  imageUrl?: string;
  imagePublicId?: string;
  createdBy: Types.ObjectId;

  // ── Patient data (the candidate's briefing sheet) ────────────────────────
  patientData: IPatientData;

  // ── Case content sections ─────────────────────────────────────────────────
  patientStory: string;            // role-player brief — rich text / markdown
  markingScheme: IMarkingSchemeSection[];
  exampleExplanation: string;      // rich text — the model explanation to patient
  management: string[];            // bullet-point list
  learningPoints: string;          // rich text — educational content for this station
  furtherResources: IFurtherResource[];

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-document schemas
// ─────────────────────────────────────────────────────────────────────────────

const bloodTestRowSchema = new Schema<IBloodTestRow>(
  {
    test:           { type: String, required: true, trim: true },
    result:         { type: String, required: true, trim: true },
    referenceRange: { type: String, trim: true, default: 'N/A' }, // not all tests have a range
    isAbnormal:     { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const bloodTestResultsSchema = new Schema<IBloodTestResults>(
  {
    summary: { type: String, required: true, trim: true },
    rows:    { type: [bloodTestRowSchema], default: [] },
  },
  { _id: false },
);

const recentConsultationSchema = new Schema<IRecentConsultation>(
  {
    date:   { type: Date },
    seenBy: { type: String, required: true, trim: true },
    role:   { type: String, trim: true },
    notes:  { type: String, required: true, trim: true },
  },
  { _id: false },
);

const patientDataSchema = new Schema<IPatientData>(
  {
    name:               { type: String, required: true, trim: true },
    age:                { type: Number, required: true, min: 0, max: 130 },
    gender:             { type: String, enum: ['male', 'female', 'other'], required: true },
    pastMedicalHistory: { type: [String], default: [] },
    drugHistory:        { type: [String], default: [] },
    recentConsultation: { type: recentConsultationSchema, required: true },
    bloodTestResults:   { type: bloodTestResultsSchema, required: true },
  },
  { _id: false },
);

const markingSchemeSectionSchema = new Schema<IMarkingSchemeSection>(
  {
    heading: { type: String, required: true, trim: true },
    points:  { type: [String], required: true },
  },
  { _id: false },
);

const furtherResourceSchema = new Schema<IFurtherResource>(
  {
    title: { type: String, required: true, trim: true },
    url:   { type: String, required: true, trim: true },
  },
  { _id: false },
);

// ─────────────────────────────────────────────────────────────────────────────
// Root schema
// ─────────────────────────────────────────────────────────────────────────────

const mockCaseSchema = new Schema<IMockCase>(
  {
    stationNumber:    { type: Number, required: true },
    title:            { type: String, required: true, trim: true },
    consultationType: { type: String, required: true, trim: true },
    specialty:        { type: String, required: true, trim: true },
    difficulty:    { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    isPublished:   { type: Boolean, default: false },
    imageUrl:      { type: String },
    imagePublicId: { type: String, select: false },
    createdBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },

    patientData: { type: patientDataSchema, required: true },

    patientStory:       { type: String, required: true, trim: true },
    markingScheme:      { type: [markingSchemeSectionSchema], default: [] },
    exampleExplanation: { type: String, required: true, trim: true },
    management:         { type: [String], default: [] },
    learningPoints:     { type: String, required: true, trim: true },
    furtherResources:   { type: [furtherResourceSchema], default: [] },
  },
  { timestamps: true },
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────

mockCaseSchema.index({ isPublished: 1, specialty: 1 });
mockCaseSchema.index({ isPublished: 1, difficulty: 1 });
mockCaseSchema.index({ stationNumber: 1 });
mockCaseSchema.index({ createdBy: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// Text index — lets users search by title, specialty or patient name
// ─────────────────────────────────────────────────────────────────────────────

mockCaseSchema.index(
  {
    title:              'text',
    specialty:          'text',
    'patientData.name': 'text',
    learningPoints:     'text',
  },
  { name: 'cases_text_search' },
);

mockCaseSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safeRet = ret as unknown as Record<string, unknown>;
    delete safeRet.imagePublicId;
    delete safeRet.__v;
    return safeRet;
  },
});

export const MockCase = model<IMockCase>('MockCase', mockCaseSchema);