import React, { useState } from 'react';
import { useCall } from '@stream-io/video-react-sdk';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, X } from 'lucide-react';

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
    createdBy: string;
    meetingId: string;
    isActive: false;
}

const QuizHost: React.FC = () => {
    const [quiz, setQuiz] = useState<Quiz>({
        id: '',
        title: '',
        questions: [],
        createdBy: '',
        meetingId: '',
        isActive: false,
    });

    const call = useCall();

    const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion>({
        id: '',
        question: '',
        options: ['', '', '', ''],
        correctOption: 0
    });

    const addQuestion = () => {
        if (!currentQuestion.question || currentQuestion.options.some(opt => !opt)) {
            alert('Please fill in all fields for the question');
            return;
        }

        setQuiz(prev => ({
            ...prev,
            questions: [...prev.questions, {
                ...currentQuestion,
                id: Math.random().toString(36).substr(2, 9)
            }]
        }));

        // Reset current question
        setCurrentQuestion({
            id: '',
            question: '',
            options: ['', '', '', ''],
            correctOption: 0
        });
    };

    const removeQuestion = (index: number) => {
        setQuiz(prev => ({
            ...prev,
            questions: prev.questions.filter((_, i) => i !== index)
        }));
    };

    const updateOption = (index: number, value: string) => {
        setCurrentQuestion(prev => ({
            ...prev,
            options: prev.options.map((opt, i) => i === index ? value : opt)
        }));
    };

    const startQuiz = async () => {
        if (!call?.currentUserId) return;
        
        try {
            if (!quiz.title || quiz.questions.length === 0) {
                alert('Please add a title and at least one question');
                return;
            }

            const quizData = {
                ...quiz,
                createdBy: call.currentUserId,
                meetingId: call.id,
                isActive: true
            };

            // Save quiz to Firebase
            const docRef = await addDoc(collection(db, 'quizzes'), quizData);

            // Notify other participants via Stream
            await call.sendCustomEvent({
                type: 'quiz.start',
                data: {
                    quizId: docRef.id
                }
            });

        } catch (error) {
            console.error('Error starting quiz:', error);
        }
    };

    return (
        <div className="mx-auto max-w-3xl p-6">
            <div className="rounded-lg bg-white p-6 shadow-md">
                <h2 className="mb-6 text-2xl font-bold">Create Quiz</h2>
                
                {/* Quiz Title */}
                <div className="mb-6">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                        Quiz Title
                    </label>
                    <input
                        type="text"
                        placeholder="Enter quiz title"
                        className="w-full rounded-lg border p-2 focus:ring-2 focus:ring-blue-500"
                        value={quiz.title}
                        onChange={(e) => setQuiz({ ...quiz, title: e.target.value })}
                    />
                </div>

                {/* Existing Questions List */}
                {quiz.questions.length > 0 && (
                    <div className="mb-6">
                        <h3 className="mb-3 text-lg font-medium">Questions Added</h3>
                        <div className="space-y-2">
                            {quiz.questions.map((q, index) => (
                                <div key={q.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                                    <span>{index + 1}. {q.question}</span>
                                    <button
                                        onClick={() => removeQuestion(index)}
                                        className="text-red-500 hover:text-red-600"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* New Question Form */}
                <div className="mb-6 rounded-lg bg-gray-50 p-4">
                    <h3 className="mb-4 text-lg font-medium">Add New Question</h3>
                    
                    <div className="mb-4">
                        <input
                            type="text"
                            placeholder="Enter question"
                            className="mb-4 w-full rounded-lg border p-2"
                            value={currentQuestion.question}
                            onChange={(e) => setCurrentQuestion(prev => ({
                                ...prev,
                                question: e.target.value
                            }))}
                        />

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
                                    className="w-full rounded-lg border p-2"
                                    value={option}
                                    onChange={(e) => updateOption(index, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={addQuestion}
                        className="flex w-full items-center justify-center gap-2 rounded-lg 
                                 bg-blue-500 py-2 text-white hover:bg-blue-600"
                    >
                        <Plus size={20} />
                        Add Question
                    </button>
                </div>

                {/* Start Quiz Button */}
                <button
                    className="w-full rounded-lg bg-green-500 py-3 font-medium text-white 
                             hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-gray-300"
                    onClick={startQuiz}
                    disabled={!quiz.title || quiz.questions.length === 0}
                >
                    Start Quiz
                </button>
            </div>
        </div>
    );
};

export default QuizHost;
