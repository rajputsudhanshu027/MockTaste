"""Validate generated MCQs and retry once with actionable format feedback."""
import json
import re


def normalize(text):
    return re.sub(r"\s+", " ", str(text)).strip().casefold()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def validate_output(text, passage):
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE)
    try:
        payload = json.loads(cleaned, object_pairs_hook=unique_object)
    except (json.JSONDecodeError, ValueError) as error:
        return None, f"Return valid JSON with no duplicate keys ({error})."

    questions = payload.get("questions") if isinstance(payload, dict) else None
    if not isinstance(questions, list) or len(questions) != 1:
        return None, 'Return exactly one question inside the "questions" array.'
    question = questions[0]
    if not isinstance(question, dict):
        return None, "The question must be a JSON object."
    required = ("stem", "options", "answerText", "explanation", "topic", "sourceQuote")
    if any(not isinstance(question.get(key), str) or not question[key].strip() for key in required if key != "options"):
        return None, "Include non-empty stem, answerText, explanation, topic, and sourceQuote strings."
    options = question.get("options")
    if not isinstance(options, list) or len(options) != 4 or any(not isinstance(item, str) or not item.strip() for item in options):
        return None, "Include exactly four non-empty string options."
    if len({normalize(item) for item in options}) != 4:
        return None, "All four options must be distinct."
    answer_indices = [index for index, option in enumerate(options) if normalize(option) == normalize(question["answerText"])]
    if len(answer_indices) != 1:
        return None, "answerText must exactly match one and only one option."
    if normalize(question["sourceQuote"]) not in normalize(passage):
        return None, "sourceQuote must be copied verbatim from the supplied passage."
    return {"question": question, "answerIndex": answer_indices[0], "raw": cleaned}, None


def generate_with_retry(model, tokenizer, messages, passage, max_new_tokens=384):
    conversation = list(messages)
    first_error = None
    for attempt in range(1, 3):
        prompt = tokenizer.apply_chat_template(conversation, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
        import torch
        with torch.inference_mode():
            output = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )
        raw = tokenizer.decode(output[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
        parsed, error = validate_output(raw, passage)
        if parsed:
            return {**parsed, "attempts": attempt, "first_error": first_error}
        if attempt == 1:
            first_error = error
            conversation.extend([
                {"role": "assistant", "content": raw},
                {"role": "user", "content": f"The response failed this check: {error} Correct the response. Return only the required JSON, using only the supplied passage."},
            ])
    return {"question": None, "answerIndex": None, "raw": raw, "attempts": 2, "first_error": first_error, "final_error": error}
