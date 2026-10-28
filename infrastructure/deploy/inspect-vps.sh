#!/usr/bin/env bash
# READ-ONLY inspection of the VPS before the first deployment (U-1, U-2, OQ-10). It changes nothing: it only lists.
# Run it on the VPS as an ordinary admin user and attach the output to the deployment record.
#   - capacity and listening ports (is 8090 free? is 80/443 owned by Traefik?)
#   - running containers and their networks (which network does Traefik use? that name is UPNEXT_EDGE_NETWORK and
#     its subnet is UPNEXT_EDGE_CIDR)
#   - the shared proxy's configuration files, printed only as file names (read them yourself; do not edit them)
set -u
echo "== host"; uname -a; uptime; free -m | head -2; df -h / /var/lib/docker 2>/dev/null
echo "== listening ports"; (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | head -40
echo "== docker"; docker version --format '{{.Server.Version}}' 2>&1; docker compose version 2>&1
echo "== containers"; docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Networks}}' 2>&1
echo "== networks and subnets"
for n in $(docker network ls --format '{{.Name}}' 2>/dev/null); do
  printf '%s  ' "$n"; docker network inspect "$n" --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' 2>/dev/null
done
echo "== proxy configuration files (names only)"
for d in /etc/traefik /opt/traefik /srv/traefik /etc/nginx /opt/nginx; do [ -d "$d" ] && { echo "$d:"; ls -la "$d" 2>&1 | head -20; }; done
echo "== port 8090 (default UPNEXT_PROXY_PORT) in use?"; (ss -ltn 2>/dev/null | grep -q ':8090 ') && echo "IN USE - choose another UPNEXT_PROXY_PORT" || echo "free"
echo "== existing project names that would clash"; docker compose ls 2>/dev/null | grep -i upnext || echo "none"
