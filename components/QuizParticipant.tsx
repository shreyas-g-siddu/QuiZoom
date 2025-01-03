import React, { useEffect, useState } from 'react';
import { useCall } from '@stream-io/video-react-sdk';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Quiz, QuizAnswer, QuizResult } from './../types/quiz';
import { Timer } from 'lucide-react';
import { useQuiz } from './QuizProvider';
import Leaderboard from './Leaderboard';

const QuizParticipant = ({ 
    quizEvent,
    onClose
}: { 
    quizEvent: {
        type: 'quiz.start' | 'quiz.end';
        data: {
            quizId: string;
            title: string;
            totalQuestions: number;
            results?: Record<string, QuizResult>;
        };
    } | null;
    onClose?: () => void;
}) => {
    const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [liveResults, setLiveResults] = useState<Record<string, QuizResult>>({});
    const [quizStarted, setQuizStarted] = useState(false);
    const [userStarted, setUserStarted] = useState(false);
    const [selectedOptions, setSelectedOptions] = useState<(number | null)[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [forceShowLeaderboard, setForceShowLeaderboard] = useState(false);
    const call = useCall();
    const { showQuiz } = useQuiz();

    useEffect(() => {
        if (!quizEvent?.data?.quizId) return;

        const unsubscribe = onSnapshot(doc(db, 'quizzes', quizEvent.data.quizId), (snapshot) => {
            if (!snapshot.exists()) {
                // Don't automatically close if we have results to show
                if (onClose && !hasSubmitted) {
                    onClose();
                }
                return;
            }

            const data = snapshot.data();
            if (data?.results) {
                setLiveResults(data.results);
                // If we have results and user has submitted, force show leaderboard
                if (hasSubmitted) {
                    setForceShowLeaderboard(true);
                }
            }
            
            // Only update quiz status if we're not showing final results
            if (!hasSubmitted) {
                setQuizStarted(data?.isActive ?? false);
                if (!data?.isActive) {
                    setUserStarted(false);
                }
            }
        });

        return () => unsubscribe();
    }, [quizEvent?.data?.quizId, onClose, hasSubmitted]);

    // Handle quiz end event
    useEffect(() => {
        if (quizEvent?.type === 'quiz.end' && hasSubmitted) {
            setForceShowLeaderboard(true);
        }
    }, [quizEvent?.type, hasSubmitted]);

    useEffect(() => {
        const loadQuiz = async () => {
            if (!quizEvent?.data?.quizId) return;

            try {
                const quizDoc = await getDoc(doc(db, 'quizzes', quizEvent.data.quizId));
                if (!quizDoc.exists()) {
                    setError('Quiz not found. Please contact the host.');
                    return;
                }

                const quizData = { ...quizDoc.data(), id: quizDoc.id } as Quiz;
                setActiveQuiz(quizData);
                setSelectedOptions(new Array(quizData.questions.length).fill(null));
                setTimeLeft(quizData.questions[0].timeLimit);
            } catch {
                setError('Failed to load quiz. Please try again.');
            }
        };

        if (quizEvent?.type === 'quiz.start') {
            loadQuiz();
            setHasSubmitted(false);
        }
    }, [quizEvent]);

    useEffect(() => {
        if (!showQuiz) {
            setActiveQuiz(null);
            setCurrentQuestion(0);
            setTimeLeft(0);
            setSelectedOptions([]);
            setHasSubmitted(false);
            setQuizStarted(false);
            setUserStarted(false);
        }
    }, [showQuiz]);

    useEffect(() => {
        if (!userStarted || !quizStarted || timeLeft <= 0 || !activeQuiz || hasSubmitted) return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleNextQuestion();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [timeLeft, quizStarted, userStarted, hasSubmitted]);

    const startQuizForUser = () => {
        if (!activeQuiz) return;
        setUserStarted(true);
        setTimeLeft(activeQuiz.questions[0].timeLimit);
    };

    const handleNextQuestion = async () => {
        if (!activeQuiz) return;

        if (currentQuestion === activeQuiz.questions.length - 1) {
            await submitAllAnswers();
        } else {
            setCurrentQuestion(prev => prev + 1);
            setTimeLeft(activeQuiz.questions[currentQuestion + 1].timeLimit);
        }
    };

    const submitAllAnswers = async () => {
        if (!activeQuiz || !call?.currentUserId || hasSubmitted) return;

        try {
            const answers: QuizAnswer[] = activeQuiz.questions.map((question, index) => ({
                questionId: question.id,
                selectedOption: selectedOptions[index] ?? -1,
                timeTaken: question.timeLimit - timeLeft,
            }));

            const score = answers.reduce((total, answer, index) => {
                return total + (answer.selectedOption === activeQuiz.questions[index].correctOption ? 1 : 0);
            }, 0);

            const participant = call.state.participants.find(
                (participant) => participant.userId === call.currentUserId
            );

            await updateDoc(doc(db, 'quizzes', activeQuiz.id), {
                [`results.${call.currentUserId}`]: {
                    displayName: participant?.name || 'Anonymous',
                    score,
                    answers,
                    totalQuestions: activeQuiz.questions.length,
                    timeTaken: answers.reduce((total, answer) => total + answer.timeTaken, 0),
                },
            });

            setHasSubmitted(true);
            setForceShowLeaderboard(true);

            // Wrap the custom event in try-catch to handle timeout
            try {
                await call.sendCustomEvent({
                    type: 'quiz.completed',
                    data: {
                        userId: call.currentUserId,
                        score,
                        totalQuestions: activeQuiz.questions.length,
                    },
                });
            } catch (error) {
                // Ignore timeout errors for custom events
                console.warn('Failed to send custom event, but quiz submission was successful');
            }
        } catch (error) {
            setError('Failed to submit answers.');
        }
    };

    if (!showQuiz || !activeQuiz) return null;

    // Show leaderboard if user has submitted or if quiz is ended
    if ((!quizStarted && !hasSubmitted) || (hasSubmitted && forceShowLeaderboard)) {
        return (
            <div className="mx-auto max-w-4xl space-y-6 p-6">
                <div className="mb-6 text-center text-2xl font-bold text-slate-200">
                    {!hasSubmitted
                        ? 'Waiting for the host to start the quiz...'
                        : 'Thanks for participating! Here are the results:'}
                </div>
                {hasSubmitted && Object.keys(liveResults).length > 0 && (
                    <div className="space-y-4">
                        <Leaderboard 
                            results={liveResults}
                            totalQuestions={activeQuiz.questions.length}
                        />
                        <button
                            onClick={() => {
                                setForceShowLeaderboard(false);
                                if (onClose) onClose();
                            }}
                            className="mx-auto block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
                        >
                            Close Quiz
                        </button>
                    </div>
                )}
            </div>
        );
    }

    if (!userStarted) {
        return (
            <div className="mx-auto max-w-4xl p-6 text-center">
                <h2 className="mb-6 text-2xl font-bold text-gray-800">{activeQuiz.title}</h2>
                <p className="mb-8 text-gray-600">
                    Get ready! You&apos;ll have {activeQuiz.questions[currentQuestion].timeLimit} seconds for this question.
                </p>
                <button
                    onClick={startQuizForUser}
                    className="rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700"
                >
                    Start Quiz
                </button>
            </div>
        );
    }

    const currentQuestionData = activeQuiz.questions[currentQuestion];
    const isLastQuestion = currentQuestion === activeQuiz.questions.length - 1;

    return (
        <div className="mx-auto max-w-2xl p-6">
            {error && <div className="mb-4 text-red-600">{error}</div>}
            <div className="rounded-lg bg-white p-6 shadow-lg">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">
                            Question {currentQuestion + 1} of {activeQuiz.questions.length}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-blue-100 px-4 py-2">
                        <Timer className="size-5 text-blue-600" />
                        <span className="font-medium text-blue-600">{timeLeft}s</span>
                    </div>
                </div>

                <div className="mb-8">
                    <h3 className="mb-4 text-lg font-medium text-gray-900">
                        {currentQuestionData.question}
                    </h3>
                    <div className="space-y-3">
                        {currentQuestionData.options.map((option, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    const newSelectedOptions = [...selectedOptions];
                                    newSelectedOptions[currentQuestion] = index;
                                    setSelectedOptions(newSelectedOptions);
                                }}
                                className={`w-full rounded-lg border p-4 text-left text-gray-950 transition-colors ${
                                    selectedOptions[currentQuestion] === index
                                        ? 'bg-blue-500 text-gray-50'
                                        : 'bg-white hover:bg-blue-100'
                                }`}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        onClick={isLastQuestion ? submitAllAnswers : handleNextQuestion}
                        disabled={selectedOptions[currentQuestion] === null}
                        className="rounded-lg bg-blue-600 px-6 py-2 text-white disabled:opacity-50"
                    >
                        {isLastQuestion ? 'Submit' : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuizParticipant;
