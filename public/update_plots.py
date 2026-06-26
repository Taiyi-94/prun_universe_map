import json
import urllib.request
import urllib.error
import os
import time

# EXCESSIVE COMMENTING: Core file dependencies. We use the local planet data list as our source of truth to avoid blind iteration.
PLANET_DATA_FILE = os.path.join(os.path.dirname(__file__), "planet_data.json")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "plots_data.json")

def load_json(filepath):
    if not os.path.exists(filepath):
        return None
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(data, filepath):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def update_plots_data():
    print("Initializing FIO Congestion Scraper...")
    planets = load_json(PLANET_DATA_FILE)
    
    if not planets:
        print(f"Error: Missing base data file {PLANET_DATA_FILE}.")
        return

    # Extract all distinct natural planet identifiers safely
    planet_ids = list(set([p.get("PlanetNaturalId") for p in planets if p.get("PlanetNaturalId")]))
    total_planets = len(planet_ids)
    print(f"Parsed {total_planets} unique planets from local data index.")

    # EXCESSIVE COMMENTING: Progress-retaining resume hook. If the connection fails halfway through the 1-hour crawl, re-running this script will pick up exactly where it left off instead of wiping your cache.
    parsed_data = load_json(OUTPUT_FILE) or {}
    planets_to_query = [pid for pid in planet_ids if pid not in parsed_data]
    remaining = len(planets_to_query)
    
    print(f"Cached status: {len(parsed_data)} complete. {remaining} items remaining.")
    if remaining == 0:
        print("Dataset is entirely up to date!")
        return

    print("Executing lookups. Progress is saved instantaneously. Interrupt safely via Ctrl+C.\n")

    count = 0
    for planet_id in planets_to_query:
        count += 1
        # EXCESSIVE COMMENTING: We target the specific FIO planetary sites count module discovered in the Swagger logs.
        endpoint = f"https://rest.fnar.net/planet/sitescount/{planet_id}"
        
        try:
            req = urllib.request.Request(
                endpoint, 
                headers={'User-Agent': 'Mozilla/5.0 (Taiyi Map Editor Heuristic Tracker)'}
            )
            with urllib.request.urlopen(req) as response:
                raw_response = response.read().decode()
                data = json.loads(raw_response)
                
                # EXCESSIVE COMMENTING: Handle both integer returns and dictionary responses depending on the FIO deployment version.
                if isinstance(data, int):
                    parsed_data[planet_id] = data
                elif isinstance(data, dict):
                    parsed_data[planet_id] = data.get("SiteCount", data.get("count", 0))
                else:
                    parsed_data[planet_id] = 0
                
            print(f"[{count}/{remaining}] Polled {planet_id}: {parsed_data[planet_id]} sites recorded.")

        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"\n[!] Rate limit triggered on {planet_id}. FIO server throttling active.")
                print("Pausing execution for 15 seconds to obey API guidelines...")
                time.sleep(15)
                continue
            elif e.code == 404:
                print(f"[{count}/{remaining}] 404 Warning: {planet_id} missing site records. Defaulting to 0.")
                parsed_data[planet_id] = 0
            else:
                print(f"[{count}/{remaining}] Network Failure Code {e.code} encountered on {planet_id}. Skipping instance.")
        except Exception as e:
            print(f"[{count}/{remaining}] Thread blocker on {planet_id}: {e}")

        # Commit current cache mapping to local disk immediately
        save_json(parsed_data, OUTPUT_FILE)

        # EXCESSIVE COMMENTING: Mandated 1.1-second sleep throttle to remain perfectly polite to the volunteer crowdsourced FIO architecture.
        time.sleep(1.1)

    print(f"\nCongestion map generation successful! Cache committed securely to {OUTPUT_FILE}")

if __name__ == "__main__":
    update_plots_data()