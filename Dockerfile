# ---------- Stage 1: frontend build ----------
FROM node:22-slim AS frontend-build

WORKDIR /build/frontend

COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --ignore-engines

COPY frontend/ ./

# Web build: REACT_APP_BACKEND_URL is intentionally empty — every consumer
# concatenates `${BACKEND_URL}/api/...`, so an empty string yields same-origin
# relative URLs that work on data.audix.co.in and *.up.railway.app alike.
ARG REACT_APP_BACKEND_URL=""
ARG REACT_APP_APP_TARGET=web
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL \
    REACT_APP_APP_TARGET=$REACT_APP_APP_TARGET \
    CI=false \
    DISABLE_ESLINT_PLUGIN=true \
    GENERATE_SOURCEMAP=false
RUN yarn build

# ---------- Stage 2: runtime ----------
FROM python:3.11-slim

WORKDIR /srv/app/backend

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
# server.py resolves the SPA at ../frontend/build relative to itself
COPY --from=frontend-build /build/frontend/build /srv/app/frontend/build

# Shell form so Railway's injected $PORT expands; no default on purpose.
CMD uvicorn server:app --host 0.0.0.0 --port $PORT
