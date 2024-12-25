import React from 'react';

export interface AlertDialogProps {
    children: React.ReactNode;
    open: boolean;
}

export const AlertDialog: React.FC<AlertDialogProps> = ({ children, open }) => {
    if (!open) return null;
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md">{children}</div>
        </div>
    );
};

export const AlertDialogContent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="mx-4 rounded-lg bg-white p-6 shadow-xl">
        {children}
    </div>
);

export const AlertDialogHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="mb-4">{children}</div>
);

export const AlertDialogTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h2 className="text-xl font-semibold">{children}</h2>
);

export const AlertDialogDescription: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="mt-2 text-sm text-gray-600">{children}</div>
);

export default AlertDialog;
