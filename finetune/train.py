"""QLoRA fine-tuning for source-grounded study-question generation."""
import argparse
import json
from pathlib import Path

import torch
from peft import LoraConfig, prepare_model_for_kbit_training, get_peft_model
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    Trainer,
    TrainingArguments,
)

ROOT = Path(__file__).resolve().parent


def load_records(path):
    records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not records:
        raise ValueError(f"No training records found in {path}")
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="Qwen/Qwen2.5-0.5B-Instruct")
    parser.add_argument("--data", type=Path, default=ROOT / "train.jsonl")
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/quiz-lora")
    parser.add_argument("--epochs", type=float, default=5)
    parser.add_argument("--max-length", type=int, default=768)
    parser.add_argument("--gradient-accumulation", type=int, default=1)
    args = parser.parse_args()

    if not torch.cuda.is_available():
        raise SystemExit("CUDA is unavailable. Install a CUDA-enabled PyTorch build and NVIDIA driver first.")
    if not torch.cuda.is_bf16_supported():
        compute_dtype = torch.float16
    else:
        compute_dtype = torch.bfloat16
    print(f"GPU: {torch.cuda.get_device_name(0)} | VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GiB")

    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=False)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=compute_dtype,
    )
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=quantization,
        device_map={"": 0},
        trust_remote_code=False,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    model = get_peft_model(model, LoraConfig(
        r=8,
        lora_alpha=16,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules="all-linear",
    ))
    model.print_trainable_parameters()

    def encode(record):
        messages = record["messages"]
        prompt_ids = tokenizer.apply_chat_template(messages[:-1], tokenize=True, add_generation_prompt=True)
        full_ids = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=False)
        if full_ids[:len(prompt_ids)] != prompt_ids:
            raise ValueError(f"Chat prompt is not a prefix of the full sample ({record.get('id', 'unknown')})")
        if len(prompt_ids) >= args.max_length:
            raise ValueError(f"Prompt fills max length; increase --max-length for {record.get('id', 'unknown')}")
        full_ids = full_ids[:args.max_length]
        labels = [-100] * min(len(prompt_ids), len(full_ids)) + full_ids[len(prompt_ids):]
        if not any(label != -100 for label in labels):
            raise ValueError(f"No supervised answer tokens remain for {record.get('id', 'unknown')}")
        return {"input_ids": full_ids, "attention_mask": [1] * len(full_ids), "labels": labels}

    encoded = [encode(record) for record in load_records(args.data)]
    supervised_tokens = sum(sum(label != -100 for label in item["labels"]) for item in encoded)

    def collate(features):
        width = max(len(feature["input_ids"]) for feature in features)
        input_ids, attention_masks, labels = [], [], []
        for feature in features:
            padding = width - len(feature["input_ids"])
            input_ids.append(feature["input_ids"] + [tokenizer.pad_token_id] * padding)
            attention_masks.append(feature["attention_mask"] + [0] * padding)
            labels.append(feature["labels"] + [-100] * padding)
        return {
            "input_ids": torch.tensor(input_ids, dtype=torch.long),
            "attention_mask": torch.tensor(attention_masks, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
        }
    training = TrainingArguments(
        output_dir=str(args.output),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=args.gradient_accumulation,
        learning_rate=2e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        logging_steps=1,
        save_strategy="epoch",
        save_total_limit=2,
        fp16=compute_dtype == torch.float16,
        bf16=compute_dtype == torch.bfloat16,
        gradient_checkpointing=True,
        optim="paged_adamw_8bit",
        report_to="none",
        remove_unused_columns=False,
    )
    trainer = Trainer(
        model=model,
        args=training,
        train_dataset=encoded,
        data_collator=collate,
    )
    trainer.train()
    args.output.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)
    (args.output / "training_metadata.json").write_text(json.dumps({
        "base_model": args.model,
        "method": "QLoRA NF4, LoRA r=8 alpha=16",
        "epochs": args.epochs,
        "train_examples": len(encoded),
        "loss_scope": "assistant answer tokens only; system and user prompt tokens masked with -100",
        "answer_format": "answerText contains the exact correct option; resolve it to an option index with exact matching",
        "supervised_answer_tokens": supervised_tokens,
        "max_length": args.max_length,
        "gpu": torch.cuda.get_device_name(0),
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Adapter saved to {args.output}")


if __name__ == "__main__":
    main()
