import React, { useEffect, useRef, useState } from 'react';
import { Call, CallEventListener, CustomVideoEvent } from '@stream-io/video-react-sdk';
import { X } from 'lucide-react';
import debounce from 'lodash/debounce';

interface WhiteboardProps {
    call: Call;
    onClose: () => void;
    isHost?: boolean;
}

interface Point {
    x: number;
    y: number;
}

interface Stroke {
    points: Point[];
    color: string;
    isNewStroke: boolean;
}

interface WhiteboardState {
    strokes: Stroke[];
    version: number;
}

interface DrawEventData {
    type: 'stroke' | 'clear' | 'request_state' | 'full_state';
    stroke?: Stroke;
    state?: WhiteboardState;
}

type WhiteboardEventType = 'whiteboard.draw' | 'whiteboard.sync';

interface WhiteboardCustomEvent extends CustomVideoEvent {
    type: 'custom';
    custom: {
        type: WhiteboardEventType;
        data: DrawEventData;
    };
}

const BATCH_INTERVAL = 50; // Reduced from 100 to improve responsiveness
const MAX_RETRY_ATTEMPTS = 5; // Increased from 3
const MAX_POINTS_PER_BATCH = 25; // Reduced from 50 to ensure faster transmission
const STATE_SYNC_INTERVAL = 5000; // Sync full state every 5 seconds
const RETRY_DELAY = 500; // 500ms between retries

// Create a static key for the call
const getStorageKey = (callId: string) => `whiteboard_state_${callId}`;

const Whiteboard: React.FC<WhiteboardProps> = ({ call, onClose, isHost = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState('#FFFFFF');
    const currentStroke = useRef<Point[]>([]);
    const pointsBuffer = useRef<Point[]>([]);
    const [initialized, setInitialized] = useState(false);
    // eslint-disable-next-line no-undef
    const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const stateRef = useRef<WhiteboardState>({
        strokes: [],
        version: 0
    });

    // Load saved state on mount
    useEffect(() => {
        const savedState = localStorage.getItem(getStorageKey(call.cid));
        if (savedState) {
            try {
                const parsedState = JSON.parse(savedState);
                stateRef.current = parsedState;
                if (canvasRef.current) {
                    redrawCanvas();
                }
            } catch (error) {
                console.error('Error loading saved state:', error);
            }
        }
    }, [call.cid]);

    // Initialize canvas and request state
    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // Initial canvas setup
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;
        ctxRef.current = ctx;

        // Request current state when joining
        if (!isHost && !initialized) {
            requestStateWithRetry();
        }

        // If host, redraw existing state
        if (isHost && stateRef.current.strokes.length > 0) {
            redrawCanvas();
        }

        // Set up periodic state sync for host
        if (isHost) {
            syncIntervalRef.current = setInterval(() => {
                sendState();
            }, STATE_SYNC_INTERVAL);
        }

        return () => {
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
            }
        };
    }, [initialized, isHost, call.cid]);

    const requestStateWithRetry = async (attempts = 0) => {
        if (attempts >= MAX_RETRY_ATTEMPTS) {
            console.error('Max retry attempts reached for state request');
            return;
        }

        try {
            await call.sendCustomEvent({
                type: 'whiteboard.sync',
                data: {
                    type: 'request_state'
                }
            });
        } catch (error) {
            console.error('Error requesting state:', error);
            setTimeout(() => requestStateWithRetry(attempts + 1), RETRY_DELAY);
        }
    };

    const saveState = () => {
        try {
            localStorage.setItem(
                getStorageKey(call.cid),
                JSON.stringify(stateRef.current)
            );
        } catch (error) {
            console.error('Error saving state:', error);
        }
    };

    const sendState = async () => {
        if (!isHost) return;

        try {
            await call.sendCustomEvent({
                type: 'whiteboard.sync',
                data: {
                    type: 'full_state',
                    state: stateRef.current
                }
            });
        } catch (error) {
            console.error('Error sending state:', error);
        }
    };

    const redrawCanvas = () => {
        const ctx = ctxRef.current;
        if (!ctx || !canvasRef.current) return;

        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        // Redraw all strokes
        stateRef.current.strokes.forEach(stroke => {
            ctx.strokeStyle = stroke.color;
            ctx.beginPath();
            stroke.points.forEach((point, index) => {
                if (index === 0) {
                    ctx.moveTo(point.x, point.y);
                } else {
                    ctx.lineTo(point.x, point.y);
                }
            });
            ctx.stroke();
        });
    };

    useEffect(() => {
        if (!call) return;

        const handleCustomEvent: CallEventListener<'custom'> = ((event) => {
            if (!('custom' in event)) return;

            const customEvent = event as WhiteboardCustomEvent;
            if (!customEvent.custom.data) return;

            const { data } = customEvent.custom;
            
            switch (data.type) {
                case 'stroke': {
                    if (data.stroke) {
                        const ctx = ctxRef.current;
                        if (!ctx) return;

                        // Add stroke to state
                        stateRef.current = {
                            strokes: [...stateRef.current.strokes, data.stroke],
                            version: stateRef.current.version + 1
                        };

                        // Draw the stroke
                        ctx.strokeStyle = data.stroke.color;
                        ctx.beginPath();
                        data.stroke.points.forEach((point, index) => {
                            if (index === 0) {
                                ctx.moveTo(point.x, point.y);
                            } else {
                                ctx.lineTo(point.x, point.y);
                            }
                        });
                        ctx.stroke();

                        // Save state
                        saveState();
                    }
                    break;
                }

                case 'clear': {
                    stateRef.current = {
                        strokes: [],
                        version: stateRef.current.version + 1
                    };
                    redrawCanvas();
                    saveState();
                    break;
                }

                case 'request_state': {
                    if (isHost) {
                        sendState();
                    }
                    break;
                }

                case 'full_state': {
                    if (data.state && !isHost) {
                        stateRef.current = data.state;
                        redrawCanvas();
                        saveState();
                        setInitialized(true);
                    }
                    break;
                }
            }
        }) as CallEventListener<'custom'>;

        call.on('custom', handleCustomEvent);

        return () => {
            call.off('custom', handleCustomEvent);
        };
    }, [call, isHost]);

    const sendStrokeWithRetry = async (stroke: Stroke, attempts = 0) => {
        if (attempts >= MAX_RETRY_ATTEMPTS) {
            console.error('Max retry attempts reached');
            return;
        }

        try {
            await call.sendCustomEvent({
                type: 'whiteboard.draw',
                data: {
                    type: 'stroke',
                    stroke
                },
            });

            // Update local state
            stateRef.current = {
                strokes: [...stateRef.current.strokes, stroke],
                version: stateRef.current.version + 1
            };
            saveState();
        } catch (error) {
            console.error('Error sending stroke:', error);
            setTimeout(() => sendStrokeWithRetry(stroke, attempts + 1), RETRY_DELAY);
        }
    };

    const debouncedSendPoints = debounce(() => {
        if (pointsBuffer.current.length === 0) return;

        const points = [...pointsBuffer.current];
        pointsBuffer.current = [];

        // Split points into smaller batches
        for (let i = 0; i < points.length; i += MAX_POINTS_PER_BATCH) {
            const batchPoints = points.slice(i, i + MAX_POINTS_PER_BATCH);
            const stroke: Stroke = {
                points: batchPoints,
                color,
                isNewStroke: i === 0 && currentStroke.current.length === 0
            };
            sendStrokeWithRetry(stroke);
        }
    }, BATCH_INTERVAL);

    const drawPoint = (point: Point) => {
        const ctx = ctxRef.current;
        if (!ctx) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        if (currentStroke.current.length === 0) {
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
        } else {
            ctx.lineTo(point.x, point.y);
            ctx.stroke();
        }

        currentStroke.current.push(point);
        pointsBuffer.current.push(point);
        
        if (isHost) {
            debouncedSendPoints();
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isHost) return;
        
        setIsDrawing(true);
        currentStroke.current = [];
        
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const point = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        drawPoint(point);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isHost || !isDrawing) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const point = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        drawPoint(point);
    };

    const handleMouseUp = () => {
        if (!isHost) return;
        setIsDrawing(false);
        currentStroke.current = [];
        debouncedSendPoints.flush();
    };

    const clearCanvas = async () => {
        if (!isHost) return;
        
        const ctx = ctxRef.current;
        if (!ctx || !canvasRef.current) return;

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        currentStroke.current = [];
        pointsBuffer.current = [];

        // Clear state
        stateRef.current = {
            strokes: [],
            version: stateRef.current.version + 1
        };
        saveState();

        try {
            await call.sendCustomEvent({
                type: 'whiteboard.draw',
                data: {
                    type: 'clear'
                },
            });
        } catch (error) {
            console.error('Error sending clear event:', error);
        }
    };

    return (
        <div className="relative size-full rounded-lg bg-[#1a1a1a] p-4">
            <div className="absolute right-4 top-4 flex gap-4">
                {isHost && (
                    <button
                        onClick={clearCanvas}
                        className="rounded-md bg-red-500 px-4 py-2 text-white hover:bg-red-600"
                    >
                        Clear
                    </button>
                )}
                <button
                    onClick={onClose}
                    className="rounded-full bg-gray-600 p-2 hover:bg-gray-700"
                >
                    <X size={20} />
                </button>
            </div>

            {isHost && (
                <div className="absolute left-4 top-4 flex gap-2">
                    {['#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00'].map((colorOption) => (
                        <button
                            key={colorOption}
                            onClick={() => setColor(colorOption)}
                            className={`size-8 rounded-full border-2 ${color === colorOption ? 'border-blue-500' : 'border-transparent'}`}
                            style={{ backgroundColor: colorOption }}
                        />
                    ))}
                </div>
            )}

            <canvas
                ref={canvasRef}
                width={800}
                height={600}
                className={`mx-auto rounded-lg border border-gray-700 bg-[#1a1a1a] ${isHost ? 'cursor-crosshair' : 'cursor-default'}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />
        </div>
    );
};

export default Whiteboard;
