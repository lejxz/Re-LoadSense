import json

CEBU_ROUTES = [
    # ---- MODERN JEEPNEYS & BUSES ----
    {"id": "PH-MJ01", "name": "eJeep Naga - IT Park", "type": "PUJ", "origin": (10.2078, 123.7570), "dest": (10.3285, 123.9061), "tag": "NAGA-IT"},
    {"id": "PH-MJ02", "name": "eJeep Minglanilla - IT Park", "type": "PUJ", "origin": (10.2450, 123.7960), "dest": (10.3285, 123.9061), "tag": "MING-IT"},
    {"id": "PH-MJ03", "name": "eJeep Consolacion - IT Park", "type": "PUJ", "origin": (10.3950, 123.9570), "dest": (10.3285, 123.9061), "tag": "CONS-IT"},
    {"id": "PH-MJ04", "name": "eJeep Liloan - IT Park", "type": "PUJ", "origin": (10.4000, 123.9850), "dest": (10.3285, 123.9061), "tag": "LIL-IT"},
    {"id": "PH-CIBUS", "name": "CIBUS IT Park - SM Seaside", "type": "BUS", "origin": (10.3285, 123.9061), "dest": (10.2811, 123.8811), "tag": "CIBUS"},
    {"id": "PH-KMK", "name": "KMK Naga - SM Seaside", "type": "BUS", "origin": (10.2078, 123.7570), "dest": (10.2811, 123.8811), "tag": "KMK"},
    {"id": "PH-MYBUS1", "name": "MyBus SM City - Airport", "type": "BUS", "origin": (10.3115, 123.9182), "dest": (10.3251, 123.9781), "tag": "MYBUS"},
    {"id": "PH-MYBUS2", "name": "MyBus SM Seaside - SM City", "type": "BUS", "origin": (10.2811, 123.8811), "dest": (10.3115, 123.9182), "tag": "MYBUS"},
    {"id": "PH-MYBUS3", "name": "MyBus Talisay - SM Seaside", "type": "BUS", "origin": (10.2580, 123.8340), "dest": (10.2811, 123.8811), "tag": "MYBUS"},
    {"id": "PH-MYBUS4", "name": "MyBus Minglanilla - SM Seaside", "type": "BUS", "origin": (10.2450, 123.7960), "dest": (10.2811, 123.8811), "tag": "MYBUS"},
    {"id": "PH-MYBUS5", "name": "MyBus Minglanilla - SM City", "type": "BUS", "origin": (10.2450, 123.7960), "dest": (10.3115, 123.9182), "tag": "MYBUS"},
    {"id": "PH-CERES-S", "name": "Ceres Cebu - Carcar", "type": "BUS", "origin": (10.2981, 123.8941), "dest": (10.1065, 123.6391), "tag": "CERES-S"},
    {"id": "PH-CERES-N", "name": "Ceres Cebu - Danao", "type": "BUS", "origin": (10.3155, 123.9215), "dest": (10.5120, 124.0250), "tag": "CERES-N"},
    
    # ---- SOUTH PROVINCIAL PUJs ----
    {"id": "PH-44", "name": "44 Naga - Basak", "type": "PUJ", "origin": (10.2078, 123.7570), "dest": (10.2881, 123.8761), "tag": "44"},
    {"id": "PH-44A", "name": "44A Naga - Carbon", "type": "PUJ", "origin": (10.2078, 123.7570), "dest": (10.2932, 123.8988), "tag": "44A"},
    {"id": "PH-43D", "name": "43D Tungkop - Carbon", "type": "PUJ", "origin": (10.2350, 123.7860), "dest": (10.2932, 123.8988), "tag": "43D"},
    {"id": "PH-42D", "name": "42D Minglanilla - Carbon", "type": "PUJ", "origin": (10.2450, 123.7960), "dest": (10.2932, 123.8988), "tag": "42D"},
    {"id": "PH-41D", "name": "41D Tabunok - Carbon", "type": "PUJ", "origin": (10.2580, 123.8340), "dest": (10.2932, 123.8988), "tag": "41D"},

    # ---- NORTH PROVINCIAL PUJs ----
    {"id": "PH-24", "name": "24 Consolacion - SM City", "type": "PUJ", "origin": (10.3950, 123.9570), "dest": (10.3115, 123.9182), "tag": "24"},
    {"id": "PH-25", "name": "25 Liloan - SM City", "type": "PUJ", "origin": (10.4000, 123.9850), "dest": (10.3115, 123.9182), "tag": "25"},
    {"id": "PH-26", "name": "26 Compostela - SM City", "type": "PUJ", "origin": (10.4570, 124.0110), "dest": (10.3115, 123.9182), "tag": "26"},
    {"id": "PH-27", "name": "27 Danao - SM City", "type": "PUJ", "origin": (10.5120, 124.0250), "dest": (10.3115, 123.9182), "tag": "27"},

    # ---- MANDAUE / LAPU-LAPU / CORDOVA ----
    {"id": "PH-54A", "name": "54A Cordova - Lapu-Lapu", "type": "PUJ", "origin": (10.2500, 123.9490), "dest": (10.3130, 123.9490), "tag": "54A"},
    {"id": "PH-23D", "name": "23D Opon - Parkmall", "type": "PUJ", "origin": (10.3130, 123.9490), "dest": (10.3262, 123.9352), "tag": "23D"},
    {"id": "PH-20A", "name": "20A Mandaue - Ayala", "type": "PUJ", "origin": (10.3341, 123.9431), "dest": (10.3181, 123.9051), "tag": "20A"},
    {"id": "PH-21A", "name": "21A Mandaue - Manalili (via Mabolo)", "type": "PUJ", "origin": (10.3341, 123.9431), "dest": (10.2951, 123.9021), "tag": "21A"},
    {"id": "PH-21B", "name": "21B Mandaue - Manalili", "type": "PUJ", "origin": (10.3341, 123.9431), "dest": (10.2951, 123.9021), "tag": "21B"},
    {"id": "PH-21D", "name": "21D Mandaue - Manalili (via Highway)", "type": "PUJ", "origin": (10.3341, 123.9431), "dest": (10.2951, 123.9021), "tag": "21D"},
    {"id": "PH-22D", "name": "22D Ouano - Manalili", "type": "PUJ", "origin": (10.3241, 123.9311), "dest": (10.2951, 123.9021), "tag": "22D"},
    {"id": "PH-22I", "name": "22I Ouano - SM", "type": "PUJ", "origin": (10.3241, 123.9311), "dest": (10.3115, 123.9182), "tag": "22I"},

    # ---- CEBU CITY PROPER ----
    {"id": "PH-01A", "name": "01A Urgello - Pier Area", "type": "PUJ", "origin": (10.3015, 123.8951), "dest": (10.2941, 123.9041), "tag": "01A"},
    {"id": "PH-01B", "name": "01B Urgello - Pier Area", "type": "PUJ", "origin": (10.3015, 123.8951), "dest": (10.2941, 123.9041), "tag": "01B"},
    {"id": "PH-01C", "name": "01C Urgello - Pier Area", "type": "PUJ", "origin": (10.3015, 123.8951), "dest": (10.2941, 123.9041), "tag": "01C"},
    {"id": "PH-01K", "name": "01K Urgello - Parkmall", "type": "PUJ", "origin": (10.3015, 123.8951), "dest": (10.3262, 123.9352), "tag": "01K"},
    
    {"id": "PH-03B", "name": "03B Mabolo - Colon", "type": "PUJ", "origin": (10.3151, 123.9131), "dest": (10.2974, 123.8997), "tag": "03B"},
    {"id": "PH-03A", "name": "03A Mabolo - Carbon", "type": "PUJ", "origin": (10.3151, 123.9131), "dest": (10.2932, 123.8988), "tag": "03A"},

    {"id": "PH-04B", "name": "04B Lahug - Carbon", "type": "PUJ", "origin": (10.3283, 123.8984), "dest": (10.2932, 123.8988), "tag": "04B"},
    {"id": "PH-04C", "name": "04C Lahug - Ramos", "type": "PUJ", "origin": (10.3283, 123.8984), "dest": (10.3091, 123.8991), "tag": "04C"},
    {"id": "PH-04D", "name": "04D Lahug - Carbon (via Escario)", "type": "PUJ", "origin": (10.3283, 123.8984), "dest": (10.2932, 123.8988), "tag": "04D"},
    {"id": "PH-04H", "name": "04H Lahug - Plaza Housing", "type": "PUJ", "origin": (10.3283, 123.8984), "dest": (10.3421, 123.8891), "tag": "04H"},
    {"id": "PH-04L", "name": "04L Lahug - SM City", "type": "PUJ", "origin": (10.3283, 123.8984), "dest": (10.3115, 123.9182), "tag": "04L"},
    {"id": "PH-04M", "name": "04M Lahug - SM City", "type": "PUJ", "origin": (10.3283, 123.8984), "dest": (10.3115, 123.9182), "tag": "04M"},

    {"id": "PH-06B", "name": "06B Guadalupe - Carbon", "type": "PUJ", "origin": (10.3221, 123.8831), "dest": (10.2932, 123.8988), "tag": "06B"},
    {"id": "PH-06C", "name": "06C Guadalupe - Colon", "type": "PUJ", "origin": (10.3221, 123.8831), "dest": (10.2974, 123.8997), "tag": "06C"},
    {"id": "PH-06G", "name": "06G Taboan - Guadalupe", "type": "PUJ", "origin": (10.2951, 123.8891), "dest": (10.3221, 123.8831), "tag": "06G"},

    {"id": "PH-07B", "name": "07B Banawa - Carbon", "type": "PUJ", "origin": (10.3151, 123.8811), "dest": (10.2932, 123.8988), "tag": "07B"},

    {"id": "PH-08F", "name": "08F Basak - Carbon", "type": "PUJ", "origin": (10.2881, 123.8761), "dest": (10.2932, 123.8988), "tag": "08F"},
    {"id": "PH-08G", "name": "08G Alumnos - Colon", "type": "PUJ", "origin": (10.2851, 123.8811), "dest": (10.2974, 123.8997), "tag": "08G"},

    {"id": "PH-09C", "name": "09C Basak - Colon", "type": "PUJ", "origin": (10.2881, 123.8761), "dest": (10.2974, 123.8997), "tag": "09C"},
    {"id": "PH-09F", "name": "09F Basak - Colon", "type": "PUJ", "origin": (10.2881, 123.8761), "dest": (10.2974, 123.8997), "tag": "09F"},

    {"id": "PH-10F", "name": "10F Bulacao - Carbon", "type": "PUJ", "origin": (10.2781, 123.8561), "dest": (10.2932, 123.8988), "tag": "10F"},
    {"id": "PH-10H", "name": "10H Bulacao - SM", "type": "PUJ", "origin": (10.2781, 123.8561), "dest": (10.3115, 123.9182), "tag": "10H"},
    {"id": "PH-10M", "name": "10M Bulacao - SM (via Ayala)", "type": "PUJ", "origin": (10.2781, 123.8561), "dest": (10.3115, 123.9182), "tag": "10M"},

    {"id": "PH-11A", "name": "11A Inayawan - Carbon", "type": "PUJ", "origin": (10.2750, 123.8650), "dest": (10.2932, 123.8988), "tag": "11A"},

    {"id": "PH-12D", "name": "12D Labangon - Carbon", "type": "PUJ", "origin": (10.3011, 123.8761), "dest": (10.2932, 123.8988), "tag": "12D"},
    {"id": "PH-12G", "name": "12G Labangon - SM", "type": "PUJ", "origin": (10.3011, 123.8761), "dest": (10.3115, 123.9182), "tag": "12G"},
    {"id": "PH-12L", "name": "12L Labangon - Ayala", "type": "PUJ", "origin": (10.3011, 123.8761), "dest": (10.3181, 123.9051), "tag": "12L"},

    {"id": "PH-13B", "name": "13B Talamban - Carbon", "type": "PUJ", "origin": (10.3601, 123.9142), "dest": (10.2932, 123.8988), "tag": "13B"},
    {"id": "PH-13C", "name": "13C Talamban - Colon", "type": "PUJ", "origin": (10.3601, 123.9142), "dest": (10.2974, 123.8997), "tag": "13C"},

    {"id": "PH-14D", "name": "14D Ayala - Downtown", "type": "PUJ", "origin": (10.3181, 123.9051), "dest": (10.2982, 123.8981), "tag": "14D"},

    {"id": "PH-15", "name": "15 Oppra - Carbon", "type": "PUJ", "origin": (10.3290, 123.8860), "dest": (10.2932, 123.8988), "tag": "15"},

    {"id": "PH-17B", "name": "17B IT Park - Colon", "type": "PUJ", "origin": (10.3285, 123.9061), "dest": (10.2962, 123.8993), "tag": "17B"},
    {"id": "PH-17C", "name": "17C IT Park - Carbon", "type": "PUJ", "origin": (10.3285, 123.9061), "dest": (10.2932, 123.8988), "tag": "17C"},
    {"id": "PH-17D", "name": "17D Apas - Carbon", "type": "PUJ", "origin": (10.3340, 123.9080), "dest": (10.2932, 123.8988), "tag": "17D"},

    {"id": "PH-62B", "name": "62B Pit-os - Carbon", "type": "PUJ", "origin": (10.3951, 123.9211), "dest": (10.2932, 123.8988), "tag": "62B"},
    {"id": "PH-62C", "name": "62C Pit-os - Colon", "type": "PUJ", "origin": (10.3951, 123.9211), "dest": (10.2974, 123.8997), "tag": "62C"}
]

print(json.dumps(CEBU_ROUTES))
