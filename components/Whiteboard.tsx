import React, { useEffect, useRef, useState } from 'react';
import { Call, CallEventListener, CustomVideoEvent } from '@stream-io/video-react-sdk';
import { X } from 'lucide-react';

interface WhiteboardProps {
    call: Call;
    onClose: () => void;
}

interface DrawEventData {
    x: number;
    y: number;
    drawing: boolean;
    color: string;
}

type WhiteboardEventType = 'whiteboard.draw' | 'whiteboard.clear';

// Updated to match the expected structure of CustomVideoEvent
interface WhiteboardCustomEvent extends CustomVideoEvent {
    type: 'custom';
    custom: {
        type: WhiteboardEventType;
        data: DrawEventData | Record<string, never>;
    };
}

const Whiteboard: React.FC<WhiteboardProps> = ({ call, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState('#FFFFFF');

    useEffect(() => {
        if (!call) {
            console.error('Call object is undefined');
            return;
        }
    
        const canvas = canvasRef.current;
        if (!canvas) return;
    
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
    
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    
        const handleCustomEvent: CallEventListener<'custom'> = ((event) => {
            if (!('custom' in event)) return;
    
            const customEvent = event as WhiteboardCustomEvent;
            if (customEvent.custom.type === 'whiteboard.draw') {
                const drawData = customEvent.custom.data as DrawEventData;
                if (!ctx || !drawData.drawing) return;
    
                ctx.strokeStyle = drawData.color;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.lineTo(drawData.x, drawData.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(drawData.x, drawData.y);
            } else if (customEvent.custom.type === 'whiteboard.clear') {
                const context = canvasRef.current?.getContext('2d');
                if (context && canvasRef.current) {
                    context.fillStyle = '#1a1a1a';
                    context.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                }
            }
        }) as CallEventListener<'custom'>;
    
        call.on('custom', handleCustomEvent);
    
        return () => {
            call.off('custom', handleCustomEvent);
        };
    }, [call]);    

    const handleDraw = (x: number, y: number) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDrawing(true);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        handleDraw(x, y);

        const drawData: DrawEventData = {
            x,
            y,
            drawing: true,
            color
        };

        // Send draw event to other participants
        call.sendCustomEvent({
            type: 'whiteboard.draw',
            data: drawData,
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        handleDraw(x, y);

        const drawData: DrawEventData = {
            x,
            y,
            drawing: true,
            color
        };

        // Send draw event to other participants
        call.sendCustomEvent({
            type: 'whiteboard.draw',
            data: drawData,
        });
    };

    const handleMouseUp = () => {
        setIsDrawing(false);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.beginPath();
        }
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Notify others about clear action
            call.sendCustomEvent({
                type: 'whiteboard.clear',
                data: {},
            });
        }
    };

    return (
        <div className="relative size-full rounded-lg bg-[#1a1a1a] p-4">
            <div className="absolute right-4 top-4 flex gap-4">
                <button
                    onClick={clearCanvas}
                    className="rounded-md bg-red-500 px-4 py-2 text-white hover:bg-red-600"
                >
                    Clear
                </button>
                <button
                    onClick={onClose}
                    className="rounded-full bg-gray-600 p-2 hover:bg-gray-700"
                >
                    <X size={20} />
                </button>
            </div>

            <div className="absolute left-4 top-4 flex gap-2">
                {['#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00'].map((colorOption) => (
                    <button
                        key={colorOption}
                        onClick={() => setColor(colorOption)}
                        className={`size-8 rounded-full border-2 ${color === colorOption ? 'border-blue-500' : 'border-transparent'
                            }`}
                        style={{ backgroundColor: colorOption }}
                    />
                ))}
            </div>

            <canvas
                ref={canvasRef}
                width={800}
                height={600}
                className="mx-auto rounded-lg border border-gray-700 bg-[#1a1a1a]"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />
        </div>
    );
};

export default Whiteboard;
