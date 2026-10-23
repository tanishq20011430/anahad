#!/usr/bin/env bash
# Round 2: exact shapes + CORS with Origin header for candidate sources.
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AnahadVerify/2.0"
ORIGIN="https://example.com"
hdr() { echo "=== $1 ==="; }

hdr "A. Openverse audio search (fixed URL + Origin)"
curl -sS -m 20 -A "$UA" -H "Origin: $ORIGIN" -H "Accept: application/json" \
  -D /tmp/ov2_h.txt "https://api.openverse.org/v1/audio/?q=bhajan&page_size=3" -o /tmp/ov2.json
grep -i -E "^HTTP/|access-control-allow-origin|x-ratelimit" /tmp/ov2_h.txt | head -6
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/ov2.json'))
    rs = d.get('results', [])
    print("result_count:", d.get('result_count'), "| page:", d.get('page_count'))
    for r in rs[:3]:
        keys = ('id','title','creator','provider','url','foreign_landing_url','license','license_version','duration','audio_set','thumbnail','waveform','bit_rate','filesize','filetype','genres','tags','alt_files')
        print("-", json.dumps({k: r.get(k) for k in keys}, default=str)[:600])
except Exception as e:
    print("parse error:", e, open('/tmp/ov2.json').read()[:300])
EOF

hdr "B. Openverse provider stats (which sources are indexed)"
curl -sS -m 20 -A "$UA" -H "Accept: application/json" "https://api.openverse.org/v1/audio/stats/" -o /tmp/ovstats2.json
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/ovstats2.json'))
    for s in d:
        print("-", s.get('source_name'), "| display:", s.get('display_name'), "| count:", s.get('media_count'))
except Exception as e:
    print("parse error:", e, open('/tmp/ovstats2.json').read()[:200])
EOF

hdr "C. ccMixter query API: full record + CORS"
curl -sS -m 20 -A "$UA" -H "Origin: $ORIGIN" -D /tmp/cc2_h.txt \
  "https://ccmixter.org/api/query?limit=2&format=json" -o /tmp/cc2.json
grep -i -E "^HTTP/|access-control-allow-origin|content-type" /tmp/cc2_h.txt | head -5
python3 - <<'EOF'
import json
try:
    raw = open('/tmp/cc2.json').read()
    d = json.loads(raw)
    print(json.dumps(d[0], indent=1)[:2200])
except Exception as e:
    print("parse error:", e, raw[:300] if 'raw' in dir() else '')
EOF

hdr "D. ccMixter: filtered query (instrumental + license) and file URL HEAD"
curl -sS -m 20 -A "$UA" "https://ccmixter.org/api/query?limit=2&format=json&tags=instrumental&lic=by,by-nc,by-nc-sa,by-sa" -o /tmp/cc3.json
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/cc3.json'))
    print("records:", len(d))
    for r in d[:2]:
        print("-", r.get('upload_name'), "| user:", r.get('user_name'), "| dir:", r.get('upload_extra',{}).get('relative_dir'), "| files keys:", list((r.get('files') or [{}])[0].keys()) if r.get('files') else 'NO files field')
        f = (r.get('files') or [None])[0]
        if f: print("   file:", json.dumps(f)[:300])
except Exception as e:
    print("parse error:", e, open('/tmp/cc3.json').read()[:300])
EOF

hdr "E. ccMixter content-file CORS (HEAD a real file)"
# take relative_dir + file name from /tmp/cc2.json if present
python3 - <<'EOF'
import json, subprocess
try:
    d = json.load(open('/tmp/cc2.json'))
    r = d[0]
    dir_ = r.get('upload_extra', {}).get('relative_dir', '')
    files = r.get('files') or []
    if files and dir_:
        fn = files[0].get('file_name') or files[0].get('name')
        url = f"https://ccmixter.org/{dir_}/{fn}"
        print("FILE URL:", url)
        out = subprocess.run(['curl','-sS','-m','20','-A','AnahadVerify','-H','Origin: https://example.com','-I',url], capture_output=True, text=True)
        for line in out.stdout.splitlines():
            if any(k in line.lower() for k in ('http/','access-control','content-type','accept-ranges','content-length')): print(" ", line.strip())
except Exception as e:
    print("err:", e)
EOF

hdr "F. Free To Use (freetouse.com) public API"
curl -sS -m 20 -A "$UA" "https://freetouse.com/blog/royalty-free-music-api-for-the-apps-you-build" -o /tmp/ftu.html
python3 - <<'EOF'
import re
h = open('/tmp/ftu.html', encoding='utf-8', errors='ignore').read()
print("page bytes:", len(h))
# find api endpoint mentions
for m in re.findall(r'https?://[^"\'\s<>]*api[^"\'\s<>]*', h, re.I)[:15]:
    print(" API URL mention:", m)
EOF

hdr "G. FreePD real file check"
curl -sS -m 20 -A "$UA" "https://freepd.com/" -o /tmp/fpd.html
python3 - <<'EOF'
import re
h = open('/tmp/fpd.html', encoding='utf-8', errors='ignore').read()
print("page bytes:", len(h))
mp3s = re.findall(r'[^"\'\s<>]+\.mp3', h, re.I)[:8]
print("mp3 mentions:", mp3s[:8])
EOF
echo "DONE"
