import React from 'react';
import { Play } from 'lucide-react';

interface QuizSelectionProps {
  quizzes: { id: string; title: string; description: string }[];
  onSelectQuiz: (quizId: string) => void;
}

const QuizSelection: React.FC<QuizSelectionProps> = ({ quizzes, onSelectQuiz }) => {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {quizzes.map((quiz) => (
        <div key={quiz.id} className="rounded-xl bg-white p-6 shadow-md transition-shadow hover:shadow-lg">
          <h3 className="mb-2 text-xl font-bold text-gray-800">{quiz.title}</h3>
          <p className="mb-4 text-gray-600">{quiz.description}</p>
          <button
            onClick={() => onSelectQuiz(quiz.id)}
            className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-white transition-colors hover:bg-green-600"
          >
            <Play className="size-5" />
            Start Quiz
          </button>
        </div>
      ))}
    </div>
  );
};

export default QuizSelection;

