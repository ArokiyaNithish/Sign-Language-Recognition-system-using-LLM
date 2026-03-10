import { useState, useRef, useEffect } from 'react';
import { SendHorizontal } from 'lucide-react';

export default function TextInputBox({ onSend }) {
    const [text, setText] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (text.trim()) {
            onSend(text.trim());
            setText('');
        }
    };

    return (
        <div className="fixed bottom-24 right-6 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-4 z-50">
            <div className="mb-2 text-sm text-gray-400 font-medium tracking-wide uppercase">
                Live Caption Input
            </div>
            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    ref={inputRef}
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type message to caption..."
                    className="flex-1 bg-gray-900 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-3 py-2 transition-colors flex items-center justify-center"
                    disabled={!text.trim()}
                >
                    <SendHorizontal size={18} />
                </button>
            </form>
        </div>
    );
}
