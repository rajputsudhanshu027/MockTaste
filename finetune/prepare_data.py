"""Validate curated records and create leakage-aware train/eval chat JSONL."""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INSTRUCTIONS = (
    "Create exactly one single-answer multiple-choice question from the supplied study passage. "
    "Use only facts supported by the passage. Return JSON only as "
    "{\"questions\":[{\"stem\":\"...\",\"options\":[\"...\",\"...\",\"...\",\"...\"],"
    "\"answerText\":\"exact text of the correct option\",\"explanation\":\"...\",\"topic\":\"...\",\"sourceQuote\":\"...\"}]}. "
    "There must be exactly four distinct options and exactly one correct answer. "
    "The sourceQuote must be copied exactly from the passage. If a question is not supported, do not invent facts."
)


def normalize(text):
    return re.sub(r"\s+", " ", text).strip().casefold()


def main():
    source = ROOT / "examples.jsonl"
    rows = [json.loads(line) for line in source.read_text(encoding="utf-8").splitlines() if line.strip()]
    ids = [row["id"] for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("Each example id must be unique")
    splits = {"train": [], "eval": []}
    for row in rows:
        if row["split"] not in splits:
            raise ValueError(f"Invalid split on {row['id']}")
        options = row["options"]
        if len(options) != 4 or len({normalize(value) for value in options}) != 4:
            raise ValueError(f"Expected four distinct options on {row['id']}")
        if not 0 <= row["answerIndex"] < 4:
            raise ValueError(f"Invalid answerIndex on {row['id']}")
        if normalize(row["sourceQuote"]) not in normalize(row["passage"]):
            raise ValueError(f"sourceQuote is not copied from passage on {row['id']}")
        splits[row["split"]].append(row)

    train_families = {row["family"] for row in splits["train"]}
    eval_families = {row["family"] for row in splits["eval"]}
    overlap = train_families & eval_families
    if overlap:
        raise ValueError(f"Concept families occur in both splits: {sorted(overlap)}")
    if not splits["train"] or not splits["eval"]:
        raise ValueError("Both train and eval splits need examples")

    for split, examples in splits.items():
        target = ROOT / f"{split}.jsonl"
        with target.open("w", encoding="utf-8") as stream:
            for row in examples:
                question = {
                    "stem": row["question"],
                    "options": row["options"],
                    "answerText": row["options"][row["answerIndex"]],
                    "explanation": row["explanation"],
                    "topic": row["family"],
                    "sourceQuote": row["sourceQuote"],
                }
                messages = [
                    {"role": "system", "content": INSTRUCTIONS},
                    {"role": "user", "content": f"Study passage:\n{row['passage']}\n\nCreate one question."},
                    {"role": "assistant", "content": json.dumps({"questions": [question]}, ensure_ascii=False)},
                ]
                stream.write(json.dumps({
                    "id": row["id"],
                    "domain": row["domain"],
                    "family": row["family"],
                    "messages": messages,
                }, ensure_ascii=False) + "\n")

    print(f"Prepared {len(splits['train'])} train and {len(splits['eval'])} eval examples")
    print("Train domains:", dict(Counter(row["domain"] for row in splits["train"])))
    print("Eval domains: ", dict(Counter(row["domain"] for row in splits["eval"])))
    print("Concept families are disjoint between splits.")


if __name__ == "__main__":
    main()
