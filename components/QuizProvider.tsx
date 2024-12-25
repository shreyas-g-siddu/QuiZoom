import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define context
const QuizContext = createContext<{
  showQuiz: boolean;
  setShowQuiz: (value: boolean) => void;
} | undefined>(undefined);

// Context provider component
export const QuizProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [showQuiz, setShowQuiz] = useState(false);

  return (
    <QuizContext.Provider value={{ showQuiz, setShowQuiz }}>
      {children}
    </QuizContext.Provider>
  );
};

// Custom hook to access context
export const useQuiz = () => {
  const context = useContext(QuizContext);
  if (!context) {
    throw new Error('useQuiz must be used within a QuizProvider');
  }
  return context;
};
