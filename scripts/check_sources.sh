#!/bin/bash
# Verify archive.org music sources: search content, audio file playability, artwork
set -e

echo "=== 1. Search: netlabels (CC music) ==="
curl -s -m 20 "https://archive.org/advancedsearch.php?q=collection%3A%28netlabels%29+AND+mediatype%3A%28audio%29&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=licenseurl&fl%5B%5D=subject&rows=3&output=json" | head -c 1200
echo; echo

echo "=== 2. Search: hindi bhajan ==="
curl -s -m 20 "https://archive.org/advancedsearch.php?q=%28subject%3A%28bhajan%29+OR+title%3A%28bhajan%29%29+AND+mediatype%3A%28audio%29&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=language&rows=3&output=json" | head -c 1200
echo; echo

echo "=== 3. Search: bollywood ==="
curl -s -m 20 "https://archive.org/advancedsearch.php?q=subject%3A%28bollywood%29+AND+mediatype%3A%28audio%29&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&rows=3&output=json" | head -c 1200
echo; echo

echo "=== 4. Metadata of a netlabels item (check files + formats + lengths) ==="
IDENT=$(curl -s -m 20 "https://archive.org/advancedsearch.php?q=collection%3A%28netlabels%29+AND+format%3A%28MP3%29&fl%5B%5D=identifier&rows=1&output=json" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.response.docs[0].identifier)})")
echo "Item: $IDENT"
curl -s -m 20 "https://archive.org/metadata/$IDENT" > /tmp/meta.json
node -e "
const m = require('/tmp/meta.json');
console.log('title:', m.metadata.title);
console.log('licenseurl:', m.metadata.licenseurl);
const files = m.files.filter(f => /mp3/i.test(f.format||'')).slice(0,4);
files.forEach(f => console.log('file:', f.name, '| format:', f.format, '| len:', f.length, '| size:', f.size, '| track:', f.track));
"

echo "=== 5. HEAD request on an MP3 file (playability + range support) ==="
MP3=$(node -e "const m=require('/tmp/meta.json'); const f=m.files.find(f=>/mp3/i.test(f.format||'')); console.log(f.name)")
IDENT2=$(node -e "console.log(require('/tmp/meta.json').metadata.identifier)")
curl -s -D - -o /dev/null -m 20 "https://archive.org/download/$IDENT2/$(node -e "console.log(encodeURIComponent('$MP3'))")" | grep -i "HTTP/\|content-type\|accept-ranges\|location" | head -8

echo "=== 6. Artwork service ==="
curl -s -o /dev/null -w "artwork: %{http_code} type=%{content_type}\n" -m 20 "https://archive.org/services/img/$IDENT2"
echo "DONE"
