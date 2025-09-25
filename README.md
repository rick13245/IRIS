# IRIS — Architecture Overview

This document explains how the system is structured and how data flows through it.

## Overview
ITMS‑IRIS is a desktop application with supporting microservices for integrated track monitoring. It ingests sensor data, fuses multi‑source inputs, computes KPIs/alerts, and provides an operator‑friendly UI.

## Components
- Desktop UI (Electron + Vite + React)
  - Presents dashboards, charts, overlays, and investigation tools
  - Connects to services via WebSocket/HTTP
  - Key files: `src/ui/App.tsx`, `src/ui/ws.ts`, `src/ui/ai.ts`
- Electron Main & Preload
  - Main: app bootstrap, window lifecycle
  - Preload: safe bridge exposing limited APIs to the renderer
  - Files: `electron/main.cts`, `electron/preload.cjs`
- Backend Microservices (Python)
  - `services/lidar/`: Sensor ingestion and normalization
  - `services/fusion/`: Multi‑source correlation, track continuity, event synthesis
  - `services/aggregator/`: KPI/alert computation and summary endpoints/streams
- Orchestration (optional)
  - `docker-compose.yml` to run services together
- Build Artifacts & Logs
  - Frontend builds in `dist/`; Electron artifacts in `dist-electron/`
  - Runtime logs in `logs/`

## Data Flow
1) Sensors emit raw data (e.g., LiDAR point clouds, telemetry)
2) `lidar` normalizes frames/messages
3) `fusion` correlates multi‑source inputs into tracks/events
4) `aggregator` computes KPIs, health metrics, and alerts
5) Desktop UI subscribes (WebSocket/HTTP) and renders live views

[Sensors] → [lidar] → [fusion] → [aggregator] → [WebSocket/HTTP] → [Desktop UI]

## Communication Patterns
- Service ↔ Service: internal messaging/HTTP inside `services/`
- Services → UI: WebSocket for live updates; HTTP for queries
- UI: React state/derived selectors; optional AI helpers for context

## Responsibilities
- UI: Presentation, operator workflows, interactive analysis
- Electron: Window/process lifecycle, secure preload bridge
- lidar: Adapters, normalization, basic filtering
- fusion: Correlation across sources, track/event synthesis
- aggregator: KPI rollups, thresholds, alerting, summary APIs

## Observability & Resilience
- Independent service restarts; fail‑fast per component
- Health/status surfaced to the UI
- Persistent logs in `logs/` for analysis

## Repository Structure (selected)
- `src/` — Frontend (TypeScript/React)
- `electron/` — Electron main and preload
- `services/` — `lidar/`, `fusion`, `aggregator`
- `dist/`, `dist-electron/` — Build outputs
- `logs/` — Runtime logs

## Extensibility
- Add new sensor adapters under `services/`
- Extend fusion heuristics for new track/event logic
- Add KPIs/alerts in `aggregator/` with UI bindings in `src/ui/`
