# test_dreamo.py
import torch
import numpy as np
from PIL import Image
from dreamo.dreamo_generator import Generator

def main():
    # 1) Instantiate the Generator
    gen = Generator(
        version   = "v1.1",
        offload   = False,
        no_turbo  = False,
        quant     = "none",
        device    = "cuda",   # or "auto"
    )

    # 2) Load your test image
    img = Image.open("backend/test_img.webp").convert("RGB")
    img_np = np.array(img)

    # 3) Pre-condition: here we do a single IP task, no second image
    ref_conds, debug_images, seed = gen.pre_condition(
        ref_images=[img_np, None],
        ref_tasks =["ip",    None],
        ref_res   =512,
        seed      ="-1",      # random
    )

    # 4) Run the pipeline
    output = gen.dreamo_pipeline(
        prompt                = "a person playing guitar in the street",
        width                 = 512,
        height                = 512,
        num_inference_steps   = 12,
        guidance_scale        = 4.5,
        ref_conds             = ref_conds,
        generator             = torch.Generator(device="cpu").manual_seed(seed),
        true_cfg_scale        = 1.0,
        true_cfg_start_step   = 0,
        true_cfg_end_step     = 0,
        negative_prompt       = "",
        neg_guidance_scale    = 3.5,
        first_step_guidance_scale = 4.5,
    ).images[0]

    # 5) Save the result
    Image.fromarray(np.array(output)).save("out.png")
    print("YAYYYYY Done!  Saved → out.png")

if __name__ == "__main__":
    main()