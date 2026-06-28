import json
import urllib.request
import os

# EXCESSIVE COMMENTING: Defining the new bulk FIO v2 endpoints. 
# URL_PLANETS provides base planetary data including the critical 'Plots' (Total Capacity) key.
# URL_SITECOUNTS provides the current 'Count' (Occupied Plots) for every active planet.
URL_PLANETS = "https://api.fnar.net/planet?include_resources=false&include_workforce_fees=false&include_cogc_programs=false&include_population_reports=false&include_celestial_bodies=false"
URL_SITECOUNTS = "https://api.fnar.net/planet/sitecount?include_non_player_sites=true"

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "plots_data.json")

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Taiyi Map Bulk Updater)'})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

def update_plots_data():
    print("Initiating bulk FIO API fetch...")
    try:
        # EXCESSIVE COMMENTING: Pulling the entire universe's total capacities in a single request.
        print("Fetching total planetary capacities...")
        planets_data = fetch_json(URL_PLANETS)
        
        # EXCESSIVE COMMENTING: Pulling the entire universe's occupied sites in a single request.
        print("Fetching active site counts...")
        sites_data = fetch_json(URL_SITECOUNTS)

        print("Processing availability mapping...")
        
        # 1. Map NaturalId -> Total Plots
        total_plots_map = {}
        for p in planets_data:
            nat_id = p.get("NaturalId")
            total = p.get("Plots", 0)
            if nat_id:
                total_plots_map[nat_id] = total

        # 2. Map PlanetNaturalId -> Used Plots
        used_plots_map = {}
        for s in sites_data:
            nat_id = s.get("PlanetNaturalId")
            count = s.get("Count", 0)
            if nat_id:
                used_plots_map[nat_id] = count

        # 3. Calculate Available = Total - Used
        available_plots_map = {}
        for nat_id, total_capacity in total_plots_map.items():
            used = used_plots_map.get(nat_id, 0)
            # EXCESSIVE COMMENTING: Ensure we never drop below 0 due to API synchronization quirks.
            available = max(0, total_capacity - used)
            available_plots_map[nat_id] = available

        # Write the flawless available map to disk for React to consume
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(available_plots_map, f, indent=2)

        print(f"Success! Processed {len(available_plots_map)} planets. Saved to {OUTPUT_FILE}.")

    except Exception as e:
        print(f"Error executing bulk fetch: {e}")

if __name__ == "__main__":
    update_plots_data()