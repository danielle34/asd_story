# dreamo_fastapi.py
import io
import base64
import numpy as np
from PIL import Image
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

# Import the Gradio-backed generator and function
from app import generate_image, generator   # adjust the import path

router = APIRouter()

class DreamOOut(BaseModel):
    image: str       # data URI
    seed: int

@router.post("/dreamo", response_model=DreamOOut)
async def dreamo_endpoint(
    ref_image1: UploadFile = File(...),
    ref_image2: UploadFile = File(None),
    ref_task1: str       = Form("ip"),
    ref_task2: str       = Form("ip"),
    prompt: str          = Form(...),
    width: int           = Form(1024),
    height: int          = Form(1024),
    ref_res: int         = Form(512),
    num_steps: int       = Form(12),
    guidance: float      = Form(4.5),
    seed: int            = Form(-1),
    true_cfg: float      = Form(1.0),
    cfg_start_step: int  = Form(0),
    cfg_end_step: int    = Form(0),
    neg_prompt: str      = Form(""),
    neg_guidance: float  = Form(3.5),
    first_step_guidance: float = Form(0.0),
):
    def to_np_array(upload: UploadFile):
        try:
            data = upload.file.read()
            pil = Image.open(io.BytesIO(data)).convert("RGB")
            return np.array(pil)
        except Exception as e:
            raise HTTPException(400, f"Could not read image: {e}")

    img1 = to_np_array(ref_image1)
    img2 = to_np_array(ref_image2) if ref_image2 else None

    # Call the Gradio-style function
    out_img, debug_imgs, used_seed = generate_image(
        img1, img2,
        ref_task1, ref_task2,
        prompt, width, height, ref_res,
        num_steps, guidance, seed,
        true_cfg, cfg_start_step, cfg_end_step,
        neg_prompt, neg_guidance, first_step_guidance,
    )

    # Serialize the PIL output to base64 PNG
    buf = io.BytesIO()
    out_img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()

    return {
        "image": f"data:image/png;base64,{b64}",
        "seed":  used_seed
    }