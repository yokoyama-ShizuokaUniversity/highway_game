from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, List

from flask import Flask, jsonify, render_template

app = Flask(__name__)


@dataclass
class Node:
    id: str
    name: str
    kind: str  # IC, JCT, PA, SA
    km: float


@dataclass
class Highway:
    id: str
    name: str
    description: str
    nodes: List[Node]

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "nodes": [asdict(node) for node in self.nodes],
        }


# Demo data: 東名高速道路 (一部区間)
highways: Dict[str, Highway] = {
    "tomei": Highway(
        id="tomei",
        name="東名高速道路",
        description="東京IC〜御殿場ICのデモ区間",
        nodes=[
            Node(id="tokyo", name="東京IC", kind="IC", km=0),
            Node(id="yokohama-cho", name="横浜町田IC", kind="IC", km=23.8),
            Node(id="ebina", name="海老名JCT", kind="JCT", km=31.4),
            Node(id="atsugi", name="厚木IC", kind="IC", km=35.7),
            Node(id="hadano", name="秦野中井IC", kind="IC", km=53.3),
            Node(id="oi", name="大井松田IC", kind="IC", km=63.9),
            Node(id="ashigara", name="足柄SA", kind="SA", km=78.0),
            Node(id="gotenba", name="御殿場IC", kind="IC", km=84.4),
        ],
    )
}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/highways")
def list_highways():
    data = [highway.to_dict() for highway in highways.values()]
    return jsonify(data)


@app.route("/api/highways/<highway_id>")
def get_highway(highway_id: str):
    highway = highways.get(highway_id)
    if not highway:
        return jsonify({"error": "not found"}), 404
    return jsonify(highway.to_dict())


if __name__ == "__main__":
    app.run(debug=True)
