export interface QualificationCriteria {
  label: string;
  locations: string[];
  industries?: string[];
  services: string[];
  keywords?: string[];
  minScore: number;
}

export interface LeadProfile {
  name: string;
  url: string;
  location?: string;
  industry?: string;
  description: string;
}

export type QualificationResult = 'sí' | 'no' | 'quizás';

export interface QualificationVerdict {
  result: QualificationResult;
  score: number;
  reasons: string[];
  matched: string[];
}