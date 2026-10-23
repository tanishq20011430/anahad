#!/bin/bash
# Verify candidate replacement sources for Anahad v3 (Internet Archive removal)
# Checks: HTTP status + Access-Control-Allow-Origin (browser-callable?) + sample payload shape
ORIGIN="https://anahad.app"
HDRS=(-H "Origin: $ORIGIN" -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36")

probe () {
  local label="$1"; shift
  local url="$1"; shift
  local outfile="/tmp/probe_${label//\//_}.json"
  local meta
  meta=$(curl -sS -m 15 -L -D - "${HDRS[@]}" "$url" -o "$outfile" 2>/tmp/probe_err.txt | tr -d '\r')
  local code acao ctype size
  code=$(echo "$meta" | head -1 | awk '{print $2}')
  acao=$(echo "$meta" | grep -i '^access-control-allow-origin:' | head -1 | awk '{print $2}')
  ctype=$(echo "$meta" | grep -i '^content-type:' | head -1 | awk '{print $2}')
  size=$(stat -c%s "$outfile" 2>/dev/null || echo 0)
  printf '%-38s HTTP:%s ACAO:%s type:%s bytes:%s\n' "$label" "${code:-ERR}" "${acao:-none}" "${ctype:-?}" "$size"
  if [ -s /tmp/probe_err.txt ]; then printf '   err: %s\n' "$(head -1 /tmp/probe_err.txt)"; fi
}

echo "== Piped instances (YouTube search, scraper-backed community APIs) =="
for inst in pipedapi.kavin.rocks pipedapi.adminforge.de api.piped.private.coffee pipedapi.reallyaweso.me pipedapi.ducks.party pipedapi.r4fo.com pipedapi.leptons.xyz; do
  probe "piped:$inst" "https://$inst/search?q=arijit+singh&filter=music_songs"
done

echo ""
echo "== Invidious instances (YouTube search) =="
for inst in inv.nadeko.net invidious.nerdvpn.de yewtu.be invidious.f5.si iv.melmac.space invidious.materialio.us; do
  probe "invidious:$inst" "https://$inst/api/v1/search?q=bhajan&type=video&page=1"
done

echo ""
echo "== Radio Browser (open radio directory API) =="
for srv in de1.api.radio-browser.info nl1.api.radio-browser.info at1.api.radio-browser.info; do
  probe "radiobrowser:$srv" "https://$srv/json/stations/search?name=bhajan&limit=3&hidebroken=true"
done

echo ""
echo "== Audius (official open API, app_name only) =="
probe "audius:hostlist" "https://api.audius.co"
probe "audius:search-bhajan" "https://discoveryprovider.audius.co/v1/tracks/search?query=bhajan&app_name=ANAHAD"
probe "audius:trending" "https://discoveryprovider.audius.co/v1/tracks/trending?app_name=ANAHAD&limit=3"

echo ""
echo "== Mixcloud (keyless search API) =="
probe "mixcloud:search" "https://api.mixcloud.com/search/?q=bhajan&type=cloudcast&limit=3"

echo ""
echo "== YouTube oEmbed (metadata sanity) =="
probe "youtube:oembed" "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=json"

echo ""
echo "== Invidious instance list =="
probe "invidious:instances.json" "https://api.invidious.io/instances.json?sort_by=health"
