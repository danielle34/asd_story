#!/usr/bin/env python
# test_dreamo_simple.py

import os
import sys

# ── 0) Make sure Python can see the DreamO code ────────────────
# Assumes you have a symlink or folder at backend/dreamo → /home/morayo/orcd/pool/DreamO
HERE = os.path.dirname(__file__)
DREAMO_ROOT = os.path.join(HERE, "dreamo")
if not os.path.isdir(DREAMO_ROOT):
    raise RuntimeError(f"Cannot find your DreamO code at {DREAMO_ROOT}")
# Prepend so that `import tools` and others resolve to dreamo/tools.py, dreamo/dreamo_pipeline.py, etc.
sys.path.insert(0, DREAMO_ROOT)

import torch
import numpy as np
from PIL import Image

# This now picks up dreamo_generator.py from that folder
from dreamo_generator import Generator  

def main():
    # ── 1) Instantiate the generator ───────────────────────────────
    gen = Generator(
        version   = "v1.1",
        offload   = False,
        no_turbo  = False,
        quant     = "none",
        device    = "cuda",   # or "auto"
    )

    # ── 2) Load your test image (make sure examples/input.png exists) ─
    img_path = os.path.join(HERE, "examples", "input.png")
    if not os.path.isfile(img_path):
        raise FileNotFoundError(f"Put your test image at {img_path}")
    img = Image.open(img_path).convert("RGB")
    img_np = np.array(img)

    # ── 3) Pre-condition: single IP task, no second ref image ───────
    ref_conds, debug_images, seed = gen.pre_condition(
        ref_images=[img_np, None],
        ref_tasks = ["ip",   None],
        ref_res   = 512,
        seed      = "-1",     # random
    )

    # ── 4) Run the DreamO pipeline ────────────────────────────────
    out = gen.dreamo_pipeline(
        prompt                     = "a person playing guitar in the street",
        width                      = 512,
        height                     = 512,
        num_inference_steps        = 12,
        guidance_scale             = 4.5,
        ref_conds                  = ref_conds,
        generator                  = torch.Generator(device="cpu").manual_seed(seed),
        true_cfg_scale             = 1.0,
        true_cfg_start_step        = 0,
        true_cfg_end_step          = 0,
        negative_prompt            = "",
        neg_guidance_scale         = 3.5,
        first_step_guidance_scale  = 4.5,
    ).images[0]

    # ── 5) Save the result ────────────────────────────────────────
    out_path = os.path.join(HERE, "out.png")
    Image.fromarray(np.array(out)).save(out_path)
    print(f"✅ Done!  Saved → {out_path}")

if __name__ == "__main__":
    main()