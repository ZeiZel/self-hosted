{{/*
chart-base: shared name/label/securityContext helpers. Generalised from the
per-chart _helpers.tpl so consuming charts get identical naming + labels.
All templates run in the CONSUMER's context (.Chart/.Values/.Release).
*/}}

{{- define "chart-base.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "chart-base.fullname" -}}
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

{{- define "chart-base.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "chart-base.selectorLabels" -}}
app.kubernetes.io/name: {{ include "chart-base.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "chart-base.labels" -}}
helm.sh/chart: {{ include "chart-base.chart" . }}
{{ include "chart-base.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: self-hosted
{{- end }}

{{- define "chart-base.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "chart-base.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Mandatory pod-level security context (arch-rules). Consumers may override via
.Values.podSecurityContext.
*/}}
{{- define "chart-base.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: {{ .Values.podSecurityContext.runAsUser | default 1000 }}
fsGroup: {{ .Values.podSecurityContext.fsGroup | default 1000 }}
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{/*
Mandatory container-level security context.
*/}}
{{- define "chart-base.securityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: {{ .Values.securityContext.readOnlyRootFilesystem | default true }}
capabilities:
  drop: [ALL]
{{- end }}
