#!/usr/bin/env bash
# Round 4: Free To Use API shapes + CORS on file hosts; Openverse retry (music + jamendo + related).
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
hdr() { echo "=== $1 ==="; }

hdr "A. FTU /music/tracks/all (CORS probe)"
curl -sS -m 20 -A "$UA" -H "Origin: https://anahad.example" -D /tmp/fta_h.txt \
  "https://api.freetouse.com/v3/music/tracks/all?limit=2" -o /tmp/fta.json
grep -i -E "^HTTP/|access-control-allow-origin|content-type|ratelimit" /tmp/fta_h.txt | head -6
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/fta.json'))
    print("top-level:", {k: (v if not isinstance(v,(list,dict)) else type(v).__name__) for k,v in d.items()})
    data = d.get('data') or {}
    items = data if isinstance(data, list) else (data.get('items') or data.get('tracks') or [])
    print("items:", len(items))
    if items: print(json.dumps(items[0], indent=1)[:1600])
except Exception as e:
    print("ERR", e, open('/tmp/fta.json').read()[:300])
EOF

hdr "B. FTU /music/tracks/search?q=calm"
curl -sS -m 20 -A "$UA" "https://api.freetouse.com/v3/music/tracks/search?q=calm&limit=2" -o /tmp/fts.json
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/fts.json'))
    data = d.get('data') or {}
    items = data if isinstance(data, list) else (data.get('items') or data.get('tracks') or [])
    print("items:", len(items), "| top keys:", list(d.keys()))
    if items: print(json.dumps(items[0], indent=1)[:1200])
except Exception as e:
    print("ERR", e, open('/tmp/fts.json').read()[:300])
EOF

hdr "C. FTU /music/categories/all"
curl -sS -m 20 -A "$UA" "https://api.freetouse.com/v3/music/categories/all" -o /tmp/ftc.json
head -c 700 /tmp/ftc.json; echo

hdr "D. FTU audio file host CORS (from track url in A/B)"
python3 - <<'EOF'
import json, subprocess
url = None
for f in ('/tmp/fta.json','/tmp/fts.json'):
    try:
        d = json.load(open(f))
        data = d.get('data') or {}
        items = data if isinstance(data, list) else (data.get('items') or data.get('tracks') or [])
        for it in items:
            for k in ('url','audio_url','file_url','stream_url','play_url','mp3'):
                v = it.get(k)
                if isinstance(v,str) and 'http' in v: url = v; break
            if url: break
    except Exception: pass
    if url: break
print("candidate audio url:", url)
if url:
    for h in ([], ["-H", "Origin: https://anahad.example"]):
        out = subprocess.run(['curl','-sS','-m','20','-A','Mozilla/5.0 Chrome/126.0',*h,'-I',url], capture_output=True, text=True)
        print(" ", "HEAD", h or "(no origin)")
        for line in out.stdout.splitlines():
            if any(k in line.lower() for k in ('http/','access-control','content-type','accept-ranges','content-length')): print("   ", line.strip())
EOF

hdr "E. Openverse retry: music category"
sleep 3
curl -sS -m 30 -A "$UA" "https://api.openverse.org/v1/audio/?q=lofi+beats&category=music&page_size=2" -o /tmp/ovm.json 2>&1 | head -1
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/ovm.json'))
    print("count:", d.get('result_count'))
    for r in d.get('results', [])[:2]:
        print("-", r.get('provider'), '|', (r.get('title') or '')[:50], '| dur(ms):', r.get('duration'), '|', (r.get('url') or '')[:70])
except Exception as e:
    print("ERR", e)
EOF

hdr "F. Openverse jamendo full-track sample"
sleep 2
curl -sS -m 30 -A "$UA" "https://api.openverse.org/v1/audio/?q=summer&source=jamendo&page_size=2" -o /tmp/ovj.json 2>&1 | head -1
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/ovj.json'))
    print("count:", d.get('result_count'))
    for r in d.get('results', [])[:2]:
        print(json.dumps({k: r.get(k) for k in ('provider','title','url','license','license_version','duration','bit_rate','filesize','filetype','alt_files','genres','thumbnail','audio_set')}, default=str)[:700])
except Exception as e:
    print("ERR", e, open('/tmp/ovj.json').read()[:150])
EOF

hdr "G. Openverse related endpoint"
sleep 2
ID=$(python3 -c "import json;print(json.load(open('/tmp/ovm.json'))['results'][0]['id'])" 2>/dev/null)
echo "id=$ID"
if [ -n "$ID" ]; then
  curl -sS -m 30 -A "$UA" "https://api.openverse.org/v1/audio/$ID/related/" -o /tmp/ovr.json 2>&1 | head -1
  head -c 400 /tmp/ovr.json; echo
fi
echo "DONE"
