
export type BloomLevel = 'knowledge' | 'comprehension' | 'application' | 'analysis' | 'synthesis' | 'evaluation';
export type PerformanceLevel = 'excellent' | 'good' | 'acceptable' | 'insufficient' | 'absent';

export interface WebPlagiarismSource {
  sourceUrl: string;
  originalText: string;
  studentText: string;
}

export interface CheatingAnalysis {
  detected: boolean;
  reasoning: string;
  webSources?: WebPlagiarismSource[];
  isAiGenerated?: boolean;
}

export interface DetailedFeedbackItem {
  question: string;
  studentAnswer: string;
  idealAnswer: string;
  evaluation: string;
  marksAwarded: number;
  maxMarks: number;
  bloomLevel: BloomLevel;
  performanceLevel: PerformanceLevel;
}

export interface GradingResult {
  studentName: string;
  studentGroup: string;
  score: number;
  totalMarks: number;
  cheatingAnalysis: CheatingAnalysis;
  strengths: string[];
  weaknesses: string[];
  detailedFeedback: DetailedFeedbackItem[];
  id: string; // Used as the Grading Timestamp
  timestamp: string; // The specific submission/received timestamp set by the user
  confidenceScore: number; // 0-100, AI's confidence in the grading accuracy
  gradingNotes: string; // AI's notes about difficulties or ambiguities encountered
  examSubject?: string; // Subject/module name
  academicLevel?: string; // e.g. "Licence 2", "Master 1"
}
