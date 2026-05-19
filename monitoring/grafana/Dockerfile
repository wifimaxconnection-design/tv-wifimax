FROM grafana/grafana:latest

# Provisioning
COPY provisioning /etc/grafana/provisioning

# Dashboards
RUN mkdir -p /var/lib/grafana/dashboards
COPY dashboards /var/lib/grafana/dashboards

USER root
RUN chown -R grafana:root /etc/grafana/provisioning /var/lib/grafana/dashboards
USER grafana
