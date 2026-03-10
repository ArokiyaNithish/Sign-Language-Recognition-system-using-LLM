# ════════════════════════════════════════════
# SignBridge — llm/fine_tune_prep.py
# Dataset preparation for LLM fine-tuning
# Generates JSONL training pairs from ASL phrases
# ════════════════════════════════════════════

import json
import os
import random
from pathlib import Path

# ── Common ASL phrases and their letter spellings ─
ASL_PHRASE_PAIRS = [
    (["H","E","L","L","O"],                     "Hello"),
    (["H","I"],                                  "Hi"),
    (["T","H","A","N","K"," ","Y","O","U"],     "Thank you"),
    (["P","L","E","A","S","E"],                  "Please"),
    (["Y","O","U","R","E"," ","W","E","L","C","O","M","E"], "You're welcome"),
    (["G","O","O","D"," ","M","O","R","N","I","N","G"],     "Good morning"),
    (["G","O","O","D"," ","N","I","G","H","T"],             "Good night"),
    (["H","O","W"," ","A","R","E"," ","Y","O","U"],         "How are you"),
    (["I","M"," ","F","I","N","E"],                          "I'm fine"),
    (["Y","E","S"],                               "Yes"),
    (["N","O"],                                   "No"),
    (["M","Y"," ","N","A","M","E"," ","I","S"],  "My name is"),
    (["N","I","C","E"," ","T","O"," ","M","E","E","T"," ","Y","O","U"], "Nice to meet you"),
    (["I"," ","D","O","N","T"," ","U","N","D","E","R","S","T","A","N","D"], "I don't understand"),
    (["C","A","N"," ","Y","O","U"," ","R","E","P","E","A","T"],           "Can you repeat"),
    (["S","L","O","W","E","R"," ","P","L","E","A","S","E"],               "Slower please"),
    (["H","E","L","P"],                           "Help"),
    (["S","O","R","R","Y"],                       "Sorry"),
    (["E","X","C","U","S","E"," ","M","E"],      "Excuse me"),
    (["W","H","E","R","E"," ","I","S"],           "Where is"),
    (["W","H","A","T"," ","T","I","M","E"],       "What time"),
    (["I"," ","A","G","R","E","E"],               "I agree"),
    (["G","O","O","D"," ","I","D","E","A"],       "Good idea"),
    (["L","E","T","S"," ","S","T","A","R","T"],   "Let's start"),
    (["A","N","Y"," ","Q","U","E","S","T","I","O","N","S"], "Any questions"),
]

SYSTEM_PROMPT = (
    "You are an expert ASL interpreter AI. Convert sequences of detected "
    "ASL signs/letters into natural, fluent English sentences."
)


def generate_training_pairs(output_path: str = "./data/finetune_pairs.jsonl") -> int:
    """
    Generate JSONL dataset for LLM fine-tuning.
    Each line: {"messages": [{"role":"system",...}, {"role":"user",...}, {"role":"assistant",...}]}
    Returns number of pairs generated.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    pairs = []
    for signs, phrase in ASL_PHRASE_PAIRS:
        # Exact pair
        pairs.append((signs, phrase))

        # Slightly noisy versions
        for _ in range(3):
            noisy = _add_noise(signs)
            pairs.append((noisy, phrase))

    random.shuffle(pairs)

    with open(output_path, "w", encoding="utf-8") as f:
        for signs, phrase in pairs:
            joined = " ".join(signs)
            record = {
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": f"Signs detected: {joined}\n\nNatural English:"},
                    {"role": "assistant", "content": phrase}
                ]
            }
            f.write(json.dumps(record) + "\n")

    print(f"[SignBridge FineTune] Generated {len(pairs)} training pairs → {output_path}")
    return len(pairs)


def _add_noise(signs: list, noise_prob: float = 0.1) -> list:
    """Simulate occasional mis-detection by dropping or swapping a letter."""
    noisy = list(signs)
    for i in range(len(noisy)):
        if random.random() < noise_prob and len(noisy) > 2:
            # Drop a random non-space letter
            idx_to_drop = random.choice([j for j, c in enumerate(noisy) if c != " "])
            noisy.pop(idx_to_drop)
            break
    return noisy


if __name__ == "__main__":
    n = generate_training_pairs()
    print(f"Done. {n} fine-tuning pairs ready.")
