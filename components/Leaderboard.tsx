import React, { useEffect, useState } from 'react';
import { Users, Award, Clock } from 'lucide-react';
import type { QuizResult } from '../types/quiz';

interface LeaderboardProps {
    results: Record<string, QuizResult>;
    totalQuestions: number;
    onClose?: () => void;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ results, totalQuestions, onClose }) => {
    // Keep a local copy of results to prevent disappearing
    const [localResults, setLocalResults] = useState<Record<string, QuizResult>>(results);
    
    // Update local results when new results come in
    useEffect(() => {
        if (Object.keys(results).length > 0) {
            setLocalResults(results);
        }
    }, [results]);

    const sortedResults = Object.entries(localResults)
        .map(([userId, result]) => ({ userId, ...result }))
        .sort((a, b) => b.score - a.score || (a.timeTaken ?? 0) - (b.timeTaken ?? 0));

    return (
        <div className="rounded-xl bg-white p-6 shadow-md">
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">
                    {Object.keys(results).length === 0 ? "Waiting for results..." : "Live Leaderboard"}
                </h2>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-gray-600">
                        <Users className="size-5" />
                        <span>{sortedResults.length} participants</span>
                    </div>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>
            
            {sortedResults.length > 0 ? (
                <div className="space-y-4">
                    {sortedResults.map((result, index) => (
                        <div
                            key={result.userId}
                            className={`flex items-center justify-between rounded-lg p-4 ${
                                index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                            }`}
                        >
                            <div className="flex items-center gap-4">
                                <span className="text-2xl font-bold text-gray-500">#{index + 1}</span>
                                <span className="text-lg font-medium text-gray-800">
                                    {result.displayName || `Participant ${index + 1}`}
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <Award className="size-5 text-yellow-500" />
                                    <span className="text-lg font-bold text-blue-600">
                                        {result.score}/{totalQuestions}
                                    </span>
                                </div>
                                {result.timeTaken !== undefined && (
                                    <div className="flex items-center gap-2 text-gray-500">
                                        <Clock className="size-4" />
                                        <span>{result.timeTaken}s</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex h-32 items-center justify-center text-gray-500">
                    No results available yet
                </div>
            )}
        </div>
    );
};

export default Leaderboard;