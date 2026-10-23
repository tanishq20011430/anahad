#!/bin/bash
# Verify curated genre/language queries for the discovery config
q() {
  echo "--- $1 ---"
  curl -s -m 20 "https://archive.org/advancedsearch.php?q=$2&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&rows=2&output=json" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log('numFound:',j.response.numFound, '|', j.response.docs.slice(0,2).map(x=>x.title).join(' ;; ').slice(0,150))}catch(e){console.log('PARSE FAIL', d.slice(0,200))}})"
}

q "bollywood refined"        "%28subject%3A%28bollywood%29+OR+title%3A%28%22hindi+film+songs%22%29%29+AND+mediatype%3A%28audio%29+AND+format%3A%28MP3%29"
q "musopen classical"        "collection%3A%28musopen%29+AND+mediatype%3A%28audio%29"
q "etree live"               "collection%3A%28etree%29+AND+format%3A%28MP3%29"
q "78rpm"                    "collection%3A%28georgeblood%29+AND+format%3A%28MP3%29"
q "lofi"                     "%28subject%3A%28lo-fi%29+OR+subject%3A%28lofi%29%29+AND+mediatype%3A%28audio%29+AND+format%3A%28MP3%29"
q "sufi qawwali"             "%28subject%3A%28sufi%29+OR+subject%3A%28qawwali%29+OR+title%3A%28qawwali%29%29+AND+mediatype%3A%28audio%29+AND+format%3A%28MP3%29"
q "ghazal"                   "%28subject%3A%28ghazal%29+OR+title%3A%28ghazal%29%29+AND+mediatype%3A%28audio%29+AND+format%3A%28MP3%29"
q "hindustani classical"     "subject%3A%28hindustani%29+AND+mediatype%3A%28audio%29+AND+format%3A%28MP3%29"
q "carnatic"                 "subject%3A%28carnatic%29+AND+mediatype%3A%28audio%29+AND+format%3A%28MP3%29"
q "language hindi"           "language%3A%28hin+OR+hindi%29+AND+mediatype%3A%28audio%29+AND+format%3A%28MP3%29"
q "language punjabi"         "language%3A%28pan+OR+panjabi+OR+punjabi%29+AND+mediatype%3A%28audio%29+AND+format%3A%28MP3%29"
q "language tamil"           "language%3A%28tam+OR+tamil%29+AND+mediatype%3A%28audio%29+AND+format%3A%28MP3%29"
q "netlabels electronic"     "collection%3A%28netlabels%29+AND+subject%3A%28electronic%29+AND+format%3A%28MP3%29"
q "netlabels jazz"           "collection%3A%28netlabels%29+AND+subject%3A%28jazz%29+AND+format%3A%28MP3%29"
q "free music archive-ish: opensource_audio music" "collection%3A%28opensource_audio%29+AND+subject%3A%28music%29+AND+format%3A%28MP3%29"
echo "ALL DONE"
