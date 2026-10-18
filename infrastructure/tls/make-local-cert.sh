#!/usr/bin/env bash
# Creates a throwaway CA and a localhost certificate for the LOCAL TLS rehearsal (compose.tls.yaml).
# Output goes to infrastructure/tls/.certs (git-ignored). Never use these files anywhere else.
set -euo pipefail
cd "$(dirname "$0")"
out=.certs
mkdir -p "$out"
if [ -f "$out/server.crt" ] && openssl x509 -checkend 86400 -noout -in "$out/server.crt" >/dev/null 2>&1; then
  echo "certificate present: $out/server.crt"; exit 0
fi
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=UPNEXT local rehearsal CA" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -keyout "$out/ca.key" -out "$out/ca.crt" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=localhost" -keyout "$out/server.key" -out "$out/server.csr" 2>/dev/null
printf 'subjectAltName=DNS:localhost,DNS:proxy,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' > "$out/ext.cnf"
openssl x509 -req -in "$out/server.csr" -CA "$out/ca.crt" -CAkey "$out/ca.key" -CAcreateserial -days 30 \
  -extfile "$out/ext.cnf" -out "$out/server.crt" 2>/dev/null
chmod 644 "$out"/*.crt "$out"/*.key
echo "wrote $out/server.crt (valid 30 days, signed by a throwaway CA)"
