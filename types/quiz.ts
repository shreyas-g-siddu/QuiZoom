export interface QuizQuestion {
    id: string;
    question: string;
    options: string[];
    correctOption: number;
    timeLimit: number;
}

export interface QuizAnswer {
    questionId: string;
    selectedOption: number;
    timeTaken: number;
}

export interface QuizResult {
    displayName: string;
    score: number;
    answers: QuizAnswer[];
    totalQuestions: number;
}

export interface Quiz {
    id: string;
    title: string;
    questions: QuizQuestion[];
    createdBy: string;
    meetingId: string;
    isActive: boolean;
    results: Record<string, QuizResult>;
}