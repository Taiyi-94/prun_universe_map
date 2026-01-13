import os
import json
import csv
import sys
import math
import argparse
import io

# Configuration
CSV_URL = "https://rest.fnar.net/csv/infrastructure/allreports"
DEFAULT_OUTPUT = "population_data.json"

TIERS = ['Pioneer', 'Settler', 'Technician', 'Engineer', 'Scientist']

def fetch_csv_data(url):
    """
    Downloads CSV data into memory and returns a csv.DictReader object.
    Does not save to disk.
    """
    print(f"Downloading fresh data from {url}...")
    
    try:
        # Try using requests first (better timeout/error handling)
        import requests
        response = requests.get(url)
        response.raise_for_status()
        # response.text provides the decoded unicode string
        return csv.DictReader(io.StringIO(response.text))
        
    except ImportError:
        # Fallback to standard library urllib
        print("'requests' library not found, using 'urllib'...")
        import urllib.request
        with urllib.request.urlopen(url) as response:
            # Decode bytes to string
            content = response.read().decode('utf-8')
            return csv.DictReader(io.StringIO(content))
            
    except Exception as e:
        print(f"Error downloading data: {e}")
        sys.exit(1)

def parse_row_value(row, key, default=0):
    val = row.get(key, default)
    if not val: return default
    try:
        return float(val)
    except ValueError:
        return default

def process_data(reader):
    """
    Iterates through the CSV reader and keeps only the LATEST record for each planet.
    Returns a dictionary keyed by PlanetNaturalId.
    """
    latest_records = {}
    
    # Pass 1: Find the latest timestamp for every planet
    # We do this in memory.
    for row in reader:
        pid = row['PlanetNaturalId']
        
        try:
            ts = int(row['TimestampMs'])
        except (ValueError, TypeError):
            continue # Skip malformed rows
            
        if pid not in latest_records or ts > latest_records[pid]['_parsed_ts']:
            row['_parsed_ts'] = ts
            latest_records[pid] = row

    # Pass 2: Calculate specific metrics for the export
    processed_data = {}
    
    for pid, row in latest_records.items():
        workforce_data = {}
        
        for tier in TIERS:
            pop = parse_row_value(row, f'NextPopulation{tier}')
            unemployment_rate = parse_row_value(row, f'UnemploymentRate{tier}')
            reported_open_jobs = parse_row_value(row, f'OpenJobs{tier}')
            pop_diff = parse_row_value(row, f'PopulationDifference{tier}')
            
            # 1. Calculate Previous State (Before the change occurred)
            prev_pop = pop - pop_diff
            prev_unemployed = math.floor(max(0, prev_pop) * unemployment_rate)
            
            # 2. Calculate Net Available Workers
            available_workers = prev_unemployed + pop_diff
            
            unemployed = 0
            true_open_jobs = 0

            # 3. Resolve Matching (Workers vs Reported Open Jobs)
            if available_workers > 0:
                filled_jobs = min(available_workers, reported_open_jobs)
                unemployed = available_workers - filled_jobs
                true_open_jobs = reported_open_jobs - filled_jobs
            else:
                unemployed = 0
                true_open_jobs = reported_open_jobs + abs(available_workers)

            workforce_data[tier] = {
                "Population": int(pop),
                "Unemployed": int(max(0, unemployed)),
                "OpenJobs": int(max(0, true_open_jobs))
            }

        processed_data[pid] = {
            "PlanetNaturalId": pid,
            "PlanetName": row['PlanetName'],
            "Timestamp": int(row['_parsed_ts']),
            "ExplorersGrace": row['ExplorersGraceEnabled'] == 'True',
            "Workforce": workforce_data
        }

    return processed_data

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=str, default=DEFAULT_OUTPUT, help="Output JSON path")
    args = parser.parse_args()

    # 1. Fetch
    csv_reader = fetch_csv_data(CSV_URL)
    
    # 2. Process
    print("Processing data in memory...")
    data = process_data(csv_reader)

    # 3. Export
    print(f"Exporting processed data to {args.output}...")
    try:
        with open(args.output, 'w') as f:
            json.dump(data, f)
        print("Success.")
    except Exception as e:
        print(f"Error writing output file: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
