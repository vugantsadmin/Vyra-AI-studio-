---
title: VYRA AI Studio Free Video Engine
emoji: 🎬
colorFrom: lime
colorTo: gray
sdk: gradio
sdk_version: 5.20.1
app_file: app.py
pinned: false
---
# VYRA AI Studio — free-first video engine

This Space is a prototype backend for VYRA's Text-to-Video and Image-to-Video workflows.

## Deploy on Hugging Face

1. Create a Hugging Face account and verify your email.
2. Create a new Space at https://huggingface.co/new-space.
3. Select Gradio as the SDK.
4. Select ZeroGPU hardware if it is offered to your account. Do not select paid GPU hardware.
5. Upload app.py, requirements.txt, and this README from this folder into the Space root.
6. Wait for the Space to build. The first generation may take longer because model weights must download.
7. Copy the Space URL. The web frontend still needs its Gradio API adapter configured to use this URL.

## Models

- Text-to-Video: zai-org/CogVideoX-2b (Apache-2.0 model card).
- Image-to-Video: THUDM/CogVideoX-5b-I2V (check the model card and current usage terms before public launch).

## Important free-tier limits

Hugging Face ZeroGPU is shared, quota-limited compute. Free usage is limited to a few GPU-minutes per day, and queues/runtime limits can prevent a video from finishing. This does not provide unlimited or guaranteed free generation. Never select paid hardware if you need a strict ₹0 budget.

The demo intentionally generates short, low-step previews to reduce compute. The actual generated duration can vary with model output and runtime. This backend is not production-ready: it lacks authentication, abuse prevention, persistent job storage, and robust video retention.

## Privacy

Prompts and uploaded images are sent to the Space for processing. Do not upload sensitive content. Generated files may be temporary. The public Space code is visible to everyone.
