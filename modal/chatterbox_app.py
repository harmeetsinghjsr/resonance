"""Your own Chatterbox TTS service on Modal.

Serves the same contract as the shared endpoint the app was built against, so
switching to it is only a change to CHATTERBOX_API_URL — no frontend or tRPC
changes:

    POST /generate
      header  x-api-key: <CHATTERBOX_API_KEY>
      body    {prompt, voice_key, temperature, top_p, top_k,
               repetition_penalty, norm_loudness}
      200     audio/wav bytes

`voice_key` is an R2 object key. Unlike the shared service, this one reads the
key from *your* R2 bucket, so run scripts/seed-system-voices.ts (which uploads
the clips captured by scripts/capture-system-voice-audio.mjs) before using it.

One-time setup
--------------
    pip install modal
    modal token new                      # sign in / create account

    # Both secrets are read at deploy time; values are whatever your .env has.
    modal secret create resonance-r2 \
      R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... \
      R2_SECRET_ACCESS_KEY=... R2_BUCKET_NAME=resonance

    # Generate a long random key, e.g. `openssl rand -hex 32`. The service
    # refuses to start without one. Use the same value as the app's
    # CHATTERBOX_API_KEY.
    modal secret create chatterbox-api \
      CHATTERBOX_API_KEY=<paste-a-long-random-key>

Deploy
------
    modal deploy modal/chatterbox_app.py

It prints the endpoint URL. Put that in your .env / Vercel env as
CHATTERBOX_API_URL, and redeploy the app.

Cost note: Modal's free credit does not cover GPU time, so this needs a payment
method on the Modal account. gpu="T4" is the cheapest tier that comfortably runs
Chatterbox (~0.5B params). Switch to "L4" or "A10G" if you want faster
generation, and lower `scaledown_window` to pay less idle time.
"""

import hmac
import inspect
import io
import os
from pathlib import Path

import boto3
import modal
from botocore.exceptions import ClientError
from fastapi import FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, Field

APP_NAME = "resonance-chatterbox"
HF_CACHE = "/hf-cache"
VOICE_CACHE = Path("/tmp/voices")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        # Pins torch==2.6.0 / torchaudio==2.6.0 on Python < 3.14.
        "chatterbox-tts==0.1.7",
        "fastapi[standard]",
        "boto3",
    )
    # Saved between cold starts, so the model weights download once.
    .env({"HF_HOME": HF_CACHE})
)

hf_cache_volume = modal.Volume.from_name("chatterbox-hf-cache", create_if_missing=True)

app = modal.App(APP_NAME)


# voices/system/<voiceId>  or  voices/orgs/<orgId>/<voiceId>
VOICE_KEY_PATTERN = r"^voices/(system/[A-Za-z0-9_-]+|orgs/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+)$"


class TTSRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=5000)
    # Only the key shapes the app writes (see src/lib and the seed script), so a
    # caller can't point this service at arbitrary objects in the bucket, e.g.
    # generated audio under generations/.
    voice_key: str = Field(
        min_length=1, max_length=300, pattern=VOICE_KEY_PATTERN
    )
    temperature: float = Field(default=0.8, ge=0.0, le=2.0)
    top_p: float = Field(default=0.95, ge=0.0, le=1.0)
    top_k: int = Field(default=1000, ge=1, le=10000)
    repetition_penalty: float = Field(default=1.2, ge=1.0, le=2.0)
    norm_loudness: bool = True


def _r2_client():
    return boto3.client(
        "s3",
        region_name="auto",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    )


def _local_voice_file(voice_key: str) -> str:
    """Download an R2 voice key to disk once per container, and return its path."""
    VOICE_CACHE.mkdir(parents=True, exist_ok=True)
    dest = VOICE_CACHE / voice_key.replace("/", "_")

    if not dest.exists():
        try:
            _r2_client().download_file(
                os.environ["R2_BUCKET_NAME"], voice_key, str(dest)
            )
        except ClientError as e:
            raise HTTPException(
                status_code=400, detail=f"Voice not found at '{voice_key}'"
            ) from e

    return str(dest)


def _run_generate(model, req: TTSRequest, audio_prompt_path: str):
    """Call generate() with only the arguments the installed signature accepts.

    The published Chatterbox model has no `top_k`; the shared service supports it
    in its own sampler. Parameters the model does not accept are dropped rather
    than failing the request.
    """
    import torch

    accepted = inspect.signature(model.generate).parameters
    kwargs = {
        "temperature": req.temperature,
        "top_p": req.top_p,
        "top_k": req.top_k,
        "repetition_penalty": req.repetition_penalty,
    }
    kwargs = {k: v for k, v in kwargs.items() if k in accepted}
    if "audio_prompt_path" in accepted:
        kwargs["audio_prompt_path"] = audio_prompt_path

    with torch.inference_mode():
        return model.generate(req.prompt, **kwargs)


def _make_loudness_meter(model, sr: int):
    """A meter for LUFS normalization, or None if the model handles it itself."""
    if "norm_loudness" in inspect.signature(model.generate).parameters:
        return None
    try:
        from pyloudnorm import Meter
    except ImportError:
        return None
    return Meter(sr, block_size=0.4)


def _normalize_loudness(wav, meter, target_lufs: float = -27.0):
    import numpy as np
    import pyloudnorm
    import torch

    audio = wav.squeeze(0).detach().cpu().numpy()
    loudness = meter.integrated_loudness(audio)
    normalized = pyloudnorm.normalize.loudness(audio, loudness, target_lufs)
    return torch.from_numpy(np.asarray(normalized, dtype=np.float32)).unsqueeze(0)


def build_app(model, sr: int) -> FastAPI:
    import torchaudio as ta

    api = FastAPI(title="Resonance Chatterbox TTS API")
    expected_key = os.environ.get("CHATTERBOX_API_KEY", "")
    if not expected_key:
        # Fail closed: never serve an unauthenticated GPU endpoint.
        raise RuntimeError(
            "CHATTERBOX_API_KEY is not set; refusing to start without an API key"
        )
    expected_key_bytes = expected_key.encode("utf-8")
    loudness_meter = _make_loudness_meter(model, sr)

    @api.post("/generate")
    def generate(req: TTSRequest, x_api_key: str = Header(default="")) -> Response:
        # Constant-time comparison to avoid leaking the key via timing.
        if not hmac.compare_digest(x_api_key.encode("utf-8"), expected_key_bytes):
            raise HTTPException(status_code=401, detail="Invalid API key")

        wav = _run_generate(model, req, _local_voice_file(req.voice_key))

        if req.norm_loudness and loudness_meter is not None:
            wav = _normalize_loudness(wav, loudness_meter)

        buffer = io.BytesIO()
        ta.save(buffer, wav, sr, format="wav")
        return Response(content=buffer.getvalue(), media_type="audio/wav")

    return api


@app.function(
    image=image,
    gpu="T4",
    timeout=900,
    scaledown_window=300,
    volumes={HF_CACHE: hf_cache_volume},
    secrets=[
        modal.Secret.from_name("resonance-r2"),
        modal.Secret.from_name("chatterbox-api"),
    ],
)
@modal.asgi_app()
def web():
    from chatterbox.tts import ChatterboxTTS

    model = ChatterboxTTS.from_pretrained(device="cuda")
    # Committing after a first-time download keeps the volume warm for the next
    # cold start.
    hf_cache_volume.commit()

    return build_app(model, model.sr)
