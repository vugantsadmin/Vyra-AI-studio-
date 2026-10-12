import gc
import os
import tempfile
from pathlib import Path

import gradio as gr
import spaces
import torch
from diffusers import CogVideoXPipeline, CogVideoXImageToVideoPipeline
from diffusers.utils import export_to_video
from PIL import Image

# Free-first demo backend. Model weights are downloaded from Hugging Face.
# ZeroGPU has limited daily quota and generation may time out on free accounts.
TEXT_MODEL = os.getenv("VYRA_TEXT_MODEL", "zai-org/CogVideoX-2b")
IMAGE_MODEL = os.getenv("VYRA_IMAGE_MODEL", "THUDM/CogVideoX-5b-I2V")
OUTPUT_DIR = Path(tempfile.gettempdir()) / "vyra_outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _generate(prompt: str, mode: str, image: Image.Image | None, duration: int, style: str):
    prompt = (prompt or "").strip()
    if not prompt:
        raise gr.Error("Write a prompt first.")
    if mode == "Image-to-Video" and image is None:
        raise gr.Error("Upload a starting image for Image-to-Video.")

    style_prefix = {
        "Cinematic": "cinematic lighting, smooth camera movement, detailed composition",
        "Photorealistic": "photorealistic, natural lighting, realistic motion",
        "Anime": "high-quality anime style, expressive motion, detailed animation",
        "3D Animation": "high-quality 3D animation, detailed materials, smooth motion",
        "Dreamlike": "dreamlike atmosphere, surreal visual poetry, soft cinematic lighting",
    }.get(style, "")
    full_prompt = f"{prompt}. {style_prefix}".strip()

    # CogVideoX works best with frame counts aligned to its temporal compression.
    seconds = max(3, min(6, int(duration)))
    frames = min(49, max(13, ((seconds * 8 - 1) // 4) * 4 + 1))
    output_path = OUTPUT_DIR / f"vyra_{os.urandom(6).hex()}.mp4"
    pipe = None
    try:
        if mode == "Image-to-Video":
            pipe = CogVideoXImageToVideoPipeline.from_pretrained(
                IMAGE_MODEL, torch_dtype=torch.bfloat16
            )
            pipe.to("cuda")
            pipe.vae.enable_tiling()
            pipe.vae.enable_slicing()
            result = pipe(
                prompt=full_prompt,
                image=image.convert("RGB").resize((720, 480)),
                num_frames=frames,
                num_inference_steps=10,
                guidance_scale=6,
                generator=torch.Generator(device="cuda").manual_seed(42),
            )
        else:
            pipe = CogVideoXPipeline.from_pretrained(
                TEXT_MODEL, torch_dtype=torch.float16
            )
            pipe.to("cuda")
            pipe.vae.enable_tiling()
            result = pipe(
                prompt=full_prompt,
                num_frames=frames,
                num_inference_steps=10,
                guidance_scale=6,
                generator=torch.Generator(device="cuda").manual_seed(42),
            )
        export_to_video(result.frames[0], str(output_path), fps=8)
        return str(output_path), (
            f"Generated a short preview ({frames} frames at 8 fps). "
            "Free GPU quota and model queue limits apply."
        )
    except Exception as exc:
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        raise gr.Error(
            "Generation failed or exceeded the free GPU runtime. "
            "Try a shorter prompt, try again later, or check the Space logs. "
            f"Details: {type(exc).__name__}: {str(exc)[:220]}"
        ) from exc
    finally:
        if pipe is not None:
            del pipe
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


@spaces.GPU(duration=120)
def generate_video(prompt, mode, image, duration, style):
    return _generate(prompt, mode, image, duration, style)


with gr.Blocks(title="VYRA AI Studio · Free Video Engine") as demo:
    gr.Markdown(
        "# VYRA AI Studio — Free Video Engine\n"
        "Open-source CogVideoX models on Hugging Face ZeroGPU. "
        "Free usage is limited; this is a prototype, not unlimited hosting."
    )
    with gr.Row():
        with gr.Column():
            prompt = gr.Textbox(label="Prompt", lines=4, max_lines=8, placeholder="Describe the scene and motion…")
            mode = gr.Radio(["Text-to-Video", "Image-to-Video"], value="Text-to-Video", label="Generation mode")
            image = gr.Image(type="pil", label="Starting image (required for Image-to-Video)")
            duration = gr.Slider(3, 6, value=3, step=1, label="Approximate duration (seconds)")
            style = gr.Dropdown(
                ["Cinematic", "Photorealistic", "Anime", "3D Animation", "Dreamlike"],
                value="Cinematic",
                label="Visual style",
            )
            submit = gr.Button("Generate video", variant="primary")
        with gr.Column():
            video = gr.Video(label="Generated preview")
            status = gr.Textbox(label="Status", interactive=False)
    submit.click(
        fn=generate_video,
        inputs=[prompt, mode, image, duration, style],
        outputs=[video, status],
        api_name="generate_video",
    )
    gr.Markdown(
        "Privacy note: the prompt and optional image are sent to this Space for generation. "
        "Do not upload sensitive/private images. Output files may be temporary."
    )

demo.queue(default_concurrency_limit=1)
demo.launch()
