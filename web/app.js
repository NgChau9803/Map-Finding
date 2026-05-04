// ─── Constants ────────────────────────────────────────────────
const API = 'http://127.0.0.1:5000/api';

// ─── State ────────────────────────────────────────────────────
let map;
let nodesData = {};      // {id: {id, lat, lon}}
let edgesData = [];
let edgeGeometry = {};   // edgeGeometry[from_id][to_id] = [[lat, lon], ...]
let startNode = null;
let endNode = null;
let selectionMode = 'start'; // 'start' | 'end' | 'event' | null
let addingEvent = false;

// Leaflet layers
let startMarker = null;
let endMarker = null;
let pathLayer = null;
let exploredLayer = null;
let eventMarkers = {};  // id -> marker

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchGraph();
    bindUI();
});

function initMap() {
    map = L.map('map').setView([21.027, 105.821], 16);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19
    }).addTo(map);
    map.on('click', onMapClick);
}

async function fetchGraph() {
    try {
        const res = await fetch(`${API}/graph`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        data.nodes.forEach(n => { nodesData[n.id] = n; });
        edgesData = data.edges;

        // Build geometry lookup: edgeGeometry[from][to] = [[lat,lon], ...]
        data.edges.forEach(e => {
            if (!edgeGeometry[e.from]) edgeGeometry[e.from] = {};
            edgeGeometry[e.from][e.to] = e.geometry
                ? e.geometry.map(p => [p.lat, p.lon])
                : null;  // will fall back to node coords
        });

        console.log(`✅ Loaded ${data.nodes.length} nodes, ${data.edges.length} edges.`);
        // Enable clicking
        setHint('Click to set <strong>Start (A)</strong>');
    } catch (e) {
        console.error('Graph fetch failed:', e);
        setHint('⚠️ Could not load graph data. Is the server running?');
    }
}

// ─── Map Click ────────────────────────────────────────────────
function onMapClick(e) {
    if (Object.keys(nodesData).length === 0) return;

    const { lat, lng } = e.latlng;

    if (addingEvent) {
        // For events: snap to the nearest road SEGMENT, not just nearest node
        const { edge, point } = closestEdge(lat, lng);
        if (edge) placeEventOnEdge(edge, point || [lat, lng]);
        return;
    }

    const node = closestNode(lat, lng);
    if (!node) return;

    if (selectionMode === 'start') {
        placeStart(node);
        selectionMode = 'end';
        setHint('Click to set <strong>End (B)</strong>');
    } else {
        placeEnd(node);
        selectionMode = 'start';
        setHint('Start selected again. Click to change <strong>Start (A)</strong>');
        checkReady();
    }
}

function closestNode(lat, lng) {
    let best = null, bestDist = Infinity;
    for (const n of Object.values(nodesData)) {
        const d = (n.lat - lat) ** 2 + (n.lon - lng) ** 2;
        if (d < bestDist) { bestDist = d; best = n; }
    }
    return best;
}

/**
 * Find the closest point on any road edge geometry to the given lat/lng.
 * Uses perpendicular projection onto each line segment.
 * Returns { edge, point: [lat, lon] }
 */
function closestEdge(lat, lng) {
    let bestEdge = null;
    let bestPoint = null;
    let bestDist = Infinity;

    for (const edge of edgesData) {
        // Get geometry waypoints — fall back to straight node-to-node
        const geom = edgeGeometry[edge.from]?.[edge.to];
        let points;
        if (geom && geom.length >= 2) {
            points = geom;  // [[lat, lon], ...]
        } else {
            const nf = nodesData[edge.from];
            const nt = nodesData[edge.to];
            if (!nf || !nt) continue;
            points = [[nf.lat, nf.lon], [nt.lat, nt.lon]];
        }

        // Check each line segment within this edge's geometry
        for (let i = 0; i < points.length - 1; i++) {
            const ay = points[i][0],   ax = points[i][1];    // segment start (lat, lon)
            const by = points[i+1][0], bx = points[i+1][1]; // segment end
            const py = lat,            px = lng;             // click point

            // Project P onto segment AB, clamp t to [0, 1]
            const abx = bx - ax, aby = by - ay;
            const apx = px - ax, apy = py - ay;
            const ab2 = abx * abx + aby * aby;
            const t = ab2 > 1e-14 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2)) : 0;

            // Closest point Q on segment
            const qx = ax + t * abx;
            const qy = ay + t * aby;
            const dist = (px - qx) ** 2 + (py - qy) ** 2;

            if (dist < bestDist) {
                bestDist = dist;
                bestEdge = edge;
                bestPoint = [qy, qx];  // [lat, lon]
            }
        }
    }
    return { edge: bestEdge, point: bestPoint };
}

// ─── Markers ──────────────────────────────────────────────────
function makeIcon(cls) {
    return L.divIcon({ className: cls, iconSize: [16, 16], iconAnchor: [8, 8] });
}

function placeStart(node) {
    startNode = node;
    if (startMarker) map.removeLayer(startMarker);
    startMarker = L.marker([node.lat, node.lon], { icon: makeIcon('marker-start') })
        .bindPopup('🟢 Start (A)').addTo(map);
    document.getElementById('start-point-display').textContent = `Lat ${node.lat.toFixed(5)}, Lon ${node.lon.toFixed(5)}`;
    document.getElementById('start-point-display').classList.add('active');
}

function placeEnd(node) {
    endNode = node;
    if (endMarker) map.removeLayer(endMarker);
    endMarker = L.marker([node.lat, node.lon], { icon: makeIcon('marker-end') })
        .bindPopup('🔴 End (B)').addTo(map);
    document.getElementById('end-point-display').textContent = `Lat ${node.lat.toFixed(5)}, Lon ${node.lon.toFixed(5)}`;
    document.getElementById('end-point-display').classList.add('active');
}

function checkReady() {
    document.getElementById('find-path-btn').disabled = !(startNode && endNode);
}

// ─── UI Bindings ──────────────────────────────────────────────
function bindUI() {
    // TABS
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(p => p.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(`panel-${btn.dataset.tab}`).classList.remove('hidden');
            // Disable event mode when switching to route tab
            if (btn.dataset.tab === 'route') setAddingEvent(false);
        });
    });

    // Route controls
    document.getElementById('start-point-display').addEventListener('click', () => { selectionMode = 'start'; setHint('Click to change <strong>Start (A)</strong>'); });
    document.getElementById('end-point-display').addEventListener('click', () => { selectionMode = 'end'; setHint('Click to change <strong>End (B)</strong>'); });
    document.getElementById('find-path-btn').addEventListener('click', findPath);
    document.getElementById('clear-btn').addEventListener('click', clearRoute);

    // Search inputs (Nominatim - Free open-source search)
    initSearch('start-search', 'start-results', 'start');
    initSearch('end-search', 'end-results', 'end');

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrapper')) {
            document.querySelectorAll('.search-results').forEach(el => el.classList.add('hidden'));
        }
    });

    // Event controls
    document.getElementById('add-event-btn').addEventListener('click', () => {
        setAddingEvent(!addingEvent);
    });
    document.getElementById('clear-events-btn').addEventListener('click', clearAllEvents);
}

// ─── Nominatim Search ─────────────────────────────────────────
let _searchTimers = {};

function initSearch(inputId, resultsId, role) {
    const input = document.getElementById(inputId);
    const resultsEl = document.getElementById(resultsId);

    input.addEventListener('input', () => {
        const q = input.value.trim();
        if (q.length < 2) {
            resultsEl.classList.add('hidden');
            return;
        }
        // Debounce: wait 400ms after user stops typing
        clearTimeout(_searchTimers[role]);
        _searchTimers[role] = setTimeout(() => nominatimSearch(q, resultsEl, role), 400);
    });

    input.addEventListener('focus', () => {
        if (resultsEl.childElementCount > 0) resultsEl.classList.remove('hidden');
    });
}

async function nominatimSearch(query, resultsEl, role) {
    resultsEl.innerHTML = '<div class="search-loading">Searching...</div>';
    resultsEl.classList.remove('hidden');

    try {
        // Match exactly the Giảng Võ bbox from graph_builder.py
        const url = `https://nominatim.openstreetmap.org/search?` +
            `q=${encodeURIComponent(query)}` +
            `&format=json&limit=6&addressdetails=1` +
            `&viewbox=105.812,21.034,105.830,21.020&bounded=1` +
            `&countrycodes=vn`;

        const res = await fetch(url, { headers: { 'Accept-Language': 'vi,en' } });
        const results = await res.json();

        if (results.length === 0) {
            resultsEl.innerHTML = '<div class="search-loading">No results found</div>';
            return;
        }

        resultsEl.innerHTML = '';
        results.forEach(r => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            const name = r.display_name.split(',')[0];
            const addr = r.display_name.split(',').slice(1, 4).join(',').trim();

            item.innerHTML = `<span class="result-name">${name}</span><span class="result-addr">${addr}</span>`;

            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent input from losing focus immediately
                const lat = parseFloat(r.lat);
                const lon = parseFloat(r.lon);
                selectSearchResult(lat, lon, r.display_name, role);
                resultsEl.classList.add('hidden');
                document.getElementById(`${role}-search`).value = name;
            });
            resultsEl.appendChild(item);
        });
    } catch (e) {
        resultsEl.innerHTML = '<div class="search-loading">Search failed</div>';
        console.error('Nominatim error:', e);
    }
}

function selectSearchResult(lat, lon, displayName, role) {
    const node = closestNode(lat, lon);
    if (!node) {
        alert('No road node found near this location.');
        return;
    }

    // Check if the snapped node is too far (meaning the place is likely outside our graph)
    const dist = haversine(lat, lon, node.lat, node.lon);
    if (dist > 500) {
        alert('Warning: This location is outside the Giảng Võ map area. Please select a place closer to the map.');
        return;
    }
    map.setView([lat, lon], 17);
    if (role === 'start') {
        placeStart(node);
        selectionMode = 'end';
        setHint('Now set <strong>End (B)</strong>');
    } else {
        placeEnd(node);
        selectionMode = 'start';
        checkReady();
        setHint('Both points set! Click <strong>Find Path</strong>');
    }
}

function setHint(html) {
    const hint = document.getElementById('map-hint');
    hint.innerHTML = html;
    hint.classList.remove('hidden');
}

// ─── Pathfinding ──────────────────────────────────────────────
async function findPath() {
    if (!startNode || !endNode) return;
    const algo = document.getElementById('algorithm-select').value;
    showLoading(true);
    try {
        const res = await fetch(`${API}/find-path`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start: startNode.id, end: endNode.id, algorithm: algo })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unknown error');
        renderPath(data);
    } catch (e) {
        alert('Pathfinding error: ' + e.message);
    } finally {
        showLoading(false);
    }
}

function renderPath({ path, explored, metrics }) {
    if (pathLayer) map.removeLayer(pathLayer);
    if (exploredLayer) map.removeLayer(exploredLayer);

    // Draw explored nodes
    if (explored?.length) {
        const circles = explored.map(id => {
            const n = nodesData[id];
            return n ? L.circleMarker([n.lat, n.lon], { radius: 4, color: 'transparent', fillColor: '#f59e0b', fillOpacity: 0.4 }) : null;
        }).filter(Boolean);
        exploredLayer = L.layerGroup(circles).addTo(map);
    }

    // Draw path using actual road geometry (not just straight node-to-node lines)
    if (path?.length) {
        const coords = [];
        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            const geom = edgeGeometry[from]?.[to];

            if (geom && geom.length > 0) {
                // Use the stored road waypoints for this edge segment
                coords.push(...geom);
            } else {
                // Fallback: straight line between the two nodes
                const nFrom = nodesData[from];
                const nTo = nodesData[to];
                if (nFrom) coords.push([nFrom.lat, nFrom.lon]);
                if (nTo) coords.push([nTo.lat, nTo.lon]);
            }
        }
        // Add the very last node
        const lastNode = nodesData[path[path.length - 1]];
        if (lastNode && (coords.length === 0 || coords[coords.length - 1][0] !== lastNode.lat)) {
            coords.push([lastNode.lat, lastNode.lon]);
        }

        pathLayer = L.polyline(coords, { color: '#3b82f6', weight: 6, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        map.fitBounds(pathLayer.getBounds(), { padding: [60, 60] });
    }

    // Show metrics
    document.getElementById('results-panel').classList.remove('hidden');
    document.getElementById('metric-time').textContent = metrics.time_ms.toFixed(2);
    document.getElementById('metric-distance').textContent = metrics.distance_m.toFixed(0);
    document.getElementById('metric-nodes').textContent = metrics.nodes_explored;
}

// ─── Clear ────────────────────────────────────────────────────
function clearRoute() {
    [startMarker, endMarker, pathLayer, exploredLayer].forEach(l => { if (l) map.removeLayer(l); });
    startMarker = endMarker = pathLayer = exploredLayer = null;
    startNode = endNode = null;
    document.getElementById('start-point-display').textContent = 'Click on map to set start';
    document.getElementById('start-point-display').classList.remove('active');
    document.getElementById('end-point-display').textContent = 'Click on map to set end';
    document.getElementById('end-point-display').classList.remove('active');
    document.getElementById('results-panel').classList.add('hidden');
    document.getElementById('find-path-btn').disabled = true;
    selectionMode = 'start';
    setHint('Click to set <strong>Start (A)</strong>');
}

// ─── Events ───────────────────────────────────────────────────
function setAddingEvent(val) {
    addingEvent = val;
    const btn = document.getElementById('add-event-btn');
    if (val) {
        btn.textContent = '✅ Click map to place event';
        btn.style.background = 'var(--warning)';
        map.getContainer().style.cursor = 'crosshair';
        setHint('🗺️ Click on a road to add a traffic event');
    } else {
        btn.textContent = 'Click Map to Add Event';
        btn.style.background = '';
        map.getContainer().style.cursor = '';
        setHint('');
    }
}

async function placeEventOnEdge(edge, visualPoint) {
    const typeSelect = document.getElementById('event-type-select');
    const selectedOption = typeSelect.selectedOptions[0];
    const type = typeSelect.value;
    const trafficFactor = parseFloat(selectedOption.dataset.factor);
    const durationMin = parseInt(document.getElementById('event-duration').value) || 60;

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        type,
        traffic_factor: trafficFactor,
        start_time: now,
        end_time: now + durationMin * 60,
        lat: visualPoint[0],
        lon: visualPoint[1],
        edge_from: edge.from,   // exact edge — backend blocks this specific segment
        edge_to:   edge.to,
        description: `${selectedOption.text} on ${edge.name || 'road'} (${visualPoint[0].toFixed(4)}, ${visualPoint[1].toFixed(4)})`
    };

    try {
        const res = await fetch(`${API}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const event = await res.json();
        // Marker appears exactly on the road where the user clicked
        addEventMarker(event, { lat: visualPoint[0], lon: visualPoint[1] });
        renderEventList();
    } catch (e) {
        alert('Failed to add event: ' + e.message);
    }
    setAddingEvent(false);
}

function addEventMarker(event, node) {
    const labels = { accident: '🚨', maintenance: '🚧', traffic: '🚗', vip: '🚔' };
    const icon = L.divIcon({ className: 'marker-event', iconSize: [18, 18], iconAnchor: [9, 9], html: labels[event.type] || '⚠️' });
    const marker = L.marker([node.lat, node.lon], { icon })
        .bindPopup(`<strong>${event.description}</strong>`)
        .addTo(map);
    eventMarkers[event.id] = marker;
}

async function renderEventList() {
    try {
        const res = await fetch(`${API}/events`);
        const events = await res.json();
        const container = document.getElementById('events-container');
        if (!events.length) {
            container.innerHTML = '<p class="empty-state">No active events</p>';
            return;
        }
        container.innerHTML = events.map(ev => `
            <div class="event-item" id="ev-${ev.id}">
                <div class="event-label">
                    <span class="event-type">${ev.description || ev.type}</span>
                    <span class="event-meta">Traffic factor: ${ev.traffic_factor} | ${Math.round((ev.end_time - ev.start_time) / 60)} min</span>
                </div>
                <button class="event-remove-btn" onclick="deleteEvent('${ev.id}')">✕</button>
            </div>
        `).join('');
    } catch (e) { console.error(e); }
}

async function deleteEvent(eventId) {
    try {
        await fetch(`${API}/events/${eventId}`, { method: 'DELETE' });
        if (eventMarkers[eventId]) {
            map.removeLayer(eventMarkers[eventId]);
            delete eventMarkers[eventId];
        }
        renderEventList();
    } catch (e) { alert('Failed to delete event.'); }
}

async function clearAllEvents() {
    try {
        const res = await fetch(`${API}/events`);
        const events = await res.json();
        await Promise.all(events.map(ev => fetch(`${API}/events/${ev.id}`, { method: 'DELETE' })));
        Object.values(eventMarkers).forEach(m => map.removeLayer(m));
        eventMarkers = {};
        renderEventList();
    } catch (e) { console.error(e); }
}

// ─── Helpers ──────────────────────────────────────────────────
function showLoading(show) {
    document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

// ─── Utilities ────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
