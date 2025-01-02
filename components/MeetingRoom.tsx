'use client';
import { useEffect, useState } from 'react';
import {
  CallControls,
  CallParticipantsList,
  CallStatsButton,
  CallingState,
  PaginatedGridLayout,
  SpeakerLayout,
  useCallStateHooks,
  useCall,
} from '@stream-io/video-react-sdk';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, LayoutList, Edit2, BrainCircuit } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import Loader from './Loader';
import EndCallButton from './EndCallButton';
import { cn } from '@/lib/utils';
import Whiteboard from './Whiteboard';
import QuizHost from './QuizHost';
import QuizParticipant from './QuizParticipant';
import { useQuiz } from './QuizProvider';

type CallLayoutType = 'grid' | 'speaker-left' | 'speaker-right';

type QuizEvent = {
  custom: {
    type: 'quiz.start'
    data: {
      quizId: string
      title: string
      totalQuestions: number
    }
  }
};

const MeetingRoom = () => {
  const searchParams = useSearchParams();
  const isPersonalRoom = !!searchParams.get('personal');
  const router = useRouter();
  const call = useCall();
  
  const [layout, setLayout] = useState<CallLayoutType>('speaker-left');
  const [showParticipants, setShowParticipants] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();

  const { showQuiz, setShowQuiz } = useQuiz();
  const [quizEvent, setQuizEvent] = useState<QuizEvent['custom'] | null>(null);

  useEffect(() => {
    if (!call) return;

    const handleCustomEvent = (event: QuizEvent) => {
      console.log('MeetingRoom received custom event:', event);
      // Only handle quiz events if NOT the host
      if (!call.isCreatedByMe) {
        if (event.custom?.type === 'quiz.start') {
          console.log('Setting quiz state to true for participant');
          setQuizEvent(event.custom);
          setShowQuiz(true);
        } else if (event.custom?.type === 'quiz.end') {
          setQuizEvent(null);
          setShowQuiz(false);
        }
      }
    };

    call.on('custom', handleCustomEvent);

    return () => {
      console.log('Cleaning up MeetingRoom event listener');
      call.off('custom', handleCustomEvent);
    };
  }, [call, setShowQuiz]);
  
  const isHost = call?.isCreatedByMe;

  if (callingState !== CallingState.JOINED) return <Loader />;

  const CallLayout = () => {
    if (showWhiteboard) {
      return (
        <div className="size-full">
          <Whiteboard 
            call={call!} 
            onClose={() => setShowWhiteboard(false)}
            isHost={isHost}
          />
        </div>
      );
    }

    if (showQuiz) {
      return (
        <div className="size-full bg-gray-900 p-4">
          {isHost ? (
            <QuizHost 
              onQuizEnd={() => setShowQuiz(false)} 
              ignoreCustomEvents={true}
            />
          ) : (
            <QuizParticipant quizEvent={quizEvent} />
          )}
        </div>
      );
    }
    switch (layout) {
      case 'grid':
        return <PaginatedGridLayout />;
      case 'speaker-right':
        return <SpeakerLayout participantsBarPosition="left" />;
      default:
        return <SpeakerLayout participantsBarPosition="right" />;
    }
  };

  const handleQuizClick = () => {
    if (!isHost) return;
    setShowQuiz(true);
    setShowWhiteboard(false);
  };

  const handleWhiteboardClick = () => {
    setShowWhiteboard(true);
    setShowQuiz(false);
  };

  return (
    <section className="relative h-screen w-full overflow-hidden pt-4 text-white">
      <div className="relative flex size-full items-center justify-center">
        <div className="flex size-full max-w-[1000px] items-center">
          <CallLayout />
        </div>
        <div
          className={cn('h-[calc(100vh-86px)] hidden ml-2', {
            'show-block': showParticipants,
          })}
        >
          <CallParticipantsList onClose={() => setShowParticipants(false)} />
        </div>
      </div>
      
      <div className="fixed bottom-0 flex w-full items-center justify-center gap-5">
        <CallControls onLeave={() => router.push('/')} />

        <DropdownMenu>
          <DropdownMenuTrigger className="cursor-pointer rounded-2xl bg-[#19232d] px-4 py-2 hover:bg-[#4c535b]">
            <LayoutList size={20} className="text-white" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="border-dark-1 bg-dark-1 text-white">
            {['Grid', 'Speaker-Left', 'Speaker-Right'].map((item, index) => (
              <div key={index}>
                <DropdownMenuItem
                  onClick={() => setLayout(item.toLowerCase() as CallLayoutType)}
                >
                  {item}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="border-dark-1" />
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button 
          onClick={handleWhiteboardClick}
          className={cn(
            "cursor-pointer rounded-2xl px-4 py-2 hover:bg-[#4c535b]",
            showWhiteboard ? "bg-[#4c535b]" : "bg-[#19232d]"
          )}
          title={isHost ? "Open Whiteboard (as host)" : "View Whiteboard"}
        >
          <Edit2 size={20} className="text-white" />
        </button>

        {isHost && (
          <button 
            onClick={handleQuizClick}
            className={cn(
              "cursor-pointer rounded-2xl px-4 py-2 hover:bg-[#4c535b]",
              showQuiz ? "bg-[#4c535b]" : "bg-[#19232d]"
            )}
          >
            <BrainCircuit size={20} className="text-white" />
          </button>
        )}

        <CallStatsButton />
        
        <button onClick={() => setShowParticipants((prev) => !prev)}>
          <div className="cursor-pointer rounded-2xl bg-[#19232d] px-4 py-2 hover:bg-[#4c535b]">
            <Users size={20} className="text-white" />
          </div>
        </button>
        
        {!isPersonalRoom && <EndCallButton />}
      </div>
    </section>
  );
};

export default MeetingRoom;
