import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { QuizResponse } from '../types/quiz';

interface LeaderboardProps {
    quizId: string;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ quizId }) => {
    const [responses, setResponses] = useState<QuizResponse[]>([]);

    useEffect(() => {
        const fetchResponses = async () => {
            const q = query(
                collection(db, 'quizResponses'),
                where('quizId', '==', quizId)
            );

            const querySnapshot = await getDocs(q);
            const responses: QuizResponse[] = [];

            querySnapshot.forEach((doc) => {
                responses.push(doc.data() as QuizResponse);
            });

            // Sort by total score
            responses.sort((a, b) => b.totalScore - a.totalScore);
            setResponses(responses);
        };

        fetchResponses();
    }, [quizId]);

    return (
        <div className="p-4">
            <h2 className="text-2xl font-bold mb-4">Leaderboard</h2>
            <div className="space-y-2">
                {responses.map((response, index) => (
                    <div
                        key={response.userId}
                        className="flex justify-between items-center p-2 bg-gray-50 rounded"
                    >
                        <div className="flex items-center">
                            <span className="font-bold mr-2">{index + 1}.</span>
                            <span>{response.userName}</span>
                        </div>
                        <span className="font-bold">{response.totalScore} points</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Leaderboard;