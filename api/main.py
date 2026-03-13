from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR
from PIL import Image
import tempfile
import os
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lighter English-only setup
ocr = PaddleOCR(
    lang="en",
    text_detection_model_name="PP-OCRv5_mobile_det",
    text_recognition_model_name="en_PP-OCRv5_mobile_rec",
)

MAX_SIDE = 1600


def clean_english_text(text: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9\s.,!?'\-:/()\[\]%+]", "", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


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
                        score = rec_scores[i] if i < len(rec_scores) else 1.0
                        cleaned = clean_english_text(str(raw_text))

                        if score < 0.70:
                            continue
                        if not is_useful_text(cleaned):
                            continue

                        done, final_text = detect_done(cleaned)
                        if not is_useful_text(final_text):
                            continue

                        raw_lines.append(final_text)
                        items.append(
                            {
                                "lineNumber": len(items) + 1,
                                "text": final_text,
                                "done": done,
                                "confidence": round(float(score), 3),
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
