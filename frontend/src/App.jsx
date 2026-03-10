import { useState, useEffect, useRef } from 'react';
import ParticipantTile from './components/ParticipantTile';
import ControlBar from './components/ControlBar';
import TextInputBox from './components/TextInputBox';
import { signDetector } from './utils/SignDetector';

const MOCK_REMOTE_USERS = [
  { id: 1, name: "Alice (Signer)", role: "sign", isLocal: false, subtitle: "", isCameraOn: true },
  { id: 2, name: "Bob", role: "normal", isLocal: false, subtitle: "", isCameraOn: false },
];

export default function App() {
  const [role, setRole] = useState(null); // 'sign' or 'normal'
  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);

  const [localSubtitle, setLocalSubtitle] = useState("");
  const [remoteUsers, setRemoteUsers] = useState(MOCK_REMOTE_USERS);

  const videoRef = useRef(null);
  const subtitleTimeoutRef = useRef(null);

  // Ask for permissions and get camera track
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false // handle mic separately to avoid feedback in local testing
      });
      setLocalStream(stream);
      setCameraOn(true);
    } catch (err) {
      console.error("Failed to get camera:", err);
      setCameraOn(false);
    }
  };

  const stopCamera = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
      setCameraOn(false);
    }
  };

  // Turn camera on/off explicitly
  const toggleCamera = async () => {
    if (cameraOn) {
      stopCamera();
    } else {
      await startCamera();
    }
  };

  const toggleMic = () => {
    setMicOn(!micOn);
  };

  // Clear subtitle after 3 seconds whenever it changes
  useEffect(() => {
    if (localSubtitle) {
      if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
      subtitleTimeoutRef.current = setTimeout(() => {
        setLocalSubtitle("");
      }, 4000);
    }
    return () => clearTimeout(subtitleTimeoutRef.current);
  }, [localSubtitle]);

  // Hook up Sign Detector when role is 'sign' and camera is on
  useEffect(() => {
    if (role === 'sign' && cameraOn && localStream) {
      // Simulate real video element being passed by creating a mock or just passing true since we simulate
      signDetector.startDetection(true, (text) => {
        setLocalSubtitle(text);
      });
    } else {
      signDetector.stopDetection();
    }

    return () => signDetector.stopDetection();
  }, [role, cameraOn, localStream]);

  // Handle setting role and doing initial setup
  const joinMeeting = (selectedRole) => {
    setRole(selectedRole);
    if (selectedRole === 'sign') {
      startCamera();
    }
  };

  const leaveMeeting = () => {
    stopCamera();
    setRole(null);
    setLocalSubtitle("");
  };

  // Role Selection Screen
  if (!role) {
    return (
      <div className="w-full h-full min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 space-y-8">
        <h1 className="text-4xl text-white font-bold tracking-tight">Join SignBridge Meeting</h1>
        <p className="text-gray-400 text-lg">Select your user role to enter the meeting.</p>

        <div className="flex flex-col sm:flex-row gap-6">
          <button
            onClick={() => joinMeeting('sign')}
            className="w-64 h-48 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-blue-500 rounded-2xl flex flex-col items-center justify-center gap-4 transition-all shadow-lg group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="text-5xl group-hover:scale-110 transition-transform">🤟</span>
            <div className="text-center">
              <h3 className="text-white font-semibold text-xl">Sign Language User</h3>
              <p className="text-sm text-gray-400 mt-2 px-4">Use your camera to translate gestures into text</p>
            </div>
          </button>

          <button
            onClick={() => joinMeeting('normal')}
            className="w-64 h-48 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-emerald-500 rounded-2xl flex flex-col items-center justify-center gap-4 transition-all shadow-lg group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="text-5xl group-hover:scale-110 transition-transform">💬</span>
            <div className="text-center">
              <h3 className="text-white font-semibold text-xl">Normal User</h3>
              <p className="text-sm text-gray-400 mt-2 px-4">Type messages to share live captions with others</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Main Meeting UI
  return (
    <div className="w-full h-full min-h-screen bg-gray-900 flex flex-col pb-24 relative overflow-hidden">

      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            SignBridge Room
          </span>
          <span className="bg-gray-800 text-xs px-2 py-1 rounded-md text-gray-400 border border-gray-700">
            {role === 'sign' ? '🤟 Signer Mode' : '💬 Caption Mode'}
          </span>
        </div>
        <div className="flex gap-2 text-gray-400 text-sm">
          <span>Users: {remoteUsers.length + 1}</span>
        </div>
      </div>

      {/* Video Grid layout: Dynamic based on participants */}
      <div className="flex-1 p-4 flex gap-4 w-full h-full justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-7xl auto-rows-fr h-[calc(100vh-140px)]">
          {/* Local User */}
          <ParticipantTile
            name="You"
            role={role}
            isLocal={true}
            subtitle={localSubtitle}
            videoStream={localStream}
            isCameraOn={cameraOn}
          />

          {/* Remote Users */}
          {remoteUsers.map(user => (
            <ParticipantTile
              key={user.id}
              name={user.name}
              role={user.role}
              isLocal={false}
              subtitle={user.subtitle}
              videoStream={null} // mock
              isCameraOn={user.isCameraOn}
            />
          ))}
        </div>
      </div>

      {/* Normal User Text Input (only show if role = normal) */}
      {role === 'normal' && (
        <TextInputBox onSend={(text) => setLocalSubtitle(text)} />
      )}

      {/* Bottom Control Bar */}
      <ControlBar
        micOn={micOn}
        cameraOn={cameraOn}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onLeave={leaveMeeting}
      />

    </div>
  );
}
