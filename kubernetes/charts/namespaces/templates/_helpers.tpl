{{/*
Expand the name of the chart.
*/}}
{{- define "namespaces.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "namespaces.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels for all namespaces
*/}}
{{- define "namespaces.labels" -}}
helm.sh/chart: {{ include "namespaces.chart" . }}
app.kubernetes.io/name: {{ include "namespaces.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{/*
Create namespace metadata labels
*/}}
{{- define "namespaces.namespace.labels" -}}
{{ toYaml .Values.globalLabels }}
{{- with .Values.namespaceLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}
