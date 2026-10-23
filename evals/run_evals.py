"""Causal evals for the Voltra dataset.

Runs each question in evals/voltra_truth.yaml through the same agent the UI uses (Session.ask), saves the OpenUI
program and tool trace to evals/results/<timestamp>/, then grades every answer with Claude on Cortex against the
planted ground truth: right cause named, decoys ruled out, effect size in range.

    .venv/bin/python evals/run_evals.py            # all questions
    .venv/bin/python evals/run_evals.py --only 2   # one question by index
    .venv/bin/python evals/run_evals.py --grade evals/results/<ts>   # re-grade saved answers only
"""
import argparse
import json
import pathlib
import re
import sys
import time
import warnings

import yaml

warnings.filterwarnings("ignore")
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import agent  # noqa: E402

TRUTH = ROOT / "evals" / "voltra_truth.yaml"
RESULTS = ROOT / "evals" / "results"
JUDGE_MODEL = "claude-sonnet-5-5"

JUDGE_PROMPT = """You grade an analytics agent's answer against planted ground truth for a synthetic company.

Ground truth for this question (YAML):
{truth}

The agent's final answer (an OpenUI Lang dashboard program) and a summary of the tool calls it made:
<answer>
{answer}
</answer>
<tool_calls>
{calls}
</tool_calls>

Score three checks, each pass/fail:
- cause: the answer identifies the true cause as the cause (headline, Verdicts "cause", or insight), not just mentions it.
- decoys: every listed decoy is either explicitly ruled out / shown to have no effect, or not credited as a cause.
  Fail if any decoy is presented as a cause or contributor without evidence.
- effect: the reported effect size for the true cause is within the expected range (allow ±30% of the expected value
  if no explicit range is given). If the truth has no effect size, pass when the direction is right.

Reply with only a JSON object: {{"cause": true|false, "decoys": true|false, "effect": true|false, "notes": "<one sentence>"}}"""


def load_truth():
    data = yaml.safe_load(TRUTH.read_text())
    items = data.get("questions", data) if isinstance(data, dict) else data
    return [q for q in items if isinstance(q, dict) and q.get("question")]


def run_one(entry, out_dir, index):
    session = agent.Session("voltra")
    openui, calls, errors = "", [], []
    started = time.time()
    for ev in session.ask(entry["question"]):
        t = ev.get("type")
        if t == "text_delta":
            openui += ev["text"]
        elif t == "turn_end" and ev.get("stop_reason") == "tool_use":
            openui = ""  # text between tool calls is narration, not the final program
        elif t == "sql":
            calls.append({"tool": "sql_exec", "sql": ev["sql"][:1500]})
        elif t == "sql_result" and calls:
            calls[-1]["result"] = ev.get("error") or f"{len(ev.get('rows', []))} rows: {ev.get('rows', [])[:5]}"
        elif t == "tool":
            calls.append({"tool": ev["name"], "input": ev["input"]})
        elif t == "tool_result" and calls:
            calls[-1]["result"] = ev.get("preview", "")[:1500]
        elif t == "error":
            errors.append(ev["text"])
    record = {
        "index": index,
        "question": entry["question"],
        "seconds": round(time.time() - started, 1),
        "openui": openui.strip(),
        "calls": calls,
        "errors": errors,
    }
    (out_dir / f"q{index}.json").write_text(json.dumps(record, indent=2, default=str))
    return record


def grade(entry, record):
    calls = "\n".join(f"- {c['tool']}: {json.dumps(c.get('input') or c.get('sql'))[:400]} -> {str(c.get('result', ''))[:400]}" for c in record["calls"])
    prompt = JUDGE_PROMPT.format(truth=yaml.safe_dump(entry, sort_keys=False), answer=record["openui"][:24000], calls=calls[:16000])
    resp = agent.claude().messages.create(
        model=JUDGE_MODEL,
        max_tokens=2000,
        output_config={"effort": "low"},
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text")
    match = re.search(r"\{.*\}", text, re.S)
    try:
        return json.loads(match.group(0)) if match else {"cause": False, "decoys": False, "effect": False, "notes": f"unparseable judge reply: {text[:200]}"}
    except json.JSONDecodeError:
        return {"cause": False, "decoys": False, "effect": False, "notes": f"unparseable judge reply: {text[:200]}"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", type=int, help="run a single question by index")
    ap.add_argument("--grade", type=pathlib.Path, help="re-grade a saved results directory without re-running")
    args = ap.parse_args()

    truth = load_truth()
    picks = [(i, q) for i, q in enumerate(truth) if args.only is None or i == args.only]
    out_dir = args.grade or RESULTS / time.strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for i, entry in picks:
        if args.grade:
            path = out_dir / f"q{i}.json"
            if not path.exists():
                continue
            record = json.loads(path.read_text())
        else:
            print(f"[{i}] {entry['question']} …", flush=True)
            record = run_one(entry, out_dir, i)
        score = grade(entry, record)
        rows.append({"index": i, "question": entry["question"], "seconds": record["seconds"], **score})
        mark = lambda ok: "✓" if ok else "✗"  # noqa: E731
        print(f"    cause {mark(score.get('cause'))}  decoys {mark(score.get('decoys'))}  effect {mark(score.get('effect'))}  ({record['seconds']}s) {score.get('notes', '')}", flush=True)

    (out_dir / "scorecard.json").write_text(json.dumps(rows, indent=2))
    if rows:
        n = len(rows)
        causes = sum(bool(r.get("cause")) for r in rows)
        full = sum(bool(r.get("cause") and r.get("decoys") and r.get("effect")) for r in rows)
        print(f"\nScorecard: cause {causes}/{n} · all three checks {full}/{n} · results in {out_dir.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
