#!/usr/bin/env python
# test_dreamo.py

import os
import torch
import numpy as np
from PIL import Image
from dreamo.dreamo_generator import Generator

def main():
    # ── 1) Instantiate the DreamO generator ──────────────────────────
    gen = Generator(
        version   = "v1.1",
        offload   = False,
        no_turbo  = False,
        quant     = "none",
        device    = "cuda",   # or "auto"
    )

    # ── 2) Load your test image from examples/input.png ──────────────
    here = os.path.dirname(__file__)
    img_path = os.path.join(here, "examples", "input.png")
    img = Image.open(img_path).convert("RGB")
    img_np = np.array(img)

    # ── 3) Pre-condition: single IP task, no second image ───────────
    ref_conds, debug_images, seed = gen.pre_condition(
        ref_images=[img_np, None],
        ref_tasks =["ip",    None],
        ref_res   =512,
        seed      ="-1",      # random seed
    )

    # ── 4) Run the actual DreamO pipeline ────────────────────────────
    output = gen.dreamo_pipeline(
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

    # ── 5) Save the generated image as out.png ────────────────────────
    out_path = os.path.join(here, "out.png")
    Image.fromarray(np.array(output)).save(out_path)
    print(f"✅ Done! Saved → {out_path}")

if __name__ == "__main__":
    main()