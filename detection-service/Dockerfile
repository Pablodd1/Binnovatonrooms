FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV
RUN apt-get update && apt install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY main.py .

# Create models dir (used if you want to vendor .pt files later)
RUN mkdir -p /app/models

EXPOSE 8000

# Single worker — Render free tier has 512MB RAM; multiple workers would OOM.
# Upgrade to Starter ($7/mo, 2GB RAM) if you need concurrency.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
