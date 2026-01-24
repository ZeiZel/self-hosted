{{/*
Expand the name of the chart.
*/}}
{{- define "coder.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "coder.fullname" -}}
{{- if .Values.nameOverride }}
{{- .Values.nameOverride | trunc 63 | trimSuffix "-" }}
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
{{- define "coder.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "coder.labels" -}}
helm.sh/chart: {{ include "coder.chart" . }}
{{ include "coder.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "coder.selectorLabels" -}}
app.kubernetes.io/name: {{ include "coder.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "coder.serviceAccountName" -}}
{{- default (include "coder.fullname" .) .Values.serviceAccount.name }}
{{- end }}

{{/*
PostgreSQL connection string
*/}}
{{- define "coder.postgresUrl" -}}
{{- if .Values.coder.postgres.external }}
{{- printf "postgres://%s:%s@%s:%d/%s?sslmode=%s" .Values.coder.postgres.user .Values.coder.postgres.password .Values.coder.postgres.host (.Values.coder.postgres.port | int) .Values.coder.postgres.database .Values.coder.postgres.sslMode }}
{{- end }}
{{- end }}

{{/*
Coder access URL
*/}}
{{- define "coder.accessUrl" -}}
{{- if .Values.coder.config.accessUrl }}
{{- .Values.coder.config.accessUrl }}
{{- else }}
{{- printf "https://%s" (index .Values.ingress.hosts 0).host }}
{{- end }}
{{- end }}

{{/*
Pod security context
*/}}
{{- define "coder.podSecurityContext" -}}
{{- toYaml .Values.podSecurityContext }}
{{- end }}

{{/*
Container security context
*/}}
{{- define "coder.containerSecurityContext" -}}
{{- toYaml .Values.containerSecurityContext }}
{{- end }}
