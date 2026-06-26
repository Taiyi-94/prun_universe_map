import json
import urllib.request
import os

# ---------------------------------------------------------
# FIO API ENDPOINT RESEARCH REQUIRED
# ---------------------------------------------------------
# We need to replace the URL below with the correct endpoint
# from https://doc.fnar.net/ that returns planetary plot data.
FIO_PLOTS_ENDPOINT = "https://rest.fnar.net/placeholder/endpoint/for/plots"
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "plots_data.json")

def update_plots_data():
    print(f"Fetching plot data from {FIO_PLOTS_ENDPOINT}...")
    try:
        req = urllib.request.Request(
            FIO_PLOTS_ENDPOINT, 
            headers={'User-Agent': 'Mozilla/5.0 (Taiyi Map Editor)'}
        )
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
        
        # ---------------------------------------------------------
        # DATA PARSING REQUIRED
        # ---------------------------------------------------------
        # Once we know the shape of the data, we will parse it 
        # into a simple Dictionary: { "PlanetNaturalId": AvailablePlotsInteger }
        # Example: { "KW-688c": 15, "UV-351a": 0 }
        
        parsed_data = {}
        
        # NOTE: This loop will need to be adjusted based on the API response structure
        # for item in data:
        #     planet_id = item.get("PlanetNaturalId")
        #     available_plots = item.get("PlotsAvailable", 0)
        #     parsed_data[planet_id] = available_plots
            
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(parsed_data, f)
            
        print(f"Successfully updated {OUTPUT_FILE}")

    except Exception as e:
        print(f"Error fetching plot data: {e}")

if __name__ == "__main__":
    update_plots_data()