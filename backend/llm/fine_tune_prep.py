import json
import os

class FineTuneDataPrep:
    """
    Prepares meeting data to fine-tune an LLM specifically for better 
    Sign Language to English translation by extracting corrected phrases.
    """
    def __init__(self, output_dir="./finetune_data"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)
        self.samples = []

    def add_sample(self, raw_signs: list[str], corrected_sentence: str):
        """
        Add a training sample simulating a user correcting a raw sign sequence
        """
        prompt = f"Convert this sequence of detected signs/letters into natural, fluent English.\nSigns detected: {' '.join(raw_signs)}"
        
        # Gemini fine-tuning format
        self.samples.append({
            "messages": [
                {"role": "user", "content": prompt},
                {"role": "model", "content": corrected_sentence}
            ]
        })

    def export_jsonl(self, filename="sign_finetune.jsonl"):
        """Export to JSONL format expected by Vertex AI / Gemini fine-tuning"""
        path = os.path.join(self.output_dir, filename)
        with open(path, 'w') as f:
            for sample in self.samples:
                f.write(json.dumps(sample) + "\n")
        print(f"[FineTuneDataPrep] Exported {len(self.samples)} samples to {path}")
        return path
