// types/quiz.ts
export interface QuizQuestion {
    id: string;
    question: string;
    options: string[];
    correctAnswer: number;
    timeLimit?: number; // in seconds
}

export interface Quiz {
    id: string;
    title: string;
    createdBy: string;
    questions: QuizQuestion[];
    meetingId: string;
    isActive: boolean;
    startTime?: number;
}

export interface QuizResponse {
    userId: string;
    userName: string;
    quizId: string;
    answers: {
        questionId: string;
        selectedOption: number;
        timeTaken: number;
    }[];
    totalScore: number;
}

export interface QuizState {
    currentQuiz: Quiz | null;
    responses: QuizResponse[];
    activeQuestion: number;
    isSubmitted: boolean;
}
