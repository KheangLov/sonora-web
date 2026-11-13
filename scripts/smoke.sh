#!/usr/bin/env bash
# Live smoke test against the built server: search, home, radio, lyrics, collection, and real audio bytes.
set -uo pipefail
BASE="${BASE:-http://localhost:3000}"
fail=0
j() { curl -s --max-time 60 "$BASE$1"; }
check() { if [ "${2:-}" = "ok" ]; then echo "✅ $1"; else echo "❌ $1 — ${3:-}"; fail=1; fi; }

S=$(j "/api/search?q=shape%20of%20you")
N=$(echo "$S" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log(j.songs.length);console.error(j.songs.slice(0,3).map(s=>s.title+" — "+s.artist+" ("+s.duration+"s) "+s.id).join("\n"))}catch(e){console.log(0);console.error(d.slice(0,300))}})')
check "search ($N songs)" "$([ "$N" -gt 3 ] && echo ok)" "$S"
ID=$(echo "$S" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).songs[0].id)}catch{console.log("JGwWNGJdvx8")}})')
echo "id=$ID"

B=$(j "/api/search?q=thai%20songs"); check "thai search blocked" "$(echo "$B" | grep -q '"blocked":true' && echo ok)" "$B"
SG=$(j "/api/suggest?q=billie"); check "suggest: $SG" "$(echo "$SG" | grep -q '\[".' && echo ok)" "$SG"

H=$(j "/api/home?gl=KH")
HN=$(echo "$H" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log(j.length);console.error(j.map(s=>s.title+": "+s.songs.length+"/"+s.collections.length).join("\n"))}catch{console.log(0);console.error(d.slice(0,300))}})')
check "home ($HN sections)" "$([ "$HN" -gt 2 ] && echo ok)" "$H"

R=$(j "/api/radio/$ID"); RN=$(echo "$R" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).length)}catch{console.log(0)}})')
check "radio ($RN songs)" "$([ "$RN" -gt 5 ] && echo ok)" "${R:0:300}"

L=$(j "/api/lyrics/$ID?title=Shape%20of%20You&artist=Ed%20Sheeran&duration=234")
check "lyrics: $(echo "$L" | head -c 120)" "$(echo "$L" | grep -q '"source":"\(LRCLIB\|YouTube Music\)"' && echo ok)" "$L"

C=$(j "/api/collection?id=RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs")
CN=$(echo "$C" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log(j.songs.length);console.error(j.title)}catch{console.log(0);console.error(d.slice(0,300))}})')
check "collection ($CN songs)" "$([ "$CN" -gt 3 ] && echo ok)" "$C"

# Sign-in: Google device code is issued; personal endpoints refuse anonymous calls; signed requests are never edge-cached
D=$(curl -s --max-time 30 -X POST "$BASE/api/auth/device")
check "sign-in device code: $(echo "$D" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log(j.via+" "+j.userCode+" "+j.verificationUrl)}catch{console.log(d.slice(0,200))}})')" "$(echo "$D" | grep -q '"userCode":"' && echo ok)" "$D"
ME=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/me"); check "anonymous /api/me is 401 ($ME)" "$([ "$ME" = "401" ] && echo ok)" ""
CC=$(curl -s -D - -o /dev/null -H "Cookie: sonora_yt_token=ya29.not-a-real-token-xxxxxxxxxxxx" "$BASE/api/home?gl=KH&u=test" | grep -i '^cache-control' | tr -d '\r')
check "signed-in home is private ($CC)" "$(echo "$CC" | grep -qi 'private' && echo ok)" "$CC"
BAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{"cookie":"SID=abc; SAPISID=fake"}' "$BASE/api/auth/cookie")
check "bad cookie rejected ($BAD)" "$([ "$BAD" = "401" ] && echo ok)" ""

for vid in "$ID" "kJQP7kiw5Fk" "dQw4w9WgXcQ"; do
  curl -s --max-time 60 -D /tmp/h.txt -o /tmp/a.bin -H "Range: bytes=0-262143" "$BASE/api/stream/$vid"
  SZ=$(stat -c %s /tmp/a.bin); ST=$(head -1 /tmp/h.txt | awk '{print $2}')
  echo "--- stream $vid status=$ST bytes=$SZ"; grep -i "content-range\|content-type\|x-sonora-client" /tmp/h.txt
  if [ "$ST" = "503" ] || [ "$ST" = "502" ]; then echo "⚠️  stream $vid ($ST): server is bot-checked by YouTube → browser uses the embedded-player fallback"; continue; fi
  check "stream $vid" "$([ "$ST" = "206" ] && [ "$SZ" -gt 100000 ] && echo ok)" "$(head -c 400 /tmp/a.bin)"
done
# Seek into the middle (only meaningful when the server stream works)
[ "$ST" = "503" ] || [ "$ST" = "502" ] || curl -s --max-time 60 -D /tmp/h.txt -o /tmp/b.bin -H "Range: bytes=1000000-" "$BASE/api/stream/$ID"
[ "$ST" = "503" ] || [ "$ST" = "502" ] || check "seek (status $(head -1 /tmp/h.txt | awk '{print $2}'), $(stat -c %s /tmp/b.bin) bytes)" "$(grep -qi "content-range: bytes 1000000-" /tmp/h.txt && echo ok)" "$(cat /tmp/h.txt)"
exit $fail
