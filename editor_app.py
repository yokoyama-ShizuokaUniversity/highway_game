from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

import json
from pathlib import Path
from typing import Dict, List

from flask import Flask, jsonify, render_template, request

DATA_PATH = Path(__file__).parent / "data" / "highways.json"

editor_app = Flask(__name__)


def load_payload() -> Dict:
    if DATA_PATH.exists():
        with DATA_PATH.open(encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return {"highways": []}
    return {"highways": []}


def save_payload(payload: Dict) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = DATA_PATH.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(DATA_PATH)


@editor_app.route("/")
def editor_home():
    return render_template("editor.html")


@editor_app.post("/api/highways")
def save_highway():
    data = request.get_json(silent=True) or {}
    required_fields = ("id", "name", "nodes")
    if not all(field in data for field in required_fields):
        return jsonify({"error": "id, name, nodes are required"}), 400
    if not isinstance(data.get("nodes"), list) or not data["nodes"]:
        return jsonify({"error": "nodes must be a non-empty list"}), 400

    payload = load_payload()
    highways: List[Dict] = list(payload.get("highways", []))
    existing_ids = [hw.get("id") for hw in highways]

    if data["id"] in existing_ids:
        highways = [hw if hw.get("id") != data["id"] else data for hw in highways]
    else:
        highways.append(data)

    payload["highways"] = highways
    save_payload(payload)
    return jsonify({"status": "saved", "highways_count": len(highways)}), 200


if __name__ == "__main__":
    editor_app.run(debug=True, port=5001)
