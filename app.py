"""FastAPI server: streams agent progress to the browser over Server-Sent Events."""
import json
import logging
import uuid

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from agent import DATASETS, DEFAULT_DATASET, MODEL, Session, dataset_stats, datasets_config

app = FastAPI(title="Sherlock: release forensics on Snowflake")
sessions: dict[str, Session] = {}
WEB_DIST = Path(__file__).parent / "web" / "dist"  # built by `npm run build` in web/


class Ask(BaseModel):
    question: str
    session_id: str | None = None
    dataset: str = DEFAULT_DATASET


@app.get("/")
def index():
    return FileResponse(WEB_DIST / "index.html")


@app.get("/figure.html")
def figure():
    return FileResponse(WEB_DIST / "figure.html")


@app.get("/api/config")
def config():
    return {"model": MODEL, "default_dataset": DEFAULT_DATASET, "datasets": datasets_config()}


@app.get("/api/stats")
def stats(dataset: str = DEFAULT_DATASET):
    try:
        data = dataset_stats(dataset)
    except Exception as e:  # tables not loaded yet
        return {"counts": [], "events": [], "error": str(e)[:200]}
    return data or {"counts": [], "events": []}


@app.post("/api/ask")
def ask(req: Ask):
    dataset = req.dataset if req.dataset in DATASETS else DEFAULT_DATASET
    sid = req.session_id or uuid.uuid4().hex
    session = sessions.get(sid)
    if session is None or session.dataset != dataset:  # switching dataset starts a fresh conversation
        session = sessions[sid] = Session(dataset)

    def stream():
        yield f"data: {json.dumps({'type': 'session', 'session_id': sid})}\n\n"
        checkpoint = len(session.messages)
        try:
            for event in session.ask(req.question):
                yield f"data: {json.dumps(event, default=str)}\n\n"
        except Exception as e:
            logging.getLogger("sherlock").exception("ask failed: %s", req.question)
            del session.messages[checkpoint:]  # drop the failed turn so the conversation stays valid
            yield f"data: {json.dumps({'type': 'error', 'text': f'{type(e).__name__}: {e}'[:600]})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


if (WEB_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")
