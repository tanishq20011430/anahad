#!/usr/bin/env bash
# Verify keyless availability of candidate music sources for the Anahad upgrade:
# Openverse (CC aggregator), ccMixter dig API, Free Music Archive current state,
# FreePD (public domain), and archive.org storage-node CORS (for fetch-caching).
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AnahadVerify/2.0"

hdr() { echo "=== $1 ==="; }

hdr "1. Openverse audio search (keyless?)"
curl -sS -m 15 -A "$UA" -D /tmp/ov_headers.txt \
  "https://api.openverse.org/v1/audio/?q=bhajan&page_size=3& mature=false" \
  -o /tmp/ov.json 2>&1 | head -3
grep -i -E "HTTP/|access-control-allow-origin|content-type" /tmp/ov_headers.txt | head -5
echo "--- body head ---"
head -c 900 /tmp/ov.json 2>/dev/null; echo

hdr "2. Openverse: providers present for q=instrumental"
curl -sS -m 15 -A "$UA" "https://api.openverse.org/v1/audio/stats/" -o /tmp/ovstats.json 2>&1
head -c 1200 /tmp/ovstats.json 2>/dev/null; echo

hdr "3. ccMixter dig API"
for U in \
  "https://dig.ccmixter.org/dig?limit=3&format=json" \
  "https://dig.ccmixter.org/api/query?limit=3&format=json" \
  "https://ccmixter.org/api/query?limit=3&format=json" ; do
  echo "--- $U"
  curl -sS -m 15 -A "$UA" -D /tmp/cc_h.txt "$U" -o /tmp/cc.json 2>&1 | head -2
  grep -i -E "HTTP/|access-control-allow-origin|content-type" /tmp/cc_h.txt 2>/dev/null | head -4
  head -c 500 /tmp/cc.json 2>/dev/null; echo
done

hdr "4. Free Music Archive current state"
curl -sS -m 15 -A "$UA" -D /tmp/fma_h.txt "https://freemusicarchive.org/" -o /tmp/fma.html 2>&1 | head -2
grep -i -E "HTTP/|location" /tmp/fma_h.txt | head -4
wc -c /tmp/fma.html 2>/dev/null
curl -sS -m 15 -A "$UA" -o /dev/null -w "FMA api/track search -> %{http_code}\n" "https://freemusicarchive.org/api/trackSearch?q=test&limit=1" 2>&1

hdr "5. FreePD direct MP3 (public domain, no API)"
curl -sS -m 15 -A "$UA" -D /tmp/fpd_h.txt "https://freepd.com/music/City%20Sunshine.mp3" -o /dev/null 2>&1 | head -2
grep -i -E "HTTP/|access-control-allow-origin|content-type|content-length" /tmp/fpd_h.txt | head -6

hdr "6. archive.org storage-node CORS (fetch-caching feasibility)"
ITEM=$(curl -sS -m 15 -A "$UA" "https://archive.org/advancedsearch.php?q=collection%3A(netlabels)+AND+mediatype%3A(audio)+AND+format%3A(MP3)&fl%5B%5D=identifier&rows=1&output=json" | python3 -c "import sys,json;print(json.load(sys.stdin)['response']['docs'][0]['identifier'])")
echo "sample item: $ITEM"
curl -sS -m 20 -A "$UA" -L -D /tmp/ia_h.txt "https://archive.org/download/$ITEM/" -o /dev/null 2>&1 | head -2
grep -i -E "HTTP/|access-control-allow-origin" /tmp/ia_h.txt | head -6
F=$(curl -sS -m 15 -A "$UA" "https://archive.org/metadata/$ITEM" | python3 -c "import sys,json;d=json.load(sys.stdin);print(next(f['name'] for f in d['files'] if f['name'].lower().endswith('.mp3')))")
echo "sample file: $F"
curl -sS -m 25 -A "$UA" -L -D /tmp/ia_file_h.txt "https://archive.org/download/$ITEM/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$F")" -o /dev/null 2>&1
grep -i -E "HTTP/|access-control-allow-origin|accept-ranges|content-type" /tmp/ia_file_h.txt | head -10

hdr "7. Openverse thumbnail/waveform availability sample"
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/ov.json'))
    rs = d.get('results', [])
    print("count:", len(rs))
    for r in rs[:3]:
        print("-", {k: r.get(k) for k in ('id','title','creator','provider','url','foreign_landing_url','license','license_version','duration','audio_set','thumbnail','waveform','bit_rate')})
except Exception as e:
    print("parse error:", e)
EOF
echo "DONE"
