
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
}
