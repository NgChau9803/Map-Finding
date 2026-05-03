import time
import uuid

# In-memory event store
_events = []

def get_active_events():
    """Return all currently active events."""
    now = time.time()
    return [e for e in _events if e["start_time"] <= now <= e["end_time"]]

def get_all_events():
    return list(_events)

def add_event(event_data):
    """
    Add a new event.
    Preferred keys: edge_from + edge_to (exact edge blocking)
    Fallback keys:  node_id (blocks all edges through intersection)
    """
    event = {
        "id": str(uuid.uuid4()),
        "edge_from": event_data.get("edge_from"),  # exact edge — from node
        "edge_to":   event_data.get("edge_to"),    # exact edge — to node
        "node_id":   event_data.get("node_id"),    # fallback: node-based blocking
        "type": event_data.get("type", "unknown"),
        "traffic_factor": event_data.get("traffic_factor", 0.0),
        "start_time": event_data.get("start_time", time.time()),
        "end_time": event_data.get("end_time", time.time() + 3600),
        "lat": event_data.get("lat"),
        "lon": event_data.get("lon"),
        "description": event_data.get("description", "")
    }
    _events.append(event)
    return event

def remove_event(event_id):
    """Remove an event by ID."""
    global _events
    original_count = len(_events)
    _events = [e for e in _events if e["id"] != event_id]
    return len(_events) < original_count

def apply_events_to_graph(graph):
    """Inject current active events into graph data for algorithm consumption."""
    graph_copy = dict(graph)
    graph_copy["events"] = get_all_events()
    return graph_copy
