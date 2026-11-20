"""Loopback-only HTTP inference service for the trained LoRA adapter."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

from format_guard import generate_with_retry

ROOT = Path(__file__).resolve().parent
BASE_MODEL = os.environ.get("MOCKTASTE_BASE_MODEL", "Qwen/Qwen2.5-0.5B-Instruct")
ADAPTER = Path(os.environ.get("MOCKTASTE_ADAPTER", ROOT / "outputs/quiz-lora"))
HOST = "127.0.0.1"
PORT = int(os.environ.get("MOCKTASTE_MODEL_PORT", "4176"))
SYSTEM = (
    "Create exactly one single-answer multiple-choice question from the supplied study passage. "
    "Use only facts supported by the passage. Return JSON only as "
    "{\"questions\":[{\"stem\":\"...\",\"options\":[\"...\",\"...\",\"...\",\"...\"],"
    "\"answerText\":\"exact text of the correct option\",\"explanation\":\"...\",\"topic\":\"...\",\"sourceQuote\":\"...\"}]}. "
    "There must be exactly four distinct options and exactly one correct answer. "
    "The sourceQuote must be copied exactly from the passage. If a question is not supported, do not invent facts."
)

if not torch.cuda.is_available():
    raise SystemExit("CUDA is unavailable; the local inference service requires an NVIDIA GPU.")
if not ADAPTER.is_dir():
    raise SystemExit(f"Adapter not found at {ADAPTER}. Train the model first.")

tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=False)
dtype = torch.float16
base = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    quantization_config=BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=dtype,
    ),
    device_map={"": 0},
    trust_remote_code=False,
)
model = PeftModel.from_pretrained(base, ADAPTER)
model.eval()
generation_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ready": True, "model": BASE_MODEL, "adapter": str(ADAPTER)})
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/generate":
            self.send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            if length < 1 or length > 300_000:
                self.send_json(413, {"error": "Request size is invalid"})
                return
            payload = json.loads(self.rfile.read(length))
            sources = payload.get("sources")
            count = payload.get("count")
            if not isinstance(sources, list) or not sources or not isinstance(count, int) or not 1 <= count <= 5:
                self.send_json(400, {"error": "Provide source material and a question count from 1 to 5"})
                return
            previous = [str(item)[:300] for item in payload.get("previousStems", [])[:30]]
            questions = []
            with generation_lock:
                for index in range(count):
                    source = sources[index % len(sources)]
                    passage = str(source.get("text", ""))[:12000]
                    if len(passage.strip()) < 40:
                        continue
                    user = f"Study passage:\n{passage}\n\nCreate one question."
                    if previous:
                        user += " Do not repeat these question stems: " + json.dumps(previous[-10:], ensure_ascii=False)
                    result = generate_with_retry(
                        model,
                        tokenizer,
                        [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                        passage,
                        max_new_tokens=384,
                    )
                    item = result.get("question")
                    if not item:
                        continue
                    questions.append({
                        "stem": item["stem"],
                        "options": item["options"],
                        "answerIndex": result["answerIndex"],
                        "explanation": item["explanation"],
                        "topic": item["topic"],
                        "sourceId": source.get("id"),
                        "sourceQuote": item["sourceQuote"],
                        "sourceLocation": item["sourceQuote"],
                    })
                    previous.append(item["stem"])
            self.send_json(200, {"questions": questions})
        except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)[:300]})
        except Exception as error:
            self.send_json(500, {"error": str(error)[:300]})

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")


print(f"Loading {BASE_MODEL} + {ADAPTER} on {torch.cuda.get_device_name(0)}")
print(f"Listening only on http://{HOST}:{PORT}")
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
