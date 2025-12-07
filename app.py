from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional

from flask import Flask, jsonify, render_template

app = Flask(__name__)


@dataclass
class Node:
    id: str
    name: str
    kind: str  # IC, JCT, PA, SA
    km: float
    lat: Optional[float] = None
    lon: Optional[float] = None
    x: Optional[float] = None
    y: Optional[float] = None


@dataclass
class Highway:
    id: str
    name: str
    description: str
    origin_city: Optional[str]
    destination_city: Optional[str]
    landmarks: List[Dict[str, float]]
    nodes: List[Node]

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "origin_city": self.origin_city,
            "destination_city": self.destination_city,
            "landmarks": self.landmarks,
            "nodes": [asdict(node) for node in self.nodes],
        }


def load_highways() -> Dict[str, Highway]:
    data_path = Path(__file__).parent / "data" / "highways.json"
    with data_path.open(encoding="utf-8") as f:
        payload = json.load(f)

    loaded: Dict[str, Highway] = {}
    for hw in payload.get("highways", []):
        highway = Highway(
            id=hw["id"],
            name=hw["name"],
            description=hw.get("description", ""),
            origin_city=hw.get("origin_city"),
            destination_city=hw.get("destination_city"),
            landmarks=hw.get("landmarks", []),
            nodes=[Node(**node) for node in hw.get("nodes", [])],
        )
        loaded[highway.id] = highway
    return loaded


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/highways")
def list_highways():
    highways = load_highways()
    data = [highway.to_dict() for highway in highways.values()]
    return jsonify(data)


@app.route("/api/highways/<highway_id>")
def get_highway(highway_id: str):
    highways = load_highways()
    highway = highways.get(highway_id)
    if not highway:
        return jsonify({"error": "not found"}), 404
    return jsonify(highway.to_dict())


if __name__ == "__main__":
    app.run(debug=True)
