import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';

export default function ControlBar({
    micOn,
    cameraOn,
    onToggleMic,
    onToggleCamera,
    onLeave,
}) {
    return (
        <div className="h-20 bg-gray-900 border-t border-gray-800 flex items-center justify-center gap-4 px-6 w-full fixed bottom-0 z-50">
            <button
                onClick={onToggleMic}
                className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors ${micOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'
                    }`}
                title={micOn ? "Turn off microphone" : "Turn on microphone"}
            >
                {micOn ? <Mic size={20} className="text-white" /> : <MicOff size={20} className="text-white" />}
            </button>

            <button
                onClick={onToggleCamera}
                className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors ${cameraOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'
                    }`}
                title={cameraOn ? "Turn off camera" : "Turn on camera"}
            >
                {cameraOn ? <Video size={20} className="text-white" /> : <VideoOff size={20} className="text-white" />}
            </button>

            <button
                onClick={onLeave}
                className="w-16 h-12 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 transition-colors ml-4"
                title="Leave Meeting"
            >
                <PhoneOff size={24} className="text-white" />
            </button>
        </div>
    );
}
