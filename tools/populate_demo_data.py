import json
import sqlite3
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from datetime import datetime, timezone
import random

# Base paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "countries"
COUNTRY_CODES = ["PH", "TH", "VN", "MY", "ID"]

OSRM_URL = "http://router.project-osrm.org/route/v1/driving/"

def fetch_polyline(coords):
    """
    coords: list of (lat, lon)
    Returns list of (lon, lat) representing the polyline.
    """
    coord_str = ";".join([f"{lon},{lat}" for lat, lon in coords])
    url = f"{OSRM_URL}{coord_str}?geometries=geojson&overview=full"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'LoadSenseDemo/1.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data["code"] == "Ok":
                return data["routes"][0]["geometry"]["coordinates"]
    except Exception as e:
        print(f"Error fetching route for {coords}: {e}")
    
    # Fallback to straight line
    result = []
    if len(coords) >= 2:
        for i in range(len(coords) - 1):
            lat1, lon1 = coords[i]
            lat2, lon2 = coords[i+1]
            steps = 10
            for j in range(steps):
                lat = lat1 + (lat2 - lat1) * (j / steps)
                lon = lon1 + (lon2 - lon1) * (j / steps)
                result.append([lon, lat])
        result.append([coords[-1][1], coords[-1][0]])
    return result

def wipe_db(conn):
    tables = [
        "routes", "route_points", "vehicles", "vehicle_states",
        "telemetry_logs", "operator_alerts", "operator_feedback", "chatbot_queries"
    ]
    for table in tables:
        conn.execute(f"DELETE FROM {table};")
    conn.commit()

CEBU_ROUTES = [
    {"id": "PH-MJ01", "name": "eJeep Naga - IT Park", "type": "PUJ", "origin": [10.2078, 123.757], "dest": [10.3285, 123.9061], "tag": "NAGA-IT"},
    {"id": "PH-MJ02", "name": "eJeep Minglanilla - IT Park", "type": "PUJ", "origin": [10.245, 123.796], "dest": [10.3285, 123.9061], "tag": "MING-IT"},
    {"id": "PH-MJ03", "name": "eJeep Consolacion - IT Park", "type": "PUJ", "origin": [10.395, 123.957], "dest": [10.3285, 123.9061], "tag": "CONS-IT"},
    {"id": "PH-MJ04", "name": "eJeep Liloan - IT Park", "type": "PUJ", "origin": [10.4, 123.985], "dest": [10.3285, 123.9061], "tag": "LIL-IT"},
    {"id": "PH-CIBUS", "name": "CIBUS IT Park - SM Seaside", "type": "BUS", "origin": [10.3285, 123.9061], "dest": [10.2811, 123.8811], "tag": "CIBUS"},
    {"id": "PH-KMK", "name": "KMK Naga - SM Seaside", "type": "BUS", "origin": [10.2078, 123.757], "dest": [10.2811, 123.8811], "tag": "KMK"},
    {"id": "PH-MYBUS1", "name": "MyBus SM City - Airport", "type": "BUS", "origin": [10.3115, 123.9182], "dest": [10.3251, 123.9781], "tag": "MYBUS"},
    {"id": "PH-MYBUS2", "name": "MyBus SM Seaside - SM City", "type": "BUS", "origin": [10.2811, 123.8811], "dest": [10.3115, 123.9182], "tag": "MYBUS"},
    {"id": "PH-MYBUS3", "name": "MyBus Talisay - SM Seaside", "type": "BUS", "origin": [10.258, 123.834], "dest": [10.2811, 123.8811], "tag": "MYBUS"},
    {"id": "PH-CERES-S", "name": "Ceres Cebu - Carcar", "type": "BUS", "origin": [10.2981, 123.8941], "dest": [10.1065, 123.6391], "tag": "CERES-S"},
    {"id": "PH-CERES-N", "name": "Ceres Cebu - Danao", "type": "BUS", "origin": [10.3155, 123.9215], "dest": [10.512, 124.025], "tag": "CERES-N"},
    {"id": "PH-44", "name": "44 Naga - Basak", "type": "PUJ", "origin": [10.2078, 123.757], "dest": [10.2881, 123.8761], "tag": "44"},
    {"id": "PH-44A", "name": "44A Naga - Carbon", "type": "PUJ", "origin": [10.2078, 123.757], "dest": [10.2932, 123.8988], "tag": "44A"},
    {"id": "PH-43D", "name": "43D Tungkop - Carbon", "type": "PUJ", "origin": [10.235, 123.786], "dest": [10.2932, 123.8988], "tag": "43D"},
    {"id": "PH-42D", "name": "42D Minglanilla - Carbon", "type": "PUJ", "origin": [10.245, 123.796], "dest": [10.2932, 123.8988], "tag": "42D"},
    {"id": "PH-41D", "name": "41D Tabunok - Carbon", "type": "PUJ", "origin": [10.258, 123.834], "dest": [10.2932, 123.8988], "tag": "41D"},
    {"id": "PH-24", "name": "24 Consolacion - SM City", "type": "PUJ", "origin": [10.395, 123.957], "dest": [10.3115, 123.9182], "tag": "24"},
    {"id": "PH-25", "name": "25 Liloan - SM City", "type": "PUJ", "origin": [10.4, 123.985], "dest": [10.3115, 123.9182], "tag": "25"},
    {"id": "PH-26", "name": "26 Compostela - SM City", "type": "PUJ", "origin": [10.457, 124.011], "dest": [10.3115, 123.9182], "tag": "26"},
    {"id": "PH-27", "name": "27 Danao - SM City", "type": "PUJ", "origin": [10.512, 124.025], "dest": [10.3115, 123.9182], "tag": "27"},
    {"id": "PH-54A", "name": "54A Cordova - Lapu-Lapu", "type": "PUJ", "origin": [10.25, 123.949], "dest": [10.313, 123.949], "tag": "54A"},
    {"id": "PH-23D", "name": "23D Opon - Parkmall", "type": "PUJ", "origin": [10.313, 123.949], "dest": [10.3262, 123.9352], "tag": "23D"},
    {"id": "PH-20A", "name": "20A Mandaue - Ayala", "type": "PUJ", "origin": [10.3341, 123.9431], "dest": [10.3181, 123.9051], "tag": "20A"},
    {"id": "PH-21A", "name": "21A Mandaue - Manalili (via Mabolo)", "type": "PUJ", "origin": [10.3341, 123.9431], "dest": [10.2951, 123.9021], "tag": "21A"},
    {"id": "PH-21B", "name": "21B Mandaue - Manalili", "type": "PUJ", "origin": [10.3341, 123.9431], "dest": [10.2951, 123.9021], "tag": "21B"},
    {"id": "PH-21D", "name": "21D Mandaue - Manalili (via Highway)", "type": "PUJ", "origin": [10.3341, 123.9431], "dest": [10.2951, 123.9021], "tag": "21D"},
    {"id": "PH-22D", "name": "22D Ouano - Manalili", "type": "PUJ", "origin": [10.3241, 123.9311], "dest": [10.2951, 123.9021], "tag": "22D"},
    {"id": "PH-22I", "name": "22I Ouano - SM", "type": "PUJ", "origin": [10.3241, 123.9311], "dest": [10.3115, 123.9182], "tag": "22I"},
    {"id": "PH-01A", "name": "01A Urgello - Pier Area", "type": "PUJ", "origin": [10.3015, 123.8951], "dest": [10.2941, 123.9041], "tag": "01A"},
    {"id": "PH-01B", "name": "01B Urgello - Pier Area", "type": "PUJ", "origin": [10.3015, 123.8951], "dest": [10.2941, 123.9041], "tag": "01B"},
    {"id": "PH-01C", "name": "01C Urgello - Pier Area", "type": "PUJ", "origin": [10.3015, 123.8951], "dest": [10.2941, 123.9041], "tag": "01C"},
    {"id": "PH-01K", "name": "01K Urgello - Parkmall", "type": "PUJ", "origin": [10.3015, 123.8951], "dest": [10.3262, 123.9352], "tag": "01K"},
    {"id": "PH-03B", "name": "03B Mabolo - Colon", "type": "PUJ", "origin": [10.3151, 123.9131], "dest": [10.2974, 123.8997], "tag": "03B"},
    {"id": "PH-03A", "name": "03A Mabolo - Carbon", "type": "PUJ", "origin": [10.3151, 123.9131], "dest": [10.2932, 123.8988], "tag": "03A"},
    {"id": "PH-04B", "name": "04B Lahug - Carbon", "type": "PUJ", "origin": [10.3283, 123.8984], "dest": [10.2932, 123.8988], "tag": "04B"},
    {"id": "PH-04C", "name": "04C Lahug - Ramos", "type": "PUJ", "origin": [10.3283, 123.8984], "dest": [10.3091, 123.8991], "tag": "04C"},
    {"id": "PH-04D", "name": "04D Lahug - Carbon (via Escario)", "type": "PUJ", "origin": [10.3283, 123.8984], "dest": [10.2932, 123.8988], "tag": "04D"},
    {"id": "PH-04H", "name": "04H Lahug - Plaza Housing", "type": "PUJ", "origin": [10.3283, 123.8984], "dest": [10.3421, 123.8891], "tag": "04H"},
    {"id": "PH-04L", "name": "04L Lahug - SM City", "type": "PUJ", "origin": [10.3283, 123.8984], "dest": [10.3115, 123.9182], "tag": "04L"},
    {"id": "PH-04M", "name": "04M Lahug - SM City", "type": "PUJ", "origin": [10.3283, 123.8984], "dest": [10.3115, 123.9182], "tag": "04M"},
    {"id": "PH-06B", "name": "06B Guadalupe - Carbon", "type": "PUJ", "origin": [10.3221, 123.8831], "dest": [10.2932, 123.8988], "tag": "06B"},
    {"id": "PH-06C", "name": "06C Guadalupe - Colon", "type": "PUJ", "origin": [10.3221, 123.8831], "dest": [10.2974, 123.8997], "tag": "06C"},
    {"id": "PH-06G", "name": "06G Taboan - Guadalupe", "type": "PUJ", "origin": [10.2951, 123.8891], "dest": [10.3221, 123.8831], "tag": "06G"},
    {"id": "PH-07B", "name": "07B Banawa - Carbon", "type": "PUJ", "origin": [10.3151, 123.8811], "dest": [10.2932, 123.8988], "tag": "07B"},
    {"id": "PH-08F", "name": "08F Basak - Carbon", "type": "PUJ", "origin": [10.2881, 123.8761], "dest": [10.2932, 123.8988], "tag": "08F"},
    {"id": "PH-08G", "name": "08G Alumnos - Colon", "type": "PUJ", "origin": [10.2851, 123.8811], "dest": [10.2974, 123.8997], "tag": "08G"},
    {"id": "PH-09C", "name": "09C Basak - Colon", "type": "PUJ", "origin": [10.2881, 123.8761], "dest": [10.2974, 123.8997], "tag": "09C"},
    {"id": "PH-09F", "name": "09F Basak - Colon", "type": "PUJ", "origin": [10.2881, 123.8761], "dest": [10.2974, 123.8997], "tag": "09F"},
    {"id": "PH-10F", "name": "10F Bulacao - Carbon", "type": "PUJ", "origin": [10.2781, 123.8561], "dest": [10.2932, 123.8988], "tag": "10F"},
    {"id": "PH-10H", "name": "10H Bulacao - SM", "type": "PUJ", "origin": [10.2781, 123.8561], "dest": [10.3115, 123.9182], "tag": "10H"},
    {"id": "PH-10M", "name": "10M Bulacao - SM (via Ayala)", "type": "PUJ", "origin": [10.2781, 123.8561], "dest": [10.3115, 123.9182], "tag": "10M"},
    {"id": "PH-11A", "name": "11A Inayawan - Carbon", "type": "PUJ", "origin": [10.275, 123.865], "dest": [10.2932, 123.8988], "tag": "11A"},
    {"id": "PH-12D", "name": "12D Labangon - Carbon", "type": "PUJ", "origin": [10.3011, 123.8761], "dest": [10.2932, 123.8988], "tag": "12D"},
    {"id": "PH-12G", "name": "12G Labangon - SM", "type": "PUJ", "origin": [10.3011, 123.8761], "dest": [10.3115, 123.9182], "tag": "12G"},
    {"id": "PH-12L", "name": "12L Labangon - Ayala", "type": "PUJ", "origin": [10.3011, 123.8761], "dest": [10.3181, 123.9051], "tag": "12L"},
    {"id": "PH-13B", "name": "13B Talamban - Carbon", "type": "PUJ", "origin": [10.3601, 123.9142], "dest": [10.2932, 123.8988], "tag": "13B"},
    {"id": "PH-13C", "name": "13C Talamban - Colon", "type": "PUJ", "origin": [10.3601, 123.9142], "dest": [10.2974, 123.8997], "tag": "13C"},
    {"id": "PH-14D", "name": "14D Ayala - Downtown", "type": "PUJ", "origin": [10.3181, 123.9051], "dest": [10.2982, 123.8981], "tag": "14D"},
    {"id": "PH-15", "name": "15 Oppra - Carbon", "type": "PUJ", "origin": [10.329, 123.886], "dest": [10.2932, 123.8988], "tag": "15"},
    {"id": "PH-17B", "name": "17B IT Park - Colon", "type": "PUJ", "origin": [10.3285, 123.9061], "dest": [10.2962, 123.8993], "tag": "17B"},
    {"id": "PH-17C", "name": "17C IT Park - Carbon", "type": "PUJ", "origin": [10.3285, 123.9061], "dest": [10.2932, 123.8988], "tag": "17C"},
    {"id": "PH-17D", "name": "17D Apas - Carbon", "type": "PUJ", "origin": [10.334, 123.908], "dest": [10.2932, 123.8988], "tag": "17D"},
    {"id": "PH-62B", "name": "62B Pit-os - Carbon", "type": "PUJ", "origin": [10.3951, 123.9211], "dest": [10.2932, 123.8988], "tag": "62B"},
    {"id": "PH-62C", "name": "62C Pit-os - Colon", "type": "PUJ", "origin": [10.3951, 123.9211], "dest": [10.2974, 123.8997], "tag": "62C"}
]

OTHER_PH_ROUTES = [
    {"id": "PH-MNL01", "name": "EDSA Carousel (Monument - PITX)", "type": "BUS", "origin": (14.6561, 120.9851), "dest": (14.5101, 120.9901), "tag": "EDSA"},
    {"id": "PH-MNL02", "name": "Jeep: Cubao - Divisoria", "type": "PUJ", "origin": (14.6191, 121.0511), "dest": (14.6031, 120.9711), "tag": "CUB-DIV"},
    {"id": "PH-MNL03", "name": "Jeep: Baclaran - Quiapo", "type": "PUJ", "origin": (14.5331, 120.9921), "dest": (14.5981, 120.9831), "tag": "BAC-QPO"},
    {"id": "PH-MNL04", "name": "Jeep: Fairview - City Hall", "type": "PUJ", "origin": (14.7081, 121.0661), "dest": (14.6461, 121.0481), "tag": "FRV-CTY"},
    {"id": "PH-MNL05", "name": "BGC Bus: East Route", "type": "BUS", "origin": (14.5511, 121.0281), "dest": (14.5461, 121.0561), "tag": "BGC-EST"},
    {"id": "PH-DVO01", "name": "Davao Route 1", "type": "PUJ", "origin": (7.0731, 125.6121), "dest": (7.0621, 125.5901), "tag": "DVO1"},
    {"id": "PH-DVO02", "name": "Davao Route 2", "type": "PUJ", "origin": (7.0851, 125.6201), "dest": (7.0501, 125.5801), "tag": "DVO2"},
    {"id": "PH-DVO03", "name": "Davao Route 3", "type": "PUJ", "origin": (7.1001, 125.6301), "dest": (7.0731, 125.6121), "tag": "DVO3"},
    {"id": "PH-ILO01", "name": "Iloilo City Proper - Jaro", "type": "PUJ", "origin": (10.6951, 122.5641), "dest": (10.7251, 122.5561), "tag": "ILO1"},
    {"id": "PH-ILO02", "name": "Iloilo City Proper - Molo", "type": "PUJ", "origin": (10.6951, 122.5641), "dest": (10.6981, 122.5441), "tag": "ILO2"}
]

TH_ROUTES = [
    {"id": "TH-01", "name": "BTS Sukhumvit Line", "type": "TRAIN", "origin": (13.8021, 100.5531), "dest": (13.6691, 100.6121), "tag": "BTS-SUK"},
    {"id": "TH-02", "name": "BTS Silom Line", "type": "TRAIN", "origin": (13.7281, 100.5281), "dest": (13.7221, 100.4951), "tag": "BTS-SIL"},
    {"id": "TH-03", "name": "MRT Blue Line", "type": "TRAIN", "origin": (13.8051, 100.5361), "dest": (13.7381, 100.5601), "tag": "MRT-BLU"},
    {"id": "TH-04", "name": "Bus 1: Sanam Luang - Mo Chit", "type": "BUS", "origin": (13.7551, 100.4931), "dest": (13.8021, 100.5531), "tag": "BUS1"},
    {"id": "TH-05", "name": "Bus 2: Samrong - Asok", "type": "BUS", "origin": (13.6461, 100.5961), "dest": (13.7361, 100.5611), "tag": "BUS2"},
    {"id": "TH-06", "name": "Bus 3: Bang Kapi - Victory Monument", "type": "BUS", "origin": (13.7661, 100.6431), "dest": (13.7641, 100.5381), "tag": "BUS3"},
    {"id": "TH-07", "name": "Bus 4: Hua Lamphong - MBK", "type": "BUS", "origin": (13.7371, 100.5161), "dest": (13.7441, 100.5291), "tag": "BUS4"},
    {"id": "TH-08", "name": "Bus 5: Khaosan - Pratunam", "type": "BUS", "origin": (13.7591, 100.4971), "dest": (13.7511, 100.5401), "tag": "BUS5"},
    {"id": "TH-09", "name": "Bus 6: Ekkamai - Suvarnabhumi", "type": "BUS", "origin": (13.7191, 100.5831), "dest": (13.6891, 100.7501), "tag": "BUS6"},
    {"id": "TH-10", "name": "Bus 7: Don Mueang - Mochit", "type": "BUS", "origin": (13.9121, 100.5951), "dest": (13.8021, 100.5531), "tag": "BUS7"}
]

VN_ROUTES = [
    {"id": "VN-01", "name": "Bus 1: Ben Thanh - Cho Lon", "type": "BUS", "origin": (10.7711, 106.6971), "dest": (10.7491, 106.6521), "tag": "BUS1"},
    {"id": "VN-02", "name": "Bus 2: Mien Dong - Mien Tay", "type": "BUS", "origin": (10.8141, 106.7111), "dest": (10.7381, 106.6181), "tag": "BUS2"},
    {"id": "VN-03", "name": "Bus 3: District 1 - District 7", "type": "BUS", "origin": (10.7761, 106.7001), "dest": (10.7321, 106.7131), "tag": "BUS3"},
    {"id": "VN-04", "name": "Bus 4: Airport - City Center", "type": "BUS", "origin": (10.8141, 106.6661), "dest": (10.7711, 106.6971), "tag": "BUS4"},
    {"id": "VN-05", "name": "Bus 5: Hanoi Old Quarter - Giap Bat", "type": "BUS", "origin": (21.0321, 105.8521), "dest": (20.9761, 105.8421), "tag": "BUS5"},
    {"id": "VN-06", "name": "Bus 6: Hanoi Railway - Noi Bai", "type": "BUS", "origin": (21.0241, 105.8411), "dest": (21.2181, 105.8041), "tag": "BUS6"},
    {"id": "VN-07", "name": "Bus 7: My Dinh - Long Bien", "type": "BUS", "origin": (21.0281, 105.7781), "dest": (21.0401, 105.8481), "tag": "BUS7"},
    {"id": "VN-08", "name": "Bus 8: HCMC D1 - Thu Duc", "type": "BUS", "origin": (10.7711, 106.6971), "dest": (10.8501, 106.7571), "tag": "BUS8"},
    {"id": "VN-09", "name": "Bus 9: HCMC D3 - Tan Binh", "type": "BUS", "origin": (10.7821, 106.6851), "dest": (10.8011, 106.6471), "tag": "BUS9"},
    {"id": "VN-10", "name": "Bus 10: HCMC D5 - D10", "type": "BUS", "origin": (10.7551, 106.6661), "dest": (10.7731, 106.6651), "tag": "BUS10"}
]

MY_ROUTES = [
    {"id": "MY-01", "name": "Kelana Jaya Line", "type": "TRAIN", "origin": (3.2301, 101.7241), "dest": (3.0041, 101.5831), "tag": "KJL"},
    {"id": "MY-02", "name": "Ampang Line", "type": "TRAIN", "origin": (3.1801, 101.6951), "dest": (3.0501, 101.7611), "tag": "AMP"},
    {"id": "MY-03", "name": "Sri Petaling Line", "type": "TRAIN", "origin": (3.1801, 101.6951), "dest": (3.0031, 101.6041), "tag": "SPL"},
    {"id": "MY-04", "name": "KL Monorail", "type": "TRAIN", "origin": (3.1341, 101.6861), "dest": (3.1691, 101.6981), "tag": "MONO"},
    {"id": "MY-05", "name": "GoKL City Bus - Green Line", "type": "BUS", "origin": (3.1581, 101.7111), "dest": (3.1461, 101.7111), "tag": "GOKL-G"},
    {"id": "MY-06", "name": "GoKL City Bus - Purple Line", "type": "BUS", "origin": (3.1411, 101.6981), "dest": (3.1461, 101.7141), "tag": "GOKL-P"},
    {"id": "MY-07", "name": "RapidKL U82", "type": "BUS", "origin": (3.1341, 101.6861), "dest": (3.1551, 101.6211), "tag": "U82"},
    {"id": "MY-08", "name": "RapidKL U83", "type": "BUS", "origin": (3.1341, 101.6861), "dest": (3.1651, 101.6411), "tag": "U83"},
    {"id": "MY-09", "name": "RapidKL U84", "type": "BUS", "origin": (3.1341, 101.6861), "dest": (3.1751, 101.6511), "tag": "U84"},
    {"id": "MY-10", "name": "RapidKL U85", "type": "BUS", "origin": (3.1341, 101.6861), "dest": (3.1851, 101.6611), "tag": "U85"}
]

ID_ROUTES = [
    {"id": "ID-01", "name": "TransJakarta Corridor 1", "type": "BUS", "origin": (-6.2431, 106.7981), "dest": (-6.1361, 106.8141), "tag": "K1"},
    {"id": "ID-02", "name": "TransJakarta Corridor 2", "type": "BUS", "origin": (-6.1661, 106.8221), "dest": (-6.1821, 106.9031), "tag": "K2"},
    {"id": "ID-03", "name": "TransJakarta Corridor 3", "type": "BUS", "origin": (-6.1551, 106.7161), "dest": (-6.1621, 106.7931), "tag": "K3"},
    {"id": "ID-04", "name": "TransJakarta Corridor 4", "type": "BUS", "origin": (-6.1821, 106.9031), "dest": (-6.2021, 106.8241), "tag": "K4"},
    {"id": "ID-05", "name": "TransJakarta Corridor 5", "type": "BUS", "origin": (-6.1211, 106.8331), "dest": (-6.2241, 106.8661), "tag": "K5"},
    {"id": "ID-06", "name": "TransJakarta Corridor 6", "type": "BUS", "origin": (-6.2921, 106.8201), "dest": (-6.2021, 106.8241), "tag": "K6"},
    {"id": "ID-07", "name": "TransJakarta Corridor 7", "type": "BUS", "origin": (-6.3031, 106.8661), "dest": (-6.2241, 106.8661), "tag": "K7"},
    {"id": "ID-08", "name": "TransJakarta Corridor 8", "type": "BUS", "origin": (-6.2841, 106.7721), "dest": (-6.1661, 106.8221), "tag": "K8"},
    {"id": "ID-09", "name": "TransJakarta Corridor 9", "type": "BUS", "origin": (-6.2361, 106.8821), "dest": (-6.1361, 106.8141), "tag": "K9"},
    {"id": "ID-10", "name": "TransJakarta Corridor 10", "type": "BUS", "origin": (-6.1091, 106.8791), "dest": (-6.2621, 106.8761), "tag": "K10"}
]

ALL_COUNTRY_DATA = {
    "PH": CEBU_ROUTES + OTHER_PH_ROUTES,
    "TH": TH_ROUTES,
    "VN": VN_ROUTES,
    "MY": MY_ROUTES,
    "ID": ID_ROUTES
}

def parse_endpoints(name: str):
    parts = name.split(" - ")
    if len(parts) == 2:
        p1 = parts[0].replace("(", "").strip()
        p2 = parts[1].replace(")", "").strip()
        if ": " in p1:
            p1 = p1.split(": ", 1)[1]
        else:
            words = p1.split(" ")
            if len(words) >= 2 and (words[0].isupper() or any(c.isdigit() for c in words[0]) or words[0].lower() in ['mybus', 'bus', 'jeep']):
                p1 = " ".join(words[1:])
        if " (via " in p2:
            p2 = p2.split(" (via ")[0]
        elif " via " in p2:
            p2 = p2.split(" via ")[0]
        return p1.strip(), p2.strip()
    elif "Line" in name or "Monorail" in name:
        return "Start Station", "End Station"
    return "Origin", "Destination"

def generate_vehicles_for_route(route, country):
    num_vehicles = random.randint(5, 12)
    vehicles = []
    for i in range(num_vehicles):
        v_id = f"V-{route['id']}-{i+1}"
        vehicles.append({
            "vehicle_id": v_id,
            "country": country,
            "route": route["id"],
            "driver": f"Driver {random.randint(1000, 9999)}",
            "max_occupancy": 20 if route["type"] == "PUJ" else 60,
            "brand": "Isuzu" if route["type"] == "PUJ" else "Volvo",
            "model": "Jeepney" if route["type"] == "PUJ" else "Bus",
            "plate_number": f"{chr(random.randint(65,90))}{chr(random.randint(65,90))}{chr(random.randint(65,90))}-{random.randint(100,999)}",
            "vehicle_type": route["type"],
            "year": random.randint(2010, 2024),
            "registration_number": f"REG-{random.randint(100000, 999999)}",
            "status": "active"
        })
    return vehicles

def run():
    for country in COUNTRY_CODES:
        print(f"Processing {country}...")
        country_dir = DATA_DIR / country
        db_path = country_dir / "loadsense.sqlite"
        routes_dir = country_dir / "routes"
        routes_dir.mkdir(parents=True, exist_ok=True)
        geojson_path = routes_dir / f"{country}_routes.geojson"
        
        # 1. Connect and wipe DB
        conn = sqlite3.connect(db_path)
        wipe_db(conn)
        
        # 2. Generate features and insert DB
        features = []
        routes_to_process = ALL_COUNTRY_DATA.get(country, [])
        
        for r_data in routes_to_process:
            print(f"  Generating polyline for {r_data['name']}...")
            coords = [r_data["origin"], r_data["dest"]]
            polyline_lonlat = fetch_polyline(coords)
            time.sleep(0.2) # Avoid rate limits
            
            orig, dest = parse_endpoints(r_data["name"])
            
            def determine_region(route_id, country, name):
                if country == "PH":
                    if route_id.startswith("PH-MNL"): return "Metro Manila"
                    if route_id.startswith("PH-DVO"): return "Davao Region"
                    if route_id.startswith("PH-ILO"): return "Western Visayas"
                    return "Cebu"
                elif country == "TH":
                    return "Bangkok"
                elif country == "VN":
                    if "Hanoi" in name or "My Dinh" in name:
                        return "Hanoi"
                    return "Ho Chi Minh City"
                elif country == "MY":
                    return "Klang Valley"
                elif country == "ID":
                    return "Jakarta"
                return "Other"
                
            region_name = determine_region(r_data["id"], country, r_data["name"])
            
            feature = {
                "type": "Feature",
                "properties": {
                    "route_id": r_data["id"],
                    "route_name": r_data["name"],
                    "route_type": r_data["type"],
                    "route_ref": r_data["tag"],
                    "origin_name": orig,
                    "destination_name": dest,
                    "region": region_name,
                    "province": region_name
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": polyline_lonlat
                }
            }
            features.append(feature)
            
            polyline_latlon = [[lat, lon] for lon, lat in polyline_lonlat]
            if not polyline_latlon:
                continue
            
            conn.execute("""
                INSERT INTO routes (
                    route, name, polyline_json, country, region, tag, route_type, 
                    origin_name, destination_name, distance_km, description, minimum_fare, fare_per_km
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                r_data["id"], r_data["name"], json.dumps(polyline_latlon), country, feature["properties"]["region"],
                r_data["tag"], r_data["type"], orig, dest, 5.0, "Demo Route", 15.0, 2.0
            ))
            
            for idx, pt in enumerate(polyline_latlon):
                if idx == 0:
                    pt_type = "origin"
                    label = orig
                elif idx == len(polyline_latlon) - 1:
                    pt_type = "end"
                    label = dest
                elif idx % 5 == 0:
                    pt_type = "alight_or_board_stop"
                    label = f"Stop {idx//5}"
                else:
                    pt_type = "waypoint"
                    label = ""
                
                conn.execute("""
                    INSERT INTO route_points (route, sequence_order, latitude, longitude, point_type, label)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (r_data["id"], idx, pt[0], pt[1], pt_type, label))
            
            vehicles = generate_vehicles_for_route(r_data, country)
            for v in vehicles:
                conn.execute("""
                    INSERT INTO vehicles (
                        vehicle_id, country, route, driver, max_occupancy, brand, model, 
                        plate_number, vehicle_type, year, registration_number, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    v["vehicle_id"], v["country"], v["route"], v["driver"], v["max_occupancy"], v["brand"],
                    v["model"], v["plate_number"], v["vehicle_type"], v["year"], v["registration_number"], v["status"]
                ))
            
        conn.commit()
        conn.close()
        
        geojson_data = {
            "type": "FeatureCollection",
            "features": features
        }
        with open(geojson_path, "w", encoding="utf-8") as f:
            json.dump(geojson_data, f, indent=2)
            
        print(f"Finished {country}. Saved {len(features)} routes.")

if __name__ == "__main__":
    run()
