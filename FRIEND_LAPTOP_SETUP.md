# Setup Instructions for Friend's Laptop

## What Your Friend Needs to Run

Your friend needs to run the **laptop worker** on their laptop. This will:
- Generate embeddings using their GPU
- Perform vector search
- Speed up the overall system

## Step-by-Step Setup

### 1. Install Python (if not already installed)
- Download from: https://www.python.org/downloads/
- Make sure to check "Add Python to PATH" during installation

### 2. Clone/Copy the Project
Your friend needs these files:
- `laptop_worker.py`
- `requirements.txt`

### 3. Install Dependencies
Open terminal/command prompt in the project folder and run:

```bash
pip install -r requirements.txt
```

**Note:** This will install PyTorch and sentence-transformers which are large (~2GB). Make sure they have:
- Good internet connection
- Enough disk space
- GPU drivers installed (if they have NVIDIA GPU)

### 4. Run the Laptop Worker
```bash
python laptop_worker.py
```

You should see:
- Device detection (CPU or CUDA/GPU)
- Model loading progress
- Server starting on port 8000

### 5. Start ngrok
In a **separate terminal**, run:
```bash
ngrok http 8000
```

**Important:** 
- Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)
- Send this URL to you
- Keep both terminals running!

## What You Need to Do

1. Get your friend's ngrok URL
2. Add it to your Gradio UI in the "Laptop URLs" field:
   ```
   https://your-ngrok-url.ngrok.io, https://friend-ngrok-url.ngrok.io
   ```
3. Upload document - it will automatically split work between both laptops!

## Troubleshooting

**"CUDA not available"** - That's okay! It will use CPU (slower but works)

**"Model download failed"** - Check internet connection, try again

**"Port 8000 already in use"** - Change port in `laptop_worker.py` (line 257) to 8001, and use `ngrok http 8001`

**"ngrok not found"** - Install ngrok from: https://ngrok.com/download

## Quick Test

Once running, test the laptop worker:
```bash
curl http://localhost:8000/health
```

Should return JSON with status "online"

