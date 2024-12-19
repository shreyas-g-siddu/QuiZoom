import React, { useEffect, useState } from 'react';
import { useCall } from '@stream-io/video-react-sdk';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Define proper types for the quiz structure
interface QuizQuestion {
    id: string;
    question: string;
    options: string[];
    correctOption: number;
}

interface Quiz {
    id: string;
    title: string;
    questions: QuizQuestion[];
    timeLimit?: number;
    createdBy: string;
}

interface QuizAnswer {
    questionId: string;
    selectedOption: number;
    timeTaken: number;
}

interface QuizResponse {
    userId: string;
    userName: string;
    quizId: string;
    answers: QuizAnswer[];
    totalScore: number;
    submittedAt?: Date;
}

interface QuizStartEvent {
    type: 'quiz.start';
    quizId: string;
}

const QuizParticipant: React.FC = () => {
    const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [startTime, setStartTime] = useState<Date | null>(null);
    const [answers, setAnswers] = useState<QuizAnswer[]>([]);
    
    const call = useCall();
    
    useEffect(() => {
        if (!call) return;

        const handleQuizStart = async (event: QuizStartEvent) => {
            try {
                const quizDoc = await getDoc(doc(db, 'quizzes', event.quizId));
                const quizData = quizDoc.data() as Quiz;
                
                if (quizData) {
                    setActiveQuiz(quizData);
                    setStartTime(new Date());
                    setCurrentQuestion(0);
                    setAnswers([]);
                }
            } catch (error) {
                console.error('Error fetching quiz:', error);
            }
        };

        const handleCustomEvent = (event: any) => {
            if (event.type === 'custom' && event.custom.type === 'quiz.start') {
                handleQuizStart(event.custom as QuizStartEvent);
            }
        };

        call.on('custom', handleCustomEvent);

        return () => {
            call.off('custom', handleCustomEvent);
        };
    }, [call]);

    const calculateTimeTaken = (): number => {
        if (!startTime) return 0;
        return Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
    };

    const submitAnswer = async (selectedOption: number) => {
        if (!activeQuiz || !call?.currentUserId) return;

        const currentQuestionData = activeQuiz.questions[currentQuestion];
        const timeTaken = calculateTimeTaken();

        const answer: QuizAnswer = {
            questionId: currentQuestionData.id,
            selectedOption,
            timeTaken,
        };

        const newAnswers = [...answers, answer];
        setAnswers(newAnswers);

        if (currentQuestion < activeQuiz.questions.length - 1) {
            setCurrentQuestion(prev => prev + 1);
        } else {
            // Calculate total score
            const totalScore = newAnswers.reduce((score, ans) => {
                const question = activeQuiz.questions.find(q => q.id === ans.questionId);
                return score + (question?.correctOption === ans.selectedOption ? 1 : 0);
            }, 0);

            const response: QuizResponse = {
                userId: call.currentUserId,
                userName: call.currentUserId || 'Anonymous',
                quizId: activeQuiz.id,
                answers: newAnswers,
                totalScore,
                submittedAt: new Date(),
            };

            try {
                await updateDoc(doc(db, 'quizResponses', activeQuiz.id), {
                    responses: arrayUnion(response),
                });

                // Notify other participants about completion
                call.sendCustomEvent({
                    type: 'quiz.complete',
                    data: {
                        userId: call.currentUserId,
                        score: totalScore,
                    },
                });

                // Reset quiz state
                setActiveQuiz(null);
                setCurrentQuestion(0);
                setAnswers([]);
                setStartTime(null);
            } catch (error) {
                console.error('Error submitting quiz response:', error);
            }
        }
    };

    if (!activeQuiz) {
        return <div className="p-4">Waiting for quiz to start...</div>;
    }

    const currentQuestionData = activeQuiz.questions[currentQuestion];

    return (
        <div className="mx-auto max-w-2xl p-4">
            <div className="rounded-lg bg-white p-6 shadow-md">
                <h2 className="mb-4 text-xl font-bold">{activeQuiz.title}</h2>
                <div className="mb-4">
                    <span className="text-sm text-gray-600">
                        Question {currentQuestion + 1} of {activeQuiz.questions.length}
                    </span>
                </div>
                
                <div className="space-y-4">
                    <p className="text-lg font-medium">{currentQuestionData.question}</p>
                    
                    <div className="space-y-2">
                        {currentQuestionData.options.map((option, index) => (
                            <button
                                key={index}
                                onClick={() => submitAnswer(index)}
                                className="w-full rounded-lg border border-gray-300 p-3 text-left 
                                        transition-colors duration-150 hover:bg-gray-50"
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuizParticipant;
