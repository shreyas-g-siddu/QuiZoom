import React, { useState, useEffect } from 'react';
import { useCall } from '@stream-io/video-react-sdk';
import { addDoc, collection, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, X, Clock, AlertCircle, Play, StopCircle, Download } from 'lucide-react';
import Alert, { AlertDescription } from '@/components/Alert';
import Leaderboard from './Leaderboard';
import { utils, writeFile } from 'xlsx';

interface QuizQuestion {
    id: string;
    question: string;
    options: string[];
    correctOption: number;
    timeLimit: number;
}

interface QuizResult {
    displayName: string;
    score: number;
    totalQuestions: number;
    timeTaken: number;
}

interface Quiz {
    id: string;
    title: string;
    questions: QuizQuestion[];
    createdBy: string;
    meetingId: string;
    isActive: boolean;
    results: Record<string, QuizResult>;
}

const QuizHost = ({ onQuizEnd }: { onQuizEnd?: () => void }) => {
    const [activeQuizRef, setActiveQuizRef] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [results, setResults] = useState<Record<string, QuizResult>>({});
    const [quizStatus, setQuizStatus] = useState<'idle' | 'active' | 'ended'>('idle');

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

        const unsubscribe = onSnapshot(
            doc(db, 'quizzes', activeQuizRef),
            (snapshot) => {
                const data = snapshot.data() as Quiz | undefined;
                if (data) {
                    setQuiz(data);
                    if (data.results) {
                        setResults(data.results);
                        if (data.isActive) {
                            const participantCount = call?.state.participantCount || 0;
                            const submissionCount = Object.keys(data.results).length;

                            if (submissionCount >= participantCount - 1) {
                                endQuiz(data.results);
                            }
                        }
                    }
                    setQuizStatus(data.isActive ? 'active' : 'ended');
                }
            },
            (error) => {
                console.error('Error monitoring quiz:', error);
                setError('Failed to monitor quiz progress. Please check your connection.');
            }
        );

        return () => unsubscribe();
    }, [activeQuizRef, call]);

    // Modified timer effect to start from 0
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (quizStatus === 'active') {
            setElapsedTime(0); // Reset timer when quiz becomes active
            timer = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        } else {
            setElapsedTime(0); // Reset timer when quiz is not active
        }
        return () => clearInterval(timer);
    }, [quizStatus]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const downloadResults = () => {
        const resultsArray = Object.entries(results).map(([, result]) => ({
            'Participant Name': result.displayName,
            'Score': result.score,
            'Total Questions': result.totalQuestions,
            'Time Taken (seconds)': result.timeTaken,
            'Percentage': ((result.score / result.totalQuestions) * 100).toFixed(2) + '%'
        }));

        // Use the imported XLSX utilities with proper typing
        const wb = utils.book_new();
        const ws = utils.json_to_sheet(resultsArray);
        utils.book_append_sheet(wb, ws, 'Quiz Results');
        writeFile(wb, `quiz_results_${quiz.title}_${new Date().toLocaleDateString()}.xlsx`);
    };

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

        setQuiz((prev) => ({
            ...prev,
            questions: [...prev.questions, { ...currentQuestion, id: Math.random().toString(36).substr(2, 9) }]
        }));

        setCurrentQuestion({
            id: '',
            question: '',
            options: ['', '', '', ''],
            correctOption: 0,
            timeLimit: 30
        });
    };

    const removeQuestion = (index: number) => {
        setQuiz((prev) => ({
            ...prev,
            questions: prev.questions.filter((_, i) => i !== index)
        }));
    };

    const endQuiz = async (finalResults: Record<string, QuizResult>) => {
        if (!call || !activeQuizRef) return;

        try {
            await updateDoc(doc(db, 'quizzes', activeQuizRef), {
                isActive: false,
                results: finalResults,
                endTime: new Date().toISOString()
            });

            await call.sendCustomEvent({
                type: 'quiz.end',
                data: {
                    results: finalResults,
                    quizId: activeQuizRef
                }
            });

            setElapsedTime(0);
            setQuizStatus('ended');
        } catch (error) {
            console.error('Error ending quiz:', error);
            setError('Failed to end quiz. Please try again.');
        }
    };

    const closeQuiz = async () => {
        if (activeQuizRef) {
            try {
                await deleteDoc(doc(db, 'quizzes', activeQuizRef));
                if (onQuizEnd) {
                    onQuizEnd();
                }
            } catch (error) {
                console.error('Error cleaning up quiz:', error);
                setError('Failed to close quiz. Please try again.');
            }
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

            const quizData = {
                ...quiz,
                createdBy: call.currentUserId,
                meetingId: call.id,
                isActive: true,
                startTime: new Date().toISOString()
            };

            const docRef = await addDoc(collection(db, 'quizzes'), quizData);
            setActiveQuizRef(docRef.id);
            setQuizStatus('active');

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
            setError('Failed to start quiz. Please try again.');

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

    const resetQuiz = async () => {
        if (activeQuizRef) {
            try {
                await deleteDoc(doc(db, 'quizzes', activeQuizRef));
            } catch (error) {
                console.error('Error cleaning up quiz:', error);
            }
        }

        setQuizStatus('idle');
        setActiveQuizRef(null);
        setResults({});
        setElapsedTime(0);
        setQuiz({
            id: '',
            title: '',
            questions: [],
            createdBy: '',
            meetingId: '',
            isActive: false,
            results: {}
        });
    };

    return (
        <div className="mx-auto h-[calc(100vh-40px)] w-full max-w-6xl overflow-y-auto p-6">
            <div className="rounded-lg bg-white p-6 shadow-md">
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="size-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {quizStatus !== 'idle' && (
                    <div className="mb-6 flex items-center justify-between rounded-lg bg-blue-50 p-4">
                        <span className="font-medium">
                            {quizStatus === 'active' ? 'Quiz in Progress' : 'Quiz Ended'}
                        </span>
                        <div className="flex items-center gap-4">
                            {quizStatus === 'active' && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <Clock className="size-5 text-blue-600" />
                                        <span className="font-medium text-blue-600">
                                            {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => endQuiz(results)}
                                        className="flex items-center gap-2 rounded-md bg-red-500 px-3 py-1 text-white hover:bg-red-600"
                                    >
                                        <StopCircle size={16} />
                                        End Quiz
                                    </button>
                                </>
                            )}
                            {quizStatus === 'ended' && Object.keys(results).length > 0 && (
                                <button
                                    onClick={downloadResults}
                                    className="flex items-center gap-2 rounded-md bg-green-500 px-3 py-1 text-white hover:bg-green-600"
                                >
                                    <Download size={16} />
                                    Download Results
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-6">
                    {quizStatus === 'idle' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-gray-800">Create Quiz</h2>

                            <div className="mb-6">
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Quiz Title
                                </label>
                                <input
                                    type="text"
                                    placeholder="Enter quiz title"
                                    className="w-full rounded-lg border p-2 text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                    value={quiz.title}
                                    onChange={(e) => setQuiz((prev) => ({ ...prev, title: e.target.value }))}
                                />
                            </div>

                            {quiz.questions.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="mb-3 text-lg font-medium text-gray-700">Questions Added</h3>
                                    <div className="space-y-2">
                                        {quiz.questions.map((q, index) => (
                                            <div key={q.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-700">Q{index + 1}.</span>
                                                    <span className="text-sm text-gray-500">{q.question}</span>
                                                    <span className="text-sm text-gray-500">({q.timeLimit}s)</span>
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
                                        className="mb-4 w-full rounded-lg border p-2 text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                        value={currentQuestion.question}
                                        onChange={(e) => setCurrentQuestion((prev) => ({
                                            ...prev,
                                            question: e.target.value
                                        }))}
                                    />

                                    <div className="mb-4 flex items-center gap-2">
                                        <input
                                            type="number"
                                            placeholder="Time limit (seconds)"
                                            min={5}
                                            max={300}
                                            value={currentQuestion.timeLimit}
                                            onChange={(e) => setCurrentQuestion((prev) => ({
                                                ...prev,
                                                timeLimit: Number(e.target.value)
                                            }))}
                                            className="w-28 rounded-lg border p-2 text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        {currentQuestion.options.map((option, index) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <input
                                                    type="radio"
                                                    id={`option-${index}`}
                                                    name="correct-option"
                                                    value={index}
                                                    checked={currentQuestion.correctOption === index}
                                                    onChange={(e) => setCurrentQuestion((prev) => ({
                                                        ...prev,
                                                        correctOption: parseInt(e.target.value, 10),
                                                    }))}
                                                    className="size-4"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder={`Option ${index + 1}`}
                                                    value={option}
                                                    onChange={(e) => {
                                                        const newOptions = [...currentQuestion.options];
                                                        newOptions[index] = e.target.value;
                                                        setCurrentQuestion((prev) => ({
                                                            ...prev,
                                                            options: newOptions,
                                                        }));
                                                    }}
                                                    className="flex-1 rounded-lg border p-2 text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    onClick={addQuestion}
                                    className="flex items-center gap-2 rounded-md bg-blue-500 px-3 py-1 text-white hover:bg-blue-600"
                                >
                                    <Plus size={16} />
                                    Add Question
                                </button>
                            </div>

                            <button
                                onClick={startQuiz}
                                disabled={isStarting}
                                className={`flex items-center gap-2 rounded-md px-3 py-2 text-white ${isStarting ? "bg-gray-400" : "bg-green-500 hover:bg-green-600"
                                    }`}
                            >
                                {isStarting ? <Clock size={16} /> : <Play size={16} />}
                                {isStarting ? "Starting..." : "Start Quiz"}
                            </button>
                        </div>
                    )}

                    {(quizStatus === 'active' || quizStatus === 'ended') && (
                        <>
                            {quizStatus === 'active' && (
                                <div className="space-y-6">
                                    <h2 className="text-2xl font-bold text-gray-800">Quiz in Progress</h2>
                                    <p className="text-gray-600">
                                        Participants: {Object.keys(results).length}
                                    </p>
                                </div>
                            )}

                            <div className={`${quizStatus === 'ended' ? 'col-span-2' : ''}`}>
                                <Leaderboard
                                    results={results}
                                    totalQuestions={quiz.questions.length}
                                    onClose={closeQuiz}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QuizHost;