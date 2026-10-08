#!/usr/bin/env bash
# EC2 user-data for the single t4g.small in ap-south-1. Runs once, as root, on
# first boot. Paste it into "Advanced details → User data" when launching the
# instance; it is not idempotent by design — re-running it is not the recovery
# path, relaunching from this file is.
#
# Amazon Linux 2023 arm64. The SSM agent is preinstalled and enabled there, which
# is why the security group needs no port 22 rule at all.
#
# Everything this installs is infrastructure. No application image is pulled here
# — deploy/deploy.sh does that, once the ECR repositories exist.

set -euo pipefail

log() { echo "[bootstrap] $*"; }

# --- Docker + the Compose plugin --------------------------------------------
log "installing docker"
dnf install -y docker
systemctl enable --now docker

# The Compose *plugin*, not the standalone docker-compose binary: every command
# in the runbook is `docker compose`, and the two are not the same program.
log "installing the docker compose plugin"
COMPOSE_VERSION="v2.32.4"
install -d /usr/local/lib/docker/cli-plugins
curl -fsSL \
  "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-aarch64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version

# --- cron --------------------------------------------------------------------
# AL2023 SHIPS NO CRON DAEMON. `cronie` is not in the default package set, so
# /etc/cron.weekly does not exist and `crontab -e` is not a command — verified
# against the base image, where `rpm -q cronie` reports it missing and there is
# no /etc/cron.* at all. Without this the `cat >` below fails, `set -e` aborts
# this script before the final log line, and the box comes up looking healthy
# with no housekeeping, no nightly pg_dump (runbook §8) and no weekly report job
# (runbook §9) — backups that were "set up" and have never run.
log "installing cron"
dnf install -y cronie
systemctl enable --now crond

# --- Swap --------------------------------------------------------------------
# 2 GB on a 2 GiB box. NOT so the stacks can run in it — so that a Node heap
# spike during a nightly pg_dump degrades instead of being OOM-killed. The dev
# containers carry mem_limit for the same reason from the other direction: make
# the kernel's choice deterministic rather than heuristic.
if [ ! -f /swapfile ]; then
  log "provisioning 2 GB of swap"
  dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >>/etc/fstab
  # Prefer reclaiming page cache over swapping a live process.
  sysctl -w vm.swappiness=10
  echo "vm.swappiness=10" >/etc/sysctl.d/99-kidlearn-swappiness.conf
fi

# --- Directory layout --------------------------------------------------------
# Each environment's generated env file lands in its own directory, root-owned
# and mode 0600. deploy.sh writes them; nothing else should.
log "creating /opt/kidlearn"
install -d -m 0755 /opt/kidlearn
install -d -m 0700 /opt/kidlearn/prod
install -d -m 0700 /opt/kidlearn/dev
# caddy.env (ACME endpoint and email, runbook §6) — outside deploy/ so that
# re-copying deploy/ never resets the box to the staging endpoint.
install -d -m 0700 /opt/kidlearn/edge
install -d -m 0755 /opt/kidlearn/deploy

# --- Housekeeping ------------------------------------------------------------
# A 20 GB EBS volume and two repositories of ~750 MB images fills faster than it
# looks, and a full disk takes the PRODUCTION api down with it — one kernel, one
# disk (file 38, "API runtime is soft-isolated"). Weekly, keeping the newest
# KEEP images of each repository so a rollback target is always still on the box.
log "installing the weekly image prune"
cat >/etc/cron.weekly/kidlearn-docker-prune <<'CRON'
#!/bin/sh
# `docker image prune -f` alone only removes dangling layers: every deploy leaves
# the previous SHA-tagged image tagged, so releases would pile up until the disk
# fills. `-a --filter until=` is no better — it keys on build time, so after a
# quiet spell it can delete the very image `IMAGE_TAG=<previous-sha> docker
# compose up -d` needs. Keep the newest KEEP per repository instead; `docker rmi`
# refuses an image a running container uses, so the live release is never lost.
KEEP=4
docker container prune -f
docker image prune -f
docker images --format '{{.Repository}}' | sort -u | while read -r repo; do
  docker images "$repo" --format '{{.CreatedAt}}|{{.ID}}' | sort -r | cut -d'|' -f2 \
    | awk '!seen[$0]++' | tail -n +$((KEEP + 1)) \
    | xargs -r docker rmi 2>/dev/null || true
done
CRON
chmod +x /etc/cron.weekly/kidlearn-docker-prune

log "done — instance is ready for deploy/deploy.sh"
log "NEXT: bring up the edge stack, then the production API stack."
