import React, { useState, useEffect } from 'react';
import { useCall } from '@stream-io/video-react-sdk';
import { addDoc, collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, X, Clock, AlertCircle } from 'lucide-react';
import { AlertQuiz, AlertDescription } from './Alert';
import type { Quiz, QuizQuestion, QuizResult } from '../types/quiz';

const QuizHost = () => {
    const [showResults, setShowResults] = useState(false);
    const [activeQuizRef, setActiveQuizRef] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    
    const [quiz, setQuiz] = useState<Quiz>({
        id: '',
        title: '',
        questions: [],
        createdBy: '',
        meetingId: '',
        isActive: false,
        results: {}
    });

    const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion>({
        id: '',
        question: '',
        options: ['', '', '', ''],
        correctOption: 0,
        timeLimit: 30
    });

    const call = useCall();

    useEffect(() => {
        if (!activeQuizRef || !call) return;

        console.log('Setting up quiz monitoring for:', activeQuizRef);
    
        const unsubscribe = onSnapshot(doc(db, 'quizzes', activeQuizRef), 
            (snapshot) => {
                const data = snapshot.data() as Quiz;
                if (data?.results) {
                    console.log('Quiz results updated:', data.results);
                    const participantCount = call?.state.participantCount || 0;
                    const submissionCount = Object.keys(data.results).length;
        
                    if (submissionCount >= participantCount - 1) {
                        console.log('All participants completed. Ending quiz.');
                        endQuiz(data.results);
                    }
                }
            },
            (error) => {
                console.error('Error monitoring quiz:', error);
                setError('Failed to monitor quiz progress. Please check your connection.');
            }
        );
    
        return () => unsubscribe();
    }, [activeQuizRef, call]);

    useEffect(() => {
        if (error) setError(null);
    }, [quiz]);

    const validateQuestion = (question: QuizQuestion): boolean => {
        if (!question.question.trim()) {
            setError('Question text cannot be empty');
            return false;
        }

        if (question.options.some(opt => !opt.trim())) {
            setError('All options must be filled out');
            return false;
        }

        if (question.timeLimit < 5 || question.timeLimit > 300) {
            setError('Time limit must be between 5 and 300 seconds');
            return false;
        }

        return true;
    };

    const addQuestion = () => {
        if (!validateQuestion(currentQuestion)) return;

        setQuiz(prev => ({
            ...prev,
            questions: [...prev.questions, {
                ...currentQuestion,
                id: Math.random().toString(36).substr(2, 9)
            }]
        }));

        setCurrentQuestion({
            id: '',
            question: '',
            options: ['', '', '', ''],
            correctOption: 0,
            timeLimit: 30
        });

        setError(null);
    };

    const removeQuestion = (index: number) => {
        setQuiz(prev => ({
            ...prev,
            questions: prev.questions.filter((_, i) => i !== index)
        }));
    };

    const endQuiz = async (finalResults: Record<string, QuizResult>) => {
        if (!call) return;

        try {
            console.log('Sending quiz results to participants');
            await call.sendCustomEvent({
                type: 'quiz.results',
                data: { results: finalResults }
            });

            setShowResults(true);
            setActiveQuizRef(null);
        } catch (error) {
            console.error('Error ending quiz:', error);
            setError('Failed to end quiz. Please try again.');
        }
    };

    const startQuiz = async () => {
        if (!call?.currentUserId) {
            setError('Cannot start quiz: No active call found');
            return;
        }
        
        try {
            if (!quiz.title.trim()) {
                setError('Please add a quiz title');
                return;
            }

            if (quiz.questions.length === 0) {
                setError('Please add at least one question');
                return;
            }

            setIsStarting(true);
            setError(null);

            console.log('Creating quiz document...');
            const quizData = {
                ...quiz,
                createdBy: call.currentUserId,
                meetingId: call.id,
                isActive: true
            };

            const docRef = await addDoc(collection(db, 'quizzes'), quizData);
            console.log('Quiz document created with ID:', docRef.id);
            setActiveQuizRef(docRef.id);

            console.log('Sending quiz start event to participants');
            await call.sendCustomEvent({
                type: 'quiz.start',
                data: {
                    quizId: docRef.id,
                    title: quiz.title,
                    totalQuestions: quiz.questions.length
                }
            });

        } catch (error) {
            console.error('Error starting quiz:', error);
            setError('Failed to start quiz. Please check your connection and try again.');
            
            if (activeQuizRef) {
                try {
                    await deleteDoc(doc(db, 'quizzes', activeQuizRef));
                } catch (cleanupError) {
                    console.error('Error cleaning up quiz document:', cleanupError);
                }
                setActiveQuizRef(null);
            }
        } finally {
            setIsStarting(false);
        }
    };

    const renderResults = () => {
        if (!showResults || Object.keys(quiz.results).length === 0) return null;
    
        const sortedResults = Object.entries(quiz.results)
            .map(([userId, result]) => ({ userId, ...result }))
            .sort((a, b) => b.score - a.score);
    
        return (
            <div className="mt-6 rounded-lg bg-white p-6 shadow-md">
                <h3 className="mb-4 text-xl font-bold">Quiz Results</h3>
                <div className="space-y-4">
                    {sortedResults.map((result) => (
                        <div key={result.userId} className="rounded-lg bg-gray-50 p-4">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">{result.displayName}</span>
                                <div className="text-right">
                                    <span className="text-lg font-bold text-blue-600">
                                        {result.score}/{quiz.questions.length}
                                    </span>
                                    <span className="ml-2 text-sm text-gray-500">
                                        ({Math.round((result.score / quiz.questions.length) * 100)}%)
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="mx-auto max-w-3xl p-6">
            <div className="rounded-lg bg-white p-6 shadow-md">
                {error && (
                    <AlertQuiz>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </AlertQuiz>
                )}

                <h2 className="mb-6 text-2xl font-bold text-gray-800">Create Quiz</h2>
                
                <div className="mb-6">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                        Quiz Title
                    </label>
                    <input
                        type="text"
                        placeholder="Enter quiz title"
                        className="w-full rounded-lg border p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                        value={quiz.title}
                        onChange={(e) => setQuiz(prev => ({ ...prev, title: e.target.value }))}
                    />
                </div>

                {quiz.questions.length > 0 && (
                    <div className="mb-6">
                        <h3 className="mb-3 text-lg font-medium text-gray-700">Questions Added</h3>
                        <div className="space-y-2">
                            {quiz.questions.map((q, index) => (
                                <div key={q.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">Q{index + 1}.</span>
                                        <span>{q.question}</span>
                                        <span className="text-sm text-gray-500">
                                            ({q.timeLimit}s)
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => removeQuestion(index)}
                                        className="text-red-500 hover:text-red-600"
                                        title="Remove question"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mb-6 rounded-lg bg-gray-50 p-4">
                    <h3 className="mb-4 text-lg font-medium text-gray-700">Add New Question</h3>
                    
                    <div className="mb-4">
                        <input
                            type="text"
                            placeholder="Enter question"
                            className="mb-4 w-full rounded-lg border p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                            value={currentQuestion.question}
                            onChange={(e) => setCurrentQuestion(prev => ({
                                ...prev,
                                question: e.target.value
                            }))}
                        />

                        <div className="mb-4 flex items-center gap-2">
                            <Clock size={20} className="text-gray-500" />
                            <input
                                type="number"
                                min="5"
                                max="300"
                                className="w-24 rounded-lg border p-2"
                                value={currentQuestion.timeLimit}
                                onChange={(e) => setCurrentQuestion(prev => ({
                                    ...prev,
                                    timeLimit: Math.min(300, Math.max(5, parseInt(e.target.value) || 30))
                                }))}
                            />
                            <span className="text-sm text-gray-500">seconds</span>
                        </div>

                        {currentQuestion.options.map((option, index) => (
                            <div key={index} className="mb-2 flex items-center">
                                <input
                                    type="radio"
                                    name="correctOption"
                                    className="mr-2"
                                    checked={currentQuestion.correctOption === index}
                                    onChange={() => setCurrentQuestion(prev => ({
                                        ...prev,
                                        correctOption: index
                                    }))}
                                />
                                <input
                                    type="text"
                                    placeholder={`Option ${index + 1}`}
                                    className="w-full rounded-lg border p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                    value={option}
                                    onChange={(e) => setCurrentQuestion(prev => ({
                                        ...prev,
                                        options: prev.options.map((opt, i) => 
                                            i === index ? e.target.value : opt
                                        )
                                    }))}
                                />
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={addQuestion}
                        className="flex w-full items-center justify-center gap-2 rounded-lg 
                                 bg-blue-500 py-2 text-white hover:bg-blue-600 
                                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        <Plus size={20} />
                        Add Question
                    </button>
                </div>

                <button
                    className="w-full rounded-lg bg-green-500 py-3 font-medium text-white 
                             hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-gray-300
                             focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    onClick={startQuiz}
                    disabled={!quiz.title || quiz.questions.length === 0 || isStarting}
                >
                    {isStarting ? 'Starting Quiz...' : 'Start Quiz'}
                </button>
            </div>

            {renderResults()}
        </div>
    );
};

export default QuizHost;
