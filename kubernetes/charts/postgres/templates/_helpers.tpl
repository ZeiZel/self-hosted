{{/*
Expand the name of the chart.
*/}}
{{- define "postgresql.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "postgresql.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "postgresql.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.AppVersion | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
PostgreSQL version
*/}}
{{- define "postgresql.version" -}}
{{- .Values.postgresqlVersion }}
{{- end }}

{{/*
PostgreSQL image tag (автоматически выбирается правильный tag)
*/}}
{{- define "postgresql.imageTag" -}}
{{- if eq .Values.postgresqlVersion "18" }}
18-alpine3.20
{{- else if eq .Values.postgresqlVersion "17" }}
17-alpine3.20
{{- else if eq .Values.postgresqlVersion "16" }}
16-alpine3.20
{{- else if eq .Values.postgresqlVersion "15" }}
15-alpine3.20
{{- else }}
{{ .Values.image.tag }}
{{- end }}
{{- end }}

{{/*
PostgreSQL service name
*/}}
{{- define "postgresql.serviceName" -}}
{{ include "postgresql.fullname" . }}
{{- end }}

{{/*
PostgreSQL headless service name
*/}}
{{- define "postgresql.headlessServiceName" -}}
{{ include "postgresql.fullname" . }}-headless
{{- end }}

{{/*
PostgreSQL read service name
*/}}
{{- define "postgresql.readServiceName" -}}
{{ include "postgresql.fullname" . }}-read
{{- end }}

{{/*
PgBouncer service name
*/}}
{{- define "pgbouncer.serviceName" -}}
{{ include "postgresql.fullname" . }}-pgbouncer
{{- end }}

{{/*
PgAdmin service name
*/}}
{{- define "pgadmin.serviceName" -}}
{{ include "postgresql.fullname" . }}-pgadmin
{{- end }}

{{/*
Secret name
*/}}
{{- define "postgresql.secretName" -}}
{{ include "postgresql.fullname" . }}-secrets
{{- end }}

{{/*
ConfigMap name
*/}}
{{- define "postgresql.configMapName" -}}
{{ include "postgresql.fullname" . }}-config
{{- end }}

{{/*
Connection string for applications (PostgreSQL 18 ready)
*/}}
{{- define "postgresql.connString" -}}
postgresql://{{ .Values.postgresql.config.superuser }}:$(POSTGRES_PASSWORD)@{{ include "postgresql.serviceName" . }}:{{ .Values.postgresql.service.port }}/{{ .Values.postgresql.config.database }}?sslmode=disable
{{- end }}

{{/*
Database URL for applications
*/}}
{{- define "postgresql.databaseUrl" -}}
postgres://{{ .Values.postgresql.config.superuser }}:$(POSTGRES_PASSWORD)@{{ include "postgresql.serviceName" . }}:{{ .Values.postgresql.service.port }}/{{ .Values.postgresql.config.database }}?sslmode=disable
{{- end }}

{{/*
PgBouncer connection string
*/}}
{{- define "postgresql.pgbouncerConnString" -}}
postgresql://{{ .Values.postgresql.config.superuser }}:$(POSTGRES_PASSWORD)@{{ include "pgbouncer.serviceName" . }}:{{ .Values.pgbouncer.service.port }}/{{ .Values.postgresql.config.database }}
{{- end }}

{{/*
Check if PostgreSQL version is 18+
*/}}
{{- define "postgresql.isV18" -}}
{{- if or (eq .Values.postgresqlVersion "18") }}true{{ end }}
{{- end }}

{{/*
Check if PostgreSQL version is 17+
*/}}
{{- define "postgresql.isV17OrHigher" -}}
{{- if or (eq .Values.postgresqlVersion "17") (eq .Values.postgresqlVersion "18") }}true{{ end }}
{{- end }}
