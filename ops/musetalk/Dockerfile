# MuseTalk's MMLab extensions target torch 2.0 / CUDA 11.8, so use the
# matching NVIDIA runtime instead of replacing a newer Runpod torch stack.
FROM nvidia/cuda@sha256:f6913f3c02f297877f6859d12ff330043c0be668fdad86868c29a239a5a82151
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/opt/MuseTalk:/opt/MuseTalk/musetalk/utils \
    HF_HOME=/opt/hf-cache MUSETALK_ROOT=/opt/MuseTalk
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev build-essential git ca-certificates ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install 'pip==24.0' 'setuptools==69.5.1' 'wheel==0.43.0' \
    && python3 -m pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 \
       --index-url https://download.pytorch.org/whl/cu118 \
    && python3 -m pip install numpy==1.23.5 \
    && python3 -m pip install mmcv==2.0.1 --only-binary=mmcv \
       -f https://download.openmmlab.com/mmcv/dist/cu118/torch2.0/index.html
ARG MUSETALK_REVISION=0a89dec45a0192b824e3cf4daf96c239440c5ed8
RUN git clone https://github.com/TMElyralab/MuseTalk.git /opt/MuseTalk \
    && git -C /opt/MuseTalk checkout "$MUSETALK_REVISION" \
    && rm -rf /opt/MuseTalk/.git
COPY requirements.txt /opt/worker/requirements.txt
RUN python3 -m pip install --no-build-isolation -r /opt/worker/requirements.txt \
    && python3 -m pip check
RUN python3 -m pip freeze > /opt/worker/installed-requirements.lock
# Fixed, public models are baked once; replacements do not download them during a job.
# No account keys or private .env files are copied into this build context.
COPY download_models.py /opt/worker/download_models.py
WORKDIR /opt/MuseTalk
RUN python3 /opt/worker/download_models.py
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
COPY worker.py /opt/worker/worker.py
CMD ["python3", "-u", "/opt/worker/worker.py"]
