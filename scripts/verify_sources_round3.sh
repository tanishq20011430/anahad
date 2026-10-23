#!/usr/bin/env bash
# Round 3: ccMixter file access rules + lic filter values; freetouse OpenAPI;
# Openverse stats json; FreePD page dump.
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
hdr() { echo "=== $1 ==="; }

hdr "A. ccMixter lic filter variants"
for LIC in "by" "bync" "by,bync" "cc0,pd" "by,bync,byncsa,by" ; do
  R=$(curl -sS -m 15 -A "$UA" "https://ccmixter.org/api/query?limit=1&format=json&lic=$LIC" 2>&1 | head -c 120)
  echo "lic=$LIC -> $R"
done

hdr "B. ccMixter tags-only query works?"
curl -sS -m 15 -A "$UA" "https://ccmixter.org/api/query?limit=1&format=json&tags=instrumental" -o /tmp/cc_t.json
python3 -c "
import json
try:
    d=json.load(open('/tmp/cc_t.json')); print('OK records:',len(d), '| name:', d[0].get('upload_name'))
except Exception as e: print('ERR', e, open('/tmp/cc_t.json').read()[:150])
"

hdr "C. ccMixter file GET variations (UA/referer/origin/range)"
URL="https://ccmixter.org/content/mactonite/mactonite_-_DeepCold.mp3"
echo "--- C1: GET, browser UA, no referer, range 0-1023"
curl -sS -m 20 -A "$UA" -H "Range: bytes=0-1023" -D - -o /dev/null "$URL" 2>&1 | grep -i -E "^HTTP/|access-control|content-type|content-length|content-range" | head -6
echo "--- C2: GET, browser UA + Referer dig.ccmixter.org"
curl -sS -m 20 -A "$UA" -H "Referer: https://dig.ccmixter.org/" -H "Range: bytes=0-1023" -D - -o /dev/null "$URL" 2>&1 | grep -i -E "^HTTP/|access-control|content-type|content-length" | head -6
echo "--- C3: GET, browser UA + foreign Origin"
curl -sS -m 20 -A "$UA" -H "Origin: https://anahad.example" -H "Referer: https://anahad.example/" -D - -o /dev/null "$URL" 2>&1 | grep -i -E "^HTTP/|access-control|content-type|content-length" | head -6

hdr "D. dig.ccmixter.org free-licensed file sample (from dig's own domain)"
curl -sS -m 15 -A "$UA" "https://dig.ccmixter.org/api/query?limit=1&format=json" -o /tmp/dig1.json 2>&1 | head -1
head -c 120 /tmp/dig1.json; echo

hdr "E. freetouse OpenAPI spec"
curl -sS -m 20 -A "$UA" "https://api.freetouse.com/v3/openapi.json" -o /tmp/ftu_api.json
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/ftu_api.json'))
    print("title:", d.get('info',{}).get('title'), "| servers:", d.get('servers'))
    for p, ops in list(d.get('paths', {}).items())[:25]:
        for method, op in ops.items():
            print(f"  {method.upper()} {p} | {op.get('summary','')} | security={op.get('security') or d.get('security')}")
except Exception as e:
    print("ERR", e, open('/tmp/ftu_api.json').read()[:200])
EOF

hdr "F. freetouse sample search request (keyless?)"
curl -sS -m 20 -A "$UA" -H "Origin: https://anahad.example" -D /tmp/ftu_h.txt "https://api.freetouse.com/v3/tracks?limit=2" -o /tmp/ftu_t.json
grep -i -E "^HTTP/|access-control-allow-origin|content-type" /tmp/ftu_h.txt | head -4
head -c 500 /tmp/ftu_t.json; echo

hdr "G. Openverse stats via format=json"
curl -sS -m 20 -A "$UA" -H "Accept: application/json" "https://api.openverse.org/v1/audio/stats/?format=json" -o /tmp/ovs.json
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/ovs.json'))
    if isinstance(d, list):
        for s in d: print("-", s.get('source_name'), "|", s.get('display_name'), "|", s.get('media_count'))
    else:
        print("keys:", list(d)[:10])
except Exception as e:
    print("ERR", e, open('/tmp/ovs.json').read()[:150])
EOF

hdr "H. Openverse music filter (category=music, jamendo source probe)"
curl -sS -m 20 -A "$UA" "https://api.openverse.org/v1/audio/?q=lofi&category=music&page_size=2" -o /tmp/ovm.json
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/ovm.json'))
    print("count:", d.get('result_count'))
    for r in d.get('results', [])[:2]:
        print("-", r.get('provider'), '|', r.get('title')[:60], '| dur(ms):', r.get('duration'), '| url host:', r.get('url','')[:60])
except Exception as e:
    print("ERR", e)
EOF
curl -sS -m 20 -A "$UA" "https://api.openverse.org/v1/audio/?q=ambient&source=jamendo&page_size=2" -o /tmp/ovj.json
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/ovj.json'))
    print("jamendo-source count:", d.get('result_count'))
    for r in d.get('results', [])[:2]:
        print("-", r.get('provider'), '|', r.get('title')[:60], '|', r.get('url','')[:70])
except Exception as e:
    print("ERR", e, open('/tmp/ovj.json').read()[:150])
EOF

hdr "I. FreePD homepage dump"
head -c 1500 /tmp/fpd.html
echo; echo "DONE"
