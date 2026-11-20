"""Build a human-review CSV from the held-out examples and latest run."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EVAL_FILE = ROOT / "reports/tuned-dataset-v2.json"
DATA_FILE = ROOT / "eval.jsonl"
OUTPUT_FILE = ROOT / "reports/review-sheet.csv"


def main():
    reports = json.loads(EVAL_FILE.read_text(encoding="utf-8"))
    examples = {
        row["id"]: row
        for row in (json.loads(line) for line in DATA_FILE.read_text(encoding="utf-8").splitlines() if line.strip())
    }
    fields = [
        "example_id", "domain", "source_passage", "generated_question", "option_1", "option_2",
        "option_3", "option_4", "model_answer_text", "answer_matches_one_option", "explanation",
        "source_quote", "source_quote_verbatim", "human_verdict", "review_notes",
    ]
    with OUTPUT_FILE.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for result in reports["results"]:
            example = examples[result["example_id"]]
            try:
                generated = json.loads(result["generation"])["questions"][0]
            except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                generated = {}
            options = generated.get("options", [])
            options = options if isinstance(options, list) else []
            writer.writerow({
                "example_id": example["id"],
                "domain": example["domain"],
                "source_passage": example["messages"][-2]["content"],
                "generated_question": generated.get("stem", "[malformed or missing question]"),
                "option_1": options[0] if len(options) > 0 else "",
                "option_2": options[1] if len(options) > 1 else "",
                "option_3": options[2] if len(options) > 2 else "",
                "option_4": options[3] if len(options) > 3 else "",
                "model_answer_text": generated.get("answerText", ""),
                "answer_matches_one_option": result["answer_text_resolves_to_one_option"],
                "explanation": generated.get("explanation", ""),
                "source_quote": generated.get("sourceQuote", ""),
                "source_quote_verbatim": result["source_quote_present"],
                "human_verdict": "",
                "review_notes": "",
            })
    print(f"Wrote {len(reports['results'])} review rows to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
