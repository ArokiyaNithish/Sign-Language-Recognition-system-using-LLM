import { useEffect, useRef } from 'react';

export default function ParticipantTile({
    name,
    role,
    isLocal,
    subtitle,
    videoStream,
    isCameraOn
}) {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current && videoStream) {
            videoRef.current.srcObject = videoStream;
        }
    }, [videoStream]);

    return (
        <div className="relative bg-gray-800 rounded-xl overflow-hidden aspect-video shadow-lg ring-1 ring-gray-700/50 group">
            {/* Video element or placeholder */}
            {isCameraOn && videoStream ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal}
                    className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
                />
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800">
                    <div className="w-20 h-20 rounded-full bg-gray-600 flex items-center justify-center text-3xl font-bold text-gray-300">
                        {name.charAt(0).toUpperCase()}
                    </div>
                </div>
            )}

            {/* Name and Role Badge */}
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 z-10">
                <span className="text-white text-sm font-medium">{name} {isLocal && "(You)"}</span>
                <span className="bg-gray-700/80 rounded px-1.5 py-0.5 text-xs flex items-center">
                    {role === 'sign' ? '🤟' : '💬'}
                </span>
            </div>

            {/* Subtitles Overlay */}
            {subtitle && (
                <div className="absolute bottom-4 left-0 w-full flex justify-center px-4 z-20">
                    <div className="bg-black/70 backdrop-blur-md text-white px-4 py-2 rounded-lg text-center max-w-[90%] shadow-xl border border-white/10 transition-all">
                        <p className="text-lg font-medium tracking-wide">
                            {subtitle}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
