import math
import time
import heapq
from collections import deque, defaultdict
from src.utils import haversine

# Radius within which an event affects road segments
_EVENT_PROXIMITY_M = 75.0



def _pt_to_seg_dist_m(plat, plon, alat, alon, blat, blon):
    """Minimum distance in metres from point P to line segment AB (approx. planar)."""
    ax, ay = alon, alat
    bx, by = blon, blat
    px, py = plon, plat
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    ab2 = abx * abx + aby * aby
    t = max(0.0, min(1.0, (apx * abx + apy * aby) / ab2)) if ab2 > 1e-14 else 0.0
    qx = ax + t * abx
    qy = ay + t * aby
    # Convert degree-differences to metres (mid-latitude approximation)
    mid_lat = math.radians((py + qy) / 2)
    dlat = (py - qy) * 111_320
    dlon = (px - qx) * 111_320 * math.cos(mid_lat)
    return math.sqrt(dlat * dlat + dlon * dlon)


def _edge_within_radius(edge, elat, elon, radius_m, nodes_map):
    """Return True if any point on this edge's geometry is within radius_m of (elat, elon)."""
    geom = edge.get("geometry")
    if geom and len(geom) >= 2:
        pts = geom   # list of {"lat": ..., "lon": ...}
    else:
        # Fallback: straight line between from-node and to-node
        nf = nodes_map.get(edge["from"])
        nt = nodes_map.get(edge["to"])
        if not nf or not nt:
            return False
        pts = [{"lat": nf["lat"], "lon": nf["lon"]},
               {"lat": nt["lat"], "lon": nt["lon"]}]

    for i in range(len(pts) - 1):
        dist = _pt_to_seg_dist_m(
            elat, elon,
            pts[i]["lat"],  pts[i]["lon"],
            pts[i+1]["lat"], pts[i+1]["lon"],
        )
        if dist <= radius_m:
            return True
    return False


def _build_adjacency(graph):
    """Build adjacency list from graph data, applying active traffic events.

    Event matching strategy:
      - Primary: proximity check — any edge whose geometry passes within
        _EVENT_PROXIMITY_M metres of the event's lat/lon is affected.
        This naturally handles both directions of travel on the same road.
      - Fallback: node_id — blocks/slows all edges through that intersection
        (used for events placed when geometry data is unavailable).
    """
    adj = defaultdict(list)
    events = graph.get("events", [])

    # Build nodes lookup for geometry fallback
    nodes_map = {}
    for n in graph.get("nodes", []):
        nodes_map[n["id"]] = n

    # Collect active events into two buckets
    now = time.time()
    proximity_events = []   # events with lat/lon → use geometry proximity
    node_events = []        # events with node_id → fallback intersection block

    for event in events:
        start_t = event.get("start_time", 0)
        end_t = event.get("end_time", float('inf'))
        if not (start_t <= now <= end_t):
            continue

        elat = event.get("lat")
        elon = event.get("lon")
        tf = float(event.get("traffic_factor", 0.0))

        if elat is not None and elon is not None:
            proximity_events.append({"lat": elat, "lon": elon, "traffic_factor": tf})
        else:
            raw_id = event.get("node_id") or event.get("edge_id")
            if raw_id is None:
                continue
            try:
                node_events.append({"node_id": int(raw_id), "traffic_factor": tf})
            except (ValueError, TypeError):
                continue

    # Node-based sets (intersection blocking)
    blocked_nodes = set()
    slow_nodes = {}
    for ev in node_events:
        nid = ev["node_id"]
        tf = ev["traffic_factor"]
        if tf <= 0:
            blocked_nodes.add(nid)
        else:
            slow_nodes[nid] = min(slow_nodes.get(nid, 1.0), tf)

    # Build adjacency, applying events per edge
    for edge in graph["edges"]:
        u = edge["from"]
        v = edge["to"]
        length = edge.get("length", 1)
        speed = edge.get("speed", 30)

        # ── Node-based block (fallback) ──
        if u in blocked_nodes or v in blocked_nodes:
            continue

        # ── Proximity-based event application ──
        edge_blocked = False
        worst_tf = 1.0  # start at normal (no slowdown)

        for ev in proximity_events:
            if not _edge_within_radius(edge, ev["lat"], ev["lon"], _EVENT_PROXIMITY_M, nodes_map):
                continue
            tf = ev["traffic_factor"]
            if tf <= 0:
                edge_blocked = True
                break
            worst_tf = min(worst_tf, tf)

        if edge_blocked:
            continue

        # ── Node-based slow (fallback) ──
        node_tf = min(slow_nodes.get(u, 1.0), slow_nodes.get(v, 1.0))
        final_tf = min(worst_tf, node_tf)

        effective = speed * final_tf
        weight = length / effective if effective > 0 else float('inf')
        adj[u].append((v, weight, length))

    return adj




def _reconstruct_path(parent, start, end):
    """Trace back from end to start using parent map."""
    path = []
    current = end
    while current is not None:
        path.append(current)
        current = parent.get(current)
    path.reverse()
    if path[0] == start:
        return path
    return []  # No valid path found


def bfs(graph, start, end):
    """Breadth-First Search — finds shortest path by number of edges."""
    start_t = time.perf_counter()
    adj = _build_adjacency(graph)

    queue = deque([start])
    visited = {start}
    parent = {start: None}
    explored = []

    while queue:
        node = queue.popleft()
        explored.append(node)

        if node == end:
            break

        for neighbor, weight, length in adj[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                parent[neighbor] = node
                queue.append(neighbor)

    elapsed_ms = (time.perf_counter() - start_t) * 1000
    path = _reconstruct_path(parent, start, end) if end in parent else []
    distance = _path_distance(path, graph)
    return path, explored, elapsed_ms, distance


def dfs(graph, start, end):
    """Depth-First Search — explores deep paths, not optimal."""
    start_t = time.perf_counter()
    adj = _build_adjacency(graph)

    stack = [start]
    visited = set()
    parent = {start: None}
    explored = []

    while stack:
        node = stack.pop()
        if node in visited:
            continue
        visited.add(node)
        explored.append(node)

        if node == end:
            break

        for neighbor, weight, length in adj[node]:
            if neighbor not in visited:
                parent[neighbor] = node
                stack.append(neighbor)

    elapsed_ms = (time.perf_counter() - start_t) * 1000
    path = _reconstruct_path(parent, start, end) if end in parent else []
    distance = _path_distance(path, graph)
    return path, explored, elapsed_ms, distance


def dijkstra(graph, start, end):
    """Dijkstra's algorithm — optimal weighted shortest path."""
    start_t = time.perf_counter()
    adj = _build_adjacency(graph)

    dist = defaultdict(lambda: float('inf'))
    dist[start] = 0
    parent = {start: None}
    heap = [(0, start)]
    visited = set()
    explored = []

    while heap:
        cost, node = heapq.heappop(heap)
        if node in visited:
            continue
        visited.add(node)
        explored.append(node)

        if node == end:
            break

        for neighbor, weight, length in adj[node]:
            new_cost = cost + weight
            if new_cost < dist[neighbor]:
                dist[neighbor] = new_cost
                parent[neighbor] = node
                heapq.heappush(heap, (new_cost, neighbor))

    elapsed_ms = (time.perf_counter() - start_t) * 1000
    path = _reconstruct_path(parent, start, end) if end in parent else []
    distance = _path_distance(path, graph)
    return path, explored, elapsed_ms, distance


def greedy_best_first(graph, start, end, nodes_map):
    """Greedy Best-First Search — uses only heuristic h(n)."""
    start_t = time.perf_counter()
    adj = _build_adjacency(graph)

    goal = nodes_map.get(end)
    if not goal:
        return [], [], 0, 0

    def h(node_id):
        n = nodes_map.get(node_id)
        if not n:
            return float('inf')
        return haversine(n['lat'], n['lon'], goal['lat'], goal['lon'])

    heap = [(h(start), start)]
    visited = set()
    parent = {start: None}
    explored = []

    while heap:
        _, node = heapq.heappop(heap)
        if node in visited:
            continue
        visited.add(node)
        explored.append(node)

        if node == end:
            break

        for neighbor, weight, length in adj[node]:
            if neighbor not in visited:
                parent[neighbor] = node
                heapq.heappush(heap, (h(neighbor), neighbor))

    elapsed_ms = (time.perf_counter() - start_t) * 1000
    path = _reconstruct_path(parent, start, end) if end in parent else []
    distance = _path_distance(path, graph)
    return path, explored, elapsed_ms, distance


def astar(graph, start, end, nodes_map):
    """A* Search — combines g(n) + h(n) for optimal and efficient pathfinding."""
    start_t = time.perf_counter()
    adj = _build_adjacency(graph)

    goal = nodes_map.get(end)
    if not goal:
        return [], [], 0, 0

    def h(node_id):
        n = nodes_map.get(node_id)
        if not n:
            return float('inf')
        return haversine(n['lat'], n['lon'], goal['lat'], goal['lon'])

    g_score = defaultdict(lambda: float('inf'))
    g_score[start] = 0
    f_score = g_score[start] + h(start)

    heap = [(f_score, start)]
    visited = set()
    parent = {start: None}
    explored = []

    while heap:
        f, node = heapq.heappop(heap)
        if node in visited:
            continue
        visited.add(node)
        explored.append(node)

        if node == end:
            break

        for neighbor, weight, length in adj[node]:
            tentative_g = g_score[node] + weight
            if tentative_g < g_score[neighbor]:
                g_score[neighbor] = tentative_g
                parent[neighbor] = node
                heapq.heappush(heap, (tentative_g + h(neighbor), neighbor))

    elapsed_ms = (time.perf_counter() - start_t) * 1000
    path = _reconstruct_path(parent, start, end) if end in parent else []
    distance = _path_distance(path, graph)
    return path, explored, elapsed_ms, distance


def _path_distance(path, graph):
    """Calculate total length of a path in meters."""
    if not path or len(path) < 2:
        return 0

    edge_lengths = {}
    for edge in graph["edges"]:
        key = (edge["from"], edge["to"])
        edge_lengths[key] = edge.get("length", 0)

    total = 0
    for i in range(len(path) - 1):
        length = edge_lengths.get((path[i], path[i + 1]), 0)
        total += length
    return total
