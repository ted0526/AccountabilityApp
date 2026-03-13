from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR
from PIL import Image
from pillow_heif import register_heif_opener
from spellchecker import SpellChecker
import tempfile
import os
import re

register_heif_opener()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.0.24:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ocr = PaddleOCR(
    lang="en",
    text_detection_model_name="PP-OCRv5_server_det",
    text_recognition_model_name="PP-OCRv5_server_rec",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
)

spell = SpellChecker()

MAX_SIDE = 1600


def clean_raw_text(text: str) -> str:
    # Keep letters, numbers, spaces, and punctuation for raw OCR cleanup
    cleaned = re.sub(r"[^A-Za-z0-9\s.,!?'\-:/()\[\]%+]", " ", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def strip_punctuation(text: str) -> str:
    # Remove punctuation entirely, keep only letters/numbers/spaces
    stripped = re.sub(r"[^A-Za-z0-9\s]", " ", text)
    stripped = re.sub(r"\s+", " ", stripped).strip()
    return stripped


def is_useful_text(text: str) -> bool:
    if not text:
        return False
    if len(text) < 2:
        return False
    if not re.search(r"[A-Za-z0-9]", text):
        return False
    return True


def detect_done(text: str) -> tuple[bool, str]:
    stripped = text.strip()

    if stripped.startswith("[x]") or stripped.startswith("[X]"):
        return True, stripped[3:].strip()

    if stripped.startswith("[ ]"):
        return False, stripped[3:].strip()

    if stripped.startswith("x "):
        return True, stripped[2:].strip()

    if stripped.startswith("- "):
        return False, stripped[2:].strip()

    return False, stripped


def maybe_correct_word(word: str) -> str:
    if len(word) <= 2:
        return word
    if word.isupper():
        return word
    if re.fullmatch(r"\d+", word):
        return word

    corrected = spell.correction(word)
    return corrected if corrected else word


def autocorrect_text(text: str) -> str:
    words = text.split()
    corrected_words = [maybe_correct_word(word) for word in words]
    return " ".join(corrected_words)


def normalize_text(text: str, confidence: float) -> str:
    # strip punctuation first
    text = strip_punctuation(text)

    # lowercase for consistency
    text = text.lower()

    # only autocorrect lower-confidence lines
    if confidence < 0.92:
        text = autocorrect_text(text)

    text = re.sub(r"\s+", " ", text).strip()
    return text


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/ocr")
async def run_ocr(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "upload.jpg")[1] or ".jpg"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        original_path = tmp.name
        tmp.write(await file.read())

    resized_path = None

    try:
        img = Image.open(original_path).convert("RGB")
        img.thumbnail((MAX_SIDE, MAX_SIDE))

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp2:
            resized_path = tmp2.name

        img.save(resized_path, format="JPEG", quality=85, optimize=True)

        result = ocr.predict(resized_path)

        items = []
        raw_lines = []

        if isinstance(result, list):
            for page in result:
                if isinstance(page, dict):
                    rec_texts = page.get("rec_texts", [])
                    rec_scores = page.get("rec_scores", [])

                    for i, raw_text in enumerate(rec_texts):
                        score = float(rec_scores[i]) if i < len(rec_scores) else 1.0

                        cleaned_raw = clean_raw_text(str(raw_text))
                        if not is_useful_text(cleaned_raw):
                            continue

                        done, done_text = detect_done(cleaned_raw)
                        if not is_useful_text(done_text):
                            continue

                        normalized = normalize_text(done_text, score)
                        if not is_useful_text(normalized):
                            continue

                        raw_lines.append(cleaned_raw)

                        items.append(
                            {
                                "lineNumber": len(items) + 1,
                                "rawText": cleaned_raw,
                                "text": normalized,
                                "done": done,
                                "confidence": round(score, 3),
                            }
                        )

        return {
            "title": "Uploaded Note",
            "lineCount": len(items),
            "rawLines": raw_lines,
            "items": items,
            "imageInfo": {
                "maxSide": MAX_SIDE,
            },
        }

    finally:
        if os.path.exists(original_path):
            os.remove(original_path)
        if resized_path and os.path.exists(resized_path):
            os.remove(resized_path)