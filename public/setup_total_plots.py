import json
import urllib.request
import urllib.error
import os
import time

# EXCESSIVE COMMENTING: This script is designed to be run exactly ONE TIME. It builds a permanent local dictionary of the Total Maximum Plots for every planet, bypassing the protected V2 bulk endpoint by polling planets individually.

PLANET_DATA_FILE = os.path.join(os.path.dirname(__file__), "planet_data.json")
CACHE_FILE = os.path.join(os.path.dirname(__file__), "total_plots_cache.json")

def load_json(filepath):
    if not os.path.exists(filepath):
        return None
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(data, filepath):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def run_setup():
    print("Initializing One-Time Total Plots Scraper...")
    planets = load_json(PLANET_DATA_FILE)
    if not planets:
        print(f"Error: Missing base data file {PLANET_DATA_FILE}")
        return

    # Extract both the UUID (for the API) and the Natural ID (for our React Map)
    planet_tuples = []
    for p in planets:
        uuid = p.get("PlanetId")
        nat_id = p.get("PlanetNaturalId")
        if uuid and nat_id:
            planet_tuples.append((uuid, nat_id))

    # Load progress to prevent data loss on connection drops
    cache = load_json(CACHE_FILE) or {}
    to_query = [pt for pt in planet_tuples if pt[1] not in cache]
    
    remaining = len(to_query)
    print(f"Cached: {len(cache)} planets. Remaining: {remaining} planets.")
    
    if remaining == 0:
        print("Setup complete! You never need to run this script again.")
        return
        
    print("Fetching static capacities from FIO. This will take ~1 hour. Progress saves automatically.\n")
    
    count = 0
    for uuid, nat_id in to_query:
        count += 1
        # Querying by specific UUID bypasses the 400 Bad Request bulk error
        url = f"https://api.fnar.net/planet/{uuid}"
        
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Taiyi Map Setup)', 'Accept': 'application/json'})
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                
                # FIO V2 returns the exact total Plots natively here
                total_plots = data.get("Plots", 0)
                cache[nat_id] = total_plots
                print(f"[{count}/{remaining}] {nat_id} -> {total_plots} Total Capacity")
                
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"\n[!] Rate limit hit on {nat_id}. Pausing 15s...")
                time.sleep(15)
                continue
            else:
                print(f"[{count}/{remaining}] HTTP Error {e.code} on {nat_id}. Defaulting to 0.")
                cache[nat_id] = 0
        except Exception as e:
            print(f"[{count}/{remaining}] Network Error on {nat_id}: {e}")
            
        # Save after every successful ping
        save_json(cache, CACHE_FILE)
        time.sleep(1.1)

    print(f"\nSetup complete! Static capacities securely cached to {CACHE_FILE}")

if __name__ == '__main__':
    run_setup()