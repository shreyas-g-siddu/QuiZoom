import React, { useEffect, useState } from 'react';
import { useCall } from '@stream-io/video-react-sdk';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Quiz, QuizAnswer, QuizResult } from './../types/quiz';
import AlertDialog, { 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogHeader, 
    AlertDialogTitle 
} from './AlertDialog';
import { useQuiz } from './QuizProvider';

const QuizParticipant = () => {
    const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [answers, setAnswers] = useState<QuizAnswer[]>([]);
    const [showResults] = useState(false);
    const [results] = useState<Record<string, QuizResult> | null>(null);
    const [showQuizAlert, setShowQuizAlert] = useState(false);
    const [, setSelectedOption] = useState<number | null>(null);
    const [, setError] = useState<string | null>(null);
    const call = useCall();
    const { showQuiz, setShowQuiz } = useQuiz(); // Get both showQuiz and setShowQuiz

    // Reset state when showQuiz changes to false
    useEffect(() => {
        if (!showQuiz) {
            setActiveQuiz(null);
            setCurrentQuestion(0);
            setTimeLeft(0);
            setAnswers([]);
            setShowQuizAlert(false);
        }
    }, [showQuiz]);

    useEffect(() => {
        if (!call) {
            console.log('No call instance available');
            return;
        }

        const handleCustomEvent = async (event: any) => {
            console.log("Received custom event in QuizParticipant:", event);
            const { type, data } = event.custom || {};
            
            if (type === 'quiz.start') {
                console.log("Processing quiz.start event");
                if (!data?.quizId) {
                    console.error('No quizId in event data');
                    return;
                }
                try {
                    const quizDoc = await getDoc(doc(db, 'quizzes', data.quizId));
                    if (!quizDoc.exists()) {
                        setError('Quiz not found. Please contact the host.');
                        return;
                    }
                    const quizData = { ...quizDoc.data(), id: quizDoc.id } as Quiz;
                    setActiveQuiz(quizData);
                    setShowQuizAlert(true);
                    setTimeLeft(quizData.questions[0].timeLimit);
                    setShowQuiz(true); // Ensure showQuiz is set to true when quiz starts
                } catch (error) {
                    setError('Failed to load quiz. Please try again.');
                }
            } else if (type === 'quiz.end') {
                // Handle quiz end event
                setShowQuiz(false);
                setActiveQuiz(null);
            }
        };

        call.on('custom', handleCustomEvent);

        return () => {
            call.off('custom', handleCustomEvent);
        };
    }, [call, setShowQuiz]);

    useEffect(() => {
        if (!activeQuiz || timeLeft <= 0) return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    submitAnswer(-1); // Auto-submit
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [timeLeft, activeQuiz]);

    const startQuiz = () => {
        setShowQuizAlert(false);
        setCurrentQuestion(0);
        setAnswers([]);
        setTimeLeft(activeQuiz?.questions[0].timeLimit || 0);
    };

    const submitAnswer = async (option: number) => {
        if (!activeQuiz || !call?.currentUserId) return;

        const currentQuestionData = activeQuiz.questions[currentQuestion];
        const answer: QuizAnswer = {
            questionId: currentQuestionData.id,
            selectedOption: option,
            timeTaken: currentQuestionData.timeLimit - timeLeft
        };

        const newAnswers = [...answers, answer];
        setAnswers(newAnswers);

        if (currentQuestion < activeQuiz.questions.length - 1) {
            setCurrentQuestion((prev) => prev + 1);
            setTimeLeft(activeQuiz.questions[currentQuestion + 1].timeLimit);
            setSelectedOption(null);
        } else {
            try {
                const score = newAnswers.reduce((total, ans) => {
                    const question = activeQuiz.questions.find(q => q.id === ans.questionId);
                    return total + (question?.correctOption === ans.selectedOption ? 1 : 0);
                }, 0);

                const participant = call.state.participants.find(
                    (participant) => participant.userId === call.currentUserId
                );

                await updateDoc(doc(db, 'quizzes', activeQuiz.id), {
                    [`results.${call.currentUserId}`]: {
                        displayName: participant?.name || 'Anonymous',
                        score,
                        answers: newAnswers,
                        totalQuestions: activeQuiz.questions.length
                    }
                });

                await call.sendCustomEvent({
                    type: 'quiz.completed',
                    data: {
                        userId: call.currentUserId,
                        score,
                        totalQuestions: activeQuiz.questions.length
                    }
                });
            } catch (error) {
                setError('Failed to submit answers.');
            }
        }
    };

    const renderResults = () => {
        if (!results) return null;

        return (
            <div className="rounded-lg bg-white p-6">
                <h2 className="mb-4 text-xl font-bold">Quiz Results</h2>
                {Object.entries(results).map(([userId, result]) => (
                    <div key={userId}>
                        <p>{result.displayName}: {result.score}</p>
                    </div>
                ))}
            </div>
        );
    };

    if (showResults) {
        return renderResults();
    }

    if (!showQuiz) {
        return null;
    }

    if (!activeQuiz) {
        return <div className="text-center text-xl text-white">Waiting for quiz to start...</div>;
    }

    const currentQuestionData = activeQuiz.questions[currentQuestion];

    return (
        <>
            <AlertDialog open={showQuizAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{activeQuiz.title}</AlertDialogTitle>
                        <AlertDialogDescription>
                            <p>Total Questions: {activeQuiz.questions.length}</p>
                            <p>Click Start to begin!</p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <button onClick={startQuiz}>Start Quiz</button>
                </AlertDialogContent>
            </AlertDialog>

            <div>
                <h2>{currentQuestionData.question}</h2>
                {currentQuestionData.options.map((option, index) => (
                    <button key={index} onClick={() => submitAnswer(index)}>
                        {option}
                    </button>
                ))}
            </div>
        </>
    );
};

export default QuizParticipant;