from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import io
import base64
import numpy as np
import cv2
import torch
from PIL import Image
import os
import sys

app = FastAPI()

# Allow frontend to connect (adjust origins if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # your React app
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#
# ─── DreamO SETUP ────────────────────────────────────────────────
#

# 0) Make sure we can import DreamO
HERE = os.path.dirname(__file__)
DREAMO_ROOT = os.path.join(HERE, "dreamo")      # your symlinked DreamO folder
if not os.path.isdir(DREAMO_ROOT):
    raise RuntimeError(f"Cannot find DreamO at {DREAMO_ROOT}")
sys.path.insert(0, DREAMO_ROOT)

from dreamo_generator import Generator

# 1) Instantiate your DreamO generator exactly once
generator = Generator(
    version   = "v1.1",
    offload   = False,
    no_turbo  = False,
    quant     = "none",
    device    = "cuda",  # or "auto"
)

def _read_image(upload: UploadFile) -> np.ndarray:
    """Helper: read UploadFile into RGB numpy array."""
    data = upload.file.read()
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail=f"Invalid image file {upload.filename}")
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


#
# ─── even qa ─────────────────────────────────
#
from transformers import pipeline

# Load QA model once
qa_pipe = pipeline(
    "question-answering",
    model="veronica320/QA-for-Event-Extraction"
)


#
# ─── Existing Face‐Crop Endpoint ─────────────────────────────────
#
@app.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image"})
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.1, 5)
    cropped = []
    for (x, y, w, h) in faces:
        face = img[y : y + h, x : x + w]
        _, buf = cv2.imencode(".jpg", face)
        cropped.append(base64.b64encode(buf).decode("utf-8"))
    return JSONResponse({
        "filename": file.filename,
        "num_faces": len(faces),
        "faces":    cropped,
    })

@app.post("/generate-image")
async def generate_image(
    ref_image1: UploadFile           = File(...),
    ref_image2: Optional[UploadFile] = File(None),
    ref_task1: str                   = Form("ip"),
    ref_task2: str                   = Form("ip"),
    prompt: str                      = Form(...),
    ref_res: int                     = Form(512),
    seed: str                        = Form("-1"),
    guidance_scale: float            = Form(4.5),
    num_inference_steps: int         = Form(12),
    true_cfg_scale: float            = Form(1.0),
    true_cfg_start_step: int         = Form(0),
    true_cfg_end_step: int           = Form(0),
    negative_prompt: str             = Form(""),
    neg_guidance_scale: float        = Form(3.5),
    first_step_guidance_scale: float = Form(4.5),
):
    # 1. Read input images
    img1 = _read_image(ref_image1)
    img2 = _read_image(ref_image2) if ref_image2 else None

    # 2. Pre-condition
    ref_conds, debug_imgs, seed = generator.pre_condition(
        ref_images=[img1, img2],
        ref_tasks =[ref_task1, ref_task2],
        ref_res   = ref_res,
        seed      = seed,
    )

    # 3. Run generation
    out = generator.dreamo_pipeline(
        prompt                      = prompt,
        width                       = ref_res,
        height                      = ref_res,
        num_inference_steps         = num_inference_steps,
        guidance_scale              = guidance_scale,
        ref_conds                   = ref_conds,
        generator                   = torch.Generator(device="cpu").manual_seed(seed),
        true_cfg_scale              = true_cfg_scale,
        true_cfg_start_step         = true_cfg_start_step,
        true_cfg_end_step           = true_cfg_end_step,
        negative_prompt             = negative_prompt,
        neg_guidance_scale          = neg_guidance_scale,
        first_step_guidance_scale   = first_step_guidance_scale,
    ).images[0]

    # 4. Encode to base64
    buf = io.BytesIO()
    Image.fromarray(np.array(out)).save(buf, format="PNG")
    img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return JSONResponse({
        "image": img_b64,
        "seed":  seed,
    })

from pydantic import BaseModel

class QARequest(BaseModel):
    question: str
    context: str

@app.post("/ask-question")
async def ask_question(payload: QARequest):
    try:
        result = qa_pipe(question=payload.question, context=payload.context)
        return {"answer": result["answer"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))