"""Evaluate base or LoRA model for valid, source-grounded MCQ output."""
import argparse
import json
from pathlib import Path

from format_guard import generate_with_retry, normalize
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="Qwen/Qwen2.5-0.5B-Instruct")
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--data", type=Path, default=ROOT / "eval.jsonl")
    parser.add_argument("--output", type=Path, default=ROOT / "reports/evaluation.json")
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise SystemExit("CUDA is unavailable. Run evaluation on the configured NVIDIA GPU.")

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    dtype = torch.float16
    base = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=dtype),
        device_map={"": 0},
    )
    model = PeftModel.from_pretrained(base, args.adapter) if args.adapter else base
    rows = [json.loads(line) for line in args.data.read_text(encoding="utf-8").splitlines() if line.strip()]
    results = []
    for row in rows:
        messages = row["messages"]
        reference = json.loads(messages[-1]["content"])
        reference_question = reference["questions"][0]
        reference_answer_text = reference_question.get("answerText", "")
        reference_answer_indices = [index for index, option in enumerate(reference_question["options"])
                                   if normalize(option) == normalize(reference_answer_text)]
        user_text = messages[-2]["content"]
        passage = user_text.removeprefix("Study passage:\n").split("\n\nCreate one question.", 1)[0]
        guarded = generate_with_retry(model, tokenizer, messages[:-1], passage)
        answer = guarded["raw"]
        generated_question = guarded["question"] or {}
        valid = generated_question is not None and bool(generated_question)
        quote_present = valid
        answer_resolves = guarded["answerIndex"] is not None
        same_canonical_item = valid and (
            normalize(generated_question["stem"]) == normalize(reference_question["stem"])
            and [normalize(item) for item in generated_question["options"]]
            == [normalize(item) for item in reference_question["options"]]
        )
        canonical_answer_match = (
            guarded["answerIndex"] == reference_answer_indices[0]
            if same_canonical_item and answer_resolves and len(reference_answer_indices) == 1 else None
        )
        results.append({
            "example_id": row.get("id"),
            "valid_schema": valid,
            "source_quote_present": quote_present,
            "answer_text_resolves_to_one_option": answer_resolves,
            "attempts": guarded["attempts"],
            "first_attempt_error": guarded["first_error"],
            "final_error": guarded.get("final_error"),
            "matches_canonical_question_and_choices": same_canonical_item,
            "canonical_answer_key_matches": canonical_answer_match,
            "requires_manual_review": not (quote_present and canonical_answer_match is True),
            "generation": answer,
        })
    summary = {
        "model": args.model,
        "adapter": str(args.adapter) if args.adapter else None,
        "examples": len(results),
        "valid_schema": sum(r["valid_schema"] for r in results),
        "passed_full_format_guard": sum(r["valid_schema"] for r in results),
        "source_quote_present": sum(r["source_quote_present"] for r in results),
        "answer_text_resolves_to_one_option": sum(r["answer_text_resolves_to_one_option"] for r in results),
        "canonical_items_matched": sum(r["matches_canonical_question_and_choices"] for r in results),
        "canonical_answer_keys_matched": sum(r["canonical_answer_key_matches"] is True for r in results),
        "manual_review_required": sum(r["requires_manual_review"] for r in results),
        "limitations": "Quote presence is not entailment. Novel questions and answer correctness need human review; canonical answer-key comparison is only scored when stem and options match exactly.",
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Full format guard: {summary['passed_full_format_guard']}/{len(results)} | human review: {summary['manual_review_required']}/{len(results)}")
    print(f"Report: {args.output}")


if __name__ == "__main__":
    main()
