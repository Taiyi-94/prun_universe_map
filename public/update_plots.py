import json
import urllib.request
import os
import sys
import argparse

# EXCESSIVE COMMENTING: This is the lightning-fast daily updater. It utilizes the one-time generated cache to perform a subtraction operation against the instant bulk FIO sitecounts endpoint.

DEFAULT_CACHE_FILE = os.path.join(os.path.dirname(__file__), "total_plots_cache.json")
DEFAULT_OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "plots_data.json")
URL_SITECOUNTS = "https://api.fnar.net/planet/sitecount?include_non_player_sites=true"

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Taiyi Map Updater)'})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

def update_plots_data(cache_file=DEFAULT_CACHE_FILE, output_file=DEFAULT_OUTPUT_FILE):
    print("Initiating instant availability calculation...")

    if not os.path.exists(cache_file):
        print(f"ERROR: {cache_file} not found!")
        print("Please run 'python3 setup_total_plots.py' once to generate the static plot capacities.")
        sys.exit(1)

    with open(cache_file, 'r', encoding='utf-8') as f:
        total_plots_map = json.load(f)
        
    try:
        print(f"Fetching active site counts from {URL_SITECOUNTS}...")
        sites_data = fetch_json(URL_SITECOUNTS)
        
        # 1. Map PlanetNaturalId -> Used Plots
        used_plots_map = {}
        for s in sites_data:
            nat_id = s.get("PlanetNaturalId")
            if nat_id:
                used_plots_map[nat_id] = s.get("Count", 0)
                
        print("Calculating exact availability (Total - Used)...")
        
        # 2. Perform the exact math
        available_plots_map = {}
        for nat_id, total_capacity in total_plots_map.items():
            used = used_plots_map.get(nat_id, 0)
            # Ensure we never drop below 0 due to API desync quirks
            available = max(0, total_capacity - used)
            available_plots_map[nat_id] = available
            
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(available_plots_map, f, indent=2)

        print(f"Success! Exact availability mapped for {len(available_plots_map)} planets. Saved to {output_file}")

    except Exception as e:
        print(f"Error fetching live data: {e}")
        sys.exit(1)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Generate plots_data.json from the static cache and live FIO sitecounts.")
    parser.add_argument("--cache", default=DEFAULT_CACHE_FILE, help="Path to total_plots_cache.json")
    parser.add_argument("--output", default=DEFAULT_OUTPUT_FILE, help="Path to write plots_data.json")
    cli_args = parser.parse_args()
    update_plots_data(cache_file=cli_args.cache, output_file=cli_args.output)