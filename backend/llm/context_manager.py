# ════════════════════════════════════════════
# SignBridge — llm/context_manager.py
# Conversation context window management
# ════════════════════════════════════════════

from collections import deque
from typing import List, Dict, Optional


class ContextManager:
    """
    Maintains a sliding context window for LLM prompts.
    Stores tuples of (role, message) and exposes a formatted context string.
    """

    def __init__(self, max_history: int = 30):
        self.max_history = max_history
        self._history: deque = deque(maxlen=max_history)

    def add_message(self, role: str, text: str):
        """
        Add a message to the context window.
        role: 'user' | 'assistant' | 'sign_user'
        """
        if text and text.strip():
            self._history.append({"role": role, "text": text.strip()})

    def get_context(self, max_chars: int = 1200) -> str:
        """
        Returns a formatted string of recent conversation history.
        Truncated to max_chars to avoid exceeding token limits.
        """
        lines = []
        for entry in self._history:
            role_label = {
                "user":       "Participant",
                "assistant":  "SignBridge AI",
                "sign_user":  "Sign User"
            }.get(entry["role"], entry["role"].title())
            lines.append(f"{role_label}: {entry['text']}")

        full = "\n".join(lines)
        if len(full) > max_chars:
            full = "..." + full[-max_chars:]
        return full

    def get_messages(self) -> List[Dict]:
        return list(self._history)

    def clear(self):
        self._history.clear()

    def __len__(self) -> int:
        return len(self._history)
