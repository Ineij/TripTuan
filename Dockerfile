# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:18-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# VITE_API_BASE 不设 = 空字符串 = 相对路径，与后端同源
RUN npm run build

# ── Stage 2: Python runtime ───────────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

# Install Python deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend into the location backend/main.py expects
COPY --from=frontend-builder /frontend/dist ./frontend/dist

# Ensure runtime-writable dirs exist
RUN mkdir -p backend/static/generated/pois \
             backend/static/generated/transport \
             backend/data

EXPOSE 8000

# PORT is injected by Railway / Render; default to 8000 locally
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
