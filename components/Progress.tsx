import React from 'react';

interface ProgressProps {
    value: number;
    className?: string;
}

export const Progress: React.FC<ProgressProps> = ({ value, className = '' }) => {
    // Ensure value is between 0 and 100
    const normalizedValue = Math.min(Math.max(value, 0), 100);
    
    return (
        <div className={`h-2 w-full overflow-hidden rounded-full bg-gray-200 ${className}`}>
            <div 
                className="h-full bg-blue-500 transition-all duration-300 ease-in-out"
                style={{ width: `${normalizedValue}%` }}
            />
        </div>
    );
};

export default Progress;
