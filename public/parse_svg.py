import xml.etree.ElementTree as ET
import json

def parse_svg(svg_file):
    tree = ET.parse(svg_file)
    root = tree.getroot()
    # Load universe data for real 3D distance lookup
    u = {s['SystemId']: s for s in json.load(open('./prun_universe_data.json'))}
    
    namespace = {'svg': 'http://www.w3.org/2000/svg', 'inkscape': 'http://www.inkscape.org/namespaces/inkscape'}
    systems, edges = {}, []

    for rect in root.findall('.//svg:rect', namespace):
        systems[rect.get('id')] = {'x': float(rect.get('x')), 'y': float(rect.get('y'))}

    for path in root.findall('.//svg:path', namespace):
        start_id = path.get('{http://www.inkscape.org/namespaces/inkscape}connection-start').lstrip('#')
        end_id = path.get('{http://www.inkscape.org/namespaces/inkscape}connection-end').lstrip('#')
        if start_id in u and end_id in u:
            u1, u2 = u[start_id], u[end_id]
            # Replace 2D math with 3D math from universe data / 12.0 conversion
            distance = ((u1['PositionX']-u2['PositionX'])**2 + (u1['PositionY']-u2['PositionY'])**2 + (u1['PositionZ']-u2['PositionZ'])**2)**0.5 / 12.0
            edges.append({'start': start_id, 'end': end_id, 'distance': distance})

    return systems, edges

def save_graph_data(systems, edges, output_file):
    with open(output_file, 'w') as f:
        json.dump({'systems': systems, 'edges': edges}, f, indent=2)

if __name__ == '__main__':
    svg_file = './PrUn_universe_map_normalized.svg'
    output_file = './graph_data.json'

    systems, edges = parse_svg(svg_file)
    save_graph_data(systems, edges, output_file)

    print(f"Graph data saved to {output_file}")
