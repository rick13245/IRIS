from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import ORJSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio, json, random, time

app = FastAPI(default_response_class=ORJSONResponse)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Hub:
    def __init__(self):
        self.clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.clients.add(ws)

    def remove(self, ws: WebSocket):
        self.clients.discard(ws)

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.clients:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(ws)
        for d in dead:
            self.remove(d)

hub = Hub()

@app.get("/health")
async def health():
    return {"ok": True}

@app.websocket("/ws")
async def ws(ws: WebSocket):
    await hub.connect(ws)
    try:
        while True:
            # keepalive
            await asyncio.sleep(30)
    except WebSocketDisconnect:
        hub.remove(ws)


async def mock_streams():
    t0 = time.time()
    while True:
        now = time.time() - t0
        payload = {
            "type": "telemetry",
            "speed_kmph": 80 + 10 * (random.random() - 0.5),
            "imu": {
                "ax": random.uniform(-0.5, 0.5),
                "ay": random.uniform(-0.5, 0.5),
                "az": random.uniform(0.8, 1.2)
            },
            "gps": {"lat": 22.57 + random.random()*1e-4, "lon": 88.36 + random.random()*1e-4},
            "chainage_m": int(now * 20)
        }
        await hub.broadcast(payload)

        # occasional defect
        if random.random() < 0.05:
            defect = {
                "type": "defect",
                "class": random.choice(["crack", "squats", "loose_fastener", "insulation"]),
                "severity": random.choice(["low", "medium", "high"]),
                "gps": payload["gps"],
                "chainage_m": payload["chainage_m"],
                "snapshot_url": None
            }
            await hub.broadcast(defect)

        await asyncio.sleep(0.25)


@app.on_event("startup")
async def _startup():
    asyncio.create_task(mock_streams())


