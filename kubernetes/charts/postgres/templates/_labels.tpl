{{/*
Common labels
*/}}
{{- define "postgresql.labels" -}}
helm.sh/chart: {{ include "postgresql.chart" . }}
{{ include "postgresql.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.global.labels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "postgresql.selectorLabels" -}}
app.kubernetes.io/name: {{ include "postgresql.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
PostgreSQL component labels
*/}}
{{- define "postgresql.componentLabels" -}}
{{ include "postgresql.labels" . }}
app.kubernetes.io/component: database
{{- end }}

{{/*
PgBouncer component labels
*/}}
{{- define "pgbouncer.labels" -}}
app.kubernetes.io/name: {{ include "postgresql.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: connection-pool
{{ include "postgresql.labels" . }}
{{- end }}

{{/*
PgAdmin component labels
*/}}
{{- define "pgadmin.labels" -}}
app.kubernetes.io/name: {{ include "postgresql.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: admin
{{ include "postgresql.labels" . }}
{{- end }}

{{/*
Backup job labels
*/}}
{{- define "postgresql.backupJobLabels" -}}
app.kubernetes.io/name: {{ include "postgresql.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: backup
{{ include "postgresql.labels" . }}
{{- end }}
