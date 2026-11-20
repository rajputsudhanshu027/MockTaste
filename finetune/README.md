# Fine-tune a study-question model

This project fine-tunes an open model to follow MockTaste's source-grounded MCQ format. It uses **QLoRA**: the base model stays 4-bit and frozen while a small LoRA adapter is trained. This is a real parameter-efficient fine-tuning workflow; it does not train a language model from scratch.

## Hardware and model

The target model is `Qwen/Qwen2.5-0.5B-Instruct` (Apache-2.0 model card). The RTX 2050 in this computer exposes 3.7 GiB of VRAM to PyTorch. The script uses a batch size of 1, 4-bit NF4, gradient checkpointing, and LoRA rank 8. Close GPU-heavy applications first. If memory runs out, lower `--max-length` to 512.

## Setup

Use Python 3.11–3.14 in a dedicated environment. Install a CUDA-enabled PyTorch build that matches the installed NVIDIA driver, then install the remaining requirements:

```bash
cd finetune
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install torch --index-url https://download.pytorch.org/whl/cu128
python -m pip install -r requirements.txt
python -c 'import torch; print(torch.cuda.get_device_name(0), torch.cuda.get_device_properties(0).total_memory // 1024**2, "MiB")'
```

If CUDA is unavailable in that check, stop and fix the driver/PyTorch pairing before downloading the model. Model weights are downloaded from Hugging Face on the first run.

## Train and compare

The curated source of truth is `examples.jsonl`. It currently contains 61 original training examples across six domains and 20 held-out examples across five domains. Each record has a unique concept family, and the preparation script rejects family overlap between splits, missing source quotes, duplicate choices, invalid answer indices, and duplicate IDs. Add examples you wrote or have permission to use, and keep related concepts in only one split.

```bash
python prepare_data.py
python train.py --epochs 5 --max-length 768
python evaluate.py --output reports/base.json
python evaluate.py --adapter outputs/quiz-lora --output reports/tuned.json
```

The evaluator reports JSON schema validity and whether each source quote occurs in the supplied passage. It also saves generations for manual review. With only two held-out examples, scores are smoke checks, not evidence of quality. Grow the evaluation set and review factual correctness, ambiguity, answer balance, and explanation quality before presenting results.

The latest local run uses assistant-only loss and emits correct option text rather than a numeric answer index. A deterministic exact-match resolver can recover the index when the text matches one option. On 20 held-out examples, 14 outputs passed a strict format guard after at most one retry. The user marked 19 outputs OK and one malformed; the guard rejects more cases because it requires exact answer-option and quote matches. The adapter is available as an opt-in local demo provider, but is not ready for production student use. See the [format-guard report](reports/format-guard-run.md) and ignored raw reports under `reports/`.

## Data format

Each JSONL line contains a `messages` array with system, user, and assistant roles. The user message includes a study passage and generation request; the assistant contains the target JSON. Keep personal notes and copyrighted course material out of this repository. Generated adapter weights can retain or reproduce training content, so use only material you have permission to train on and share.

## App connection

The student app can use this adapter for practice-question and study-snap generation when explicitly enabled. Start the local model service in one terminal:

```bash
finetune/.venv/bin/python finetune/serve.py
```

Start the app in another terminal:

```bash
rtk env MOCKTASTE_LOCAL_MODEL_URL=http://127.0.0.1:4176/generate npm run start
```

Without that environment variable, the app keeps using ChatGPT for generation. With it enabled, the adapter generates questions locally; the existing ChatGPT connection is still required for account authorization and the independent answer audit. Image extraction and admin generation remain on ChatGPT. The local HTTP service binds only to loopback. Malformed model output is retried once; if it still fails the format guard, it is discarded. The adapter is for a project demo and should not be used for student tests without review.

The model card and adapter should be included in any project presentation, along with GPU, dataset size, train/eval split, settings, evaluation results, and known limits.
