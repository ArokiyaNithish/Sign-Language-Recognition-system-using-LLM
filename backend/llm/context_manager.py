from typing import List, Dict

class ConversationContextManager:
    """
    Manages the context window for a meeting to assist the LLM in 
    better understanding context-dependent sign language translations.
    """
    def __init__(self, meeting_id: str, max_history=50):
        self.meeting_id = meeting_id
        self.max_history = max_history
        self.history: List[Dict] = []
        self.topic = "General Conversation"

    def add_interaction(self, speaker: str, text: str, timestamp: str):
        self.history.append({
            "speaker": speaker,
            "text": text,
            "timestamp": timestamp
        })
        
        if len(self.history) > self.max_history:
            self.history.pop(0)

    def get_formatted_context(self) -> str:
        """Returns the recent history formatted for LLM prompts"""
        if not self.history:
            return "No previous context."
            
        context_str = "Recent Conversation History:\n"
        for item in self.history[-10:]: # Get last 10 for immediate context
            context_str += f"[{item['speaker']}]: {item['text']}\n"
            
        return context_str
        
    def set_topic(self, topic: str):
        self.topic = topic
