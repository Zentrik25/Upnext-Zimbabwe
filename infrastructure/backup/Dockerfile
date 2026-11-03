# Backup job image: the pinned PostgreSQL client tools plus the off-server copy tools offsite.sh can use.
FROM postgres:18.6-trixie@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336
RUN apt-get update \
 && apt-get install -y --no-install-recommends rclone rsync openssh-client \
 && rm -rf /var/lib/apt/lists/*
COPY backup.sh restore.sh prune.sh offsite.sh measure-restore.sh /opt/backup/
RUN chmod 0555 /opt/backup/*.sh && mkdir -p /backups && chown postgres:postgres /backups && chmod 0700 /backups
USER postgres
ENTRYPOINT ["bash", "/opt/backup/backup.sh"]
