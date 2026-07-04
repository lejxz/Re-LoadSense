import re
import json

file_path = r"C:\Users\rejui\.gemini\antigravity\brain\ecd0df5e-f662-4d6e-a907-304088466cc6\.system_generated\steps\1274\content.md"

with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

# remove HTML tags roughly
text = re.sub(r'<[^>]+>', '\n', text)
text = text.replace('&nbsp;', ' ')
text = text.replace('&amp;', '&')

routes = []
for line in text.split('\n'):
    line = line.strip()
    match = re.match(r'^([0-9A-Za-z]+)\s*-\s*(.+)', line)
    if match:
        tag = match.group(1).upper()
        if len(tag) <= 5 and any(c.isdigit() for c in tag): 
            name = match.group(2).strip()
            name = re.sub(r'\s+', ' ', name)
            routes.append({"tag": tag, "name": f"{tag} {name}"})

unique_routes = {r['tag']: r for r in routes}
routes_list = list(unique_routes.values())

with open(r"C:\Users\rejui\OneDrive\Desktop\Projects\LoadSense\tools\parsed_cebu_routes.json", "w") as f:
    json.dump(routes_list, f, indent=2)

print(f"Extracted {len(routes_list)} unique traditional routes.")
