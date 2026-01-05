# Monitoring Stack

A complete monitoring solution with Varnish, Prometheus, Loki, and Grafana.

[Guide](https://www.varnish-software.com/developers/tutorials/monitoring-varnish-prometheus-loki-grafana/)

## Components

- **Varnish**: HTTP accelerator and reverse proxy
- **Prometheus**: Metrics collection and storage
- **Loki**: Log aggregation system
- **Grafana**: Visualization and dashboards
- **Promtail**: Log shipper for Loki

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. (Optional) Customize configuration paths in `.env`

3. Start the service:
   ```bash
   docker compose up -d
   ```

4. Access services:
   - Grafana: `http://localhost:3000`
   - Varnish: `http://localhost:8080`
   - Prometheus: `http://localhost:9090` (if exposed)

## Configuration

- Edit `./conf/prometheus.yml` for Prometheus configuration
- Edit `./conf/grafana/grafana.ini` for Grafana settings
- Edit `./conf/default.vcl` for Varnish configuration
