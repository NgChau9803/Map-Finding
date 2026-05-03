import osmnx as ox
import json
import os

def download_and_save_graph(output_file="data/graph.json"):
    print("Bắt đầu tải dữ liệu bản đồ cho: Giảng Võ, Hanoi (Sử dụng bounding box)...")
    
    # Bounding box for Giảng Võ ward, Ba Đình district, Hanoi
    # (north, south, east, west)
    north, south, east, west = 21.034, 21.020, 105.830, 105.812

    # Download drive network within bbox
    G = ox.graph_from_bbox(
        bbox=(north, south, east, west),
        network_type='drive'
    )

    nodes_data = []
    edges_data = []

    print("Đang xử lý Nodes...")
    for node_id, data in G.nodes(data=True):
        nodes_data.append({
            "id": node_id,
            "lat": data['y'],
            "lon": data['x']
        })

    print("Đang xử lý Edges...")
    for u, v, key, data in G.edges(keys=True, data=True):
        # Lấy tên đường
        name = data.get('name', '')
        if isinstance(name, list):
            name = name[0]
            
        # Lấy tốc độ giới hạn (nếu có, nếu không mặc định là 30km/h)
        speed = data.get('maxspeed', '30')
        if isinstance(speed, list):
            speed = speed[0]
            
        try:
            speed_val = float(str(speed).replace(' km/h', '').replace(' mph', '').strip())
        except ValueError:
            speed_val = 30.0

        # Extract road geometry (actual road shape, not just start/end nodes)
        geom = data.get('geometry')  # Shapely LineString from OSMnx
        if geom is not None:
            # coords are (lon, lat) in Shapely convention
            geometry = [{"lat": lat, "lon": lon} for lon, lat in geom.coords]
        else:
            # Fallback: straight line between the two endpoint nodes
            geometry = [
                {"lat": G.nodes[u]['y'], "lon": G.nodes[u]['x']},
                {"lat": G.nodes[v]['y'], "lon": G.nodes[v]['x']}
            ]

        edges_data.append({
            "from": u,
            "to": v,
            "length": data.get('length', 0),
            "name": name,
            "speed": speed_val,
            "geometry": geometry   # list of {lat, lon} waypoints along the actual road
        })

    graph_json = {
        "nodes": nodes_data,
        "edges": edges_data
    }

    # Đảm bảo thư mục lưu tồn tại
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(graph_json, f, ensure_ascii=False, indent=2)
        
    print(f"✅ Đã lưu xong dữ liệu vào {output_file}!")
    print(f"Tổng số nodes: {len(nodes_data)}")
    print(f"Tổng số edges: {len(edges_data)}")
    return graph_json

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_path = os.path.join(base_dir, "data", "graph.json")
    download_and_save_graph(output_file=output_path)
