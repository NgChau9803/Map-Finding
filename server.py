import json
import os
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_cors import CORS

# Load environment variables
load_dotenv()

from src.algorithms import bfs, dfs, dijkstra, greedy_best_first, astar
from src.events import get_all_events, add_event, remove_event, apply_events_to_graph

# ─── App Setup ────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder='web', static_url_path='', template_folder='web')
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GRAPH_PATH = os.path.join(BASE_DIR, 'data', 'graph.json')

# Load and cache graph data once at startup
_graph_cache = None
_nodes_map = {}


def _load_graph():
    global _graph_cache, _nodes_map
    if _graph_cache is None:
        with open(GRAPH_PATH, 'r', encoding='utf-8') as f:
            _graph_cache = json.load(f)
        _nodes_map = {node['id']: node for node in _graph_cache['nodes']}
    return _graph_cache, _nodes_map


# ─── Frontend ─────────────────────────────────────────────────────────────────
@app.route('/')
def serve_index():
    api_key = os.environ.get('GOOGLE_MAPS_API_KEY', '')
    return render_template('index.html', google_maps_api_key=api_key)


# ─── Graph Data ───────────────────────────────────────────────────────────────
@app.route('/api/graph')
def get_graph():
    try:
        graph, _ = _load_graph()
        return jsonify(graph)
    except FileNotFoundError:
        return jsonify({"error": "Graph data not found. Run graph_builder.py first."}), 404


# ─── Pathfinding ──────────────────────────────────────────────────────────────
@app.route('/api/find-path', methods=['POST'])
def find_path():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON payload provided."}), 400

    start = data.get('start')
    end = data.get('end')
    algorithm = data.get('algorithm', 'astar')

    if start is None or end is None:
        return jsonify({"error": "start and end node IDs are required."}), 400

    try:
        graph, nodes_map = _load_graph()
        graph_with_events = apply_events_to_graph(graph)
    except FileNotFoundError:
        return jsonify({"error": "Graph data not found. Run graph_builder.py first."}), 404

    # Convert to int (JSON sometimes sends as string)
    start = int(start)
    end = int(end)

    if start not in nodes_map:
        return jsonify({"error": f"Start node {start} not found in graph."}), 404
    if end not in nodes_map:
        return jsonify({"error": f"End node {end} not found in graph."}), 404

    # Run selected algorithm
    if algorithm == 'bfs':
        path, explored, elapsed_ms, distance = bfs(graph_with_events, start, end)
    elif algorithm == 'dfs':
        path, explored, elapsed_ms, distance = dfs(graph_with_events, start, end)
    elif algorithm == 'dijkstra':
        path, explored, elapsed_ms, distance = dijkstra(graph_with_events, start, end)
    elif algorithm == 'greedy':
        path, explored, elapsed_ms, distance = greedy_best_first(graph_with_events, start, end, nodes_map)
    elif algorithm == 'astar':
        path, explored, elapsed_ms, distance = astar(graph_with_events, start, end, nodes_map)
    else:
        return jsonify({"error": f"Unknown algorithm: {algorithm}"}), 400

    if not path:
        return jsonify({"error": "No path found between the selected points."}), 404

    return jsonify({
        "path": path,
        "explored": explored,
        "metrics": {
            "time_ms": elapsed_ms,
            "distance_m": distance,
            "nodes_explored": len(explored)
        }
    })


# ─── Events ───────────────────────────────────────────────────────────────────
@app.route('/api/events', methods=['GET'])
def list_events():
    return jsonify(get_all_events())


@app.route('/api/events', methods=['POST'])
def create_event():
    event_data = request.get_json()
    if not event_data:
        return jsonify({"error": "No event data provided."}), 400
    event = add_event(event_data)
    return jsonify(event), 201


@app.route('/api/events/<event_id>', methods=['DELETE'])
def delete_event(event_id):
    success = remove_event(event_id)
    if success:
        return jsonify({"message": f"Event {event_id} removed."})
    return jsonify({"error": f"Event {event_id} not found."}), 404


# ─── Run ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    app.run(debug=True)
