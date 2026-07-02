{{/*
chart-base helpers. chart-base is used as a SUBCHART, so .Chart.Name is
"chart-base" — resource names are therefore based on .Release.Name (which equals
the helmfile release / service name), with an optional fullnameOverride.
*/}}

{{- define "chart-base.fullname" -}}
{{- default .Release.Name .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "chart-base.name" -}}
{{- default .Release.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* A name for a named child object: "<fullname>-<suffix>" (suffix optional). */}}
{{- define "chart-base.childname" -}}
{{- $top := index . 0 -}}{{- $suffix := index . 1 -}}
{{- if $suffix -}}
{{- printf "%s-%s" (include "chart-base.fullname" $top) $suffix | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- include "chart-base.fullname" $top -}}
{{- end -}}
{{- end }}

{{- define "chart-base.selectorLabels" -}}
app.kubernetes.io/name: {{ include "chart-base.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "chart-base.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "chart-base.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: self-hosted
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{- define "chart-base.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "chart-base.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/* Mandatory pod-level security context (overridable). */}}
{{- define "chart-base.podSecurityContext" -}}
{{- $d := dict "runAsNonRoot" true "runAsUser" 1000 "fsGroup" 1000 "seccompProfile" (dict "type" "RuntimeDefault") -}}
{{- toYaml (mergeOverwrite $d (.Values.podSecurityContext | default dict)) -}}
{{- end }}

{{/* Mandatory container-level security context (overridable). */}}
{{- define "chart-base.securityContext" -}}
{{- $d := dict "allowPrivilegeEscalation" false "readOnlyRootFilesystem" true "capabilities" (dict "drop" (list "ALL")) -}}
{{- toYaml (mergeOverwrite $d (.Values.securityContext | default dict)) -}}
{{- end }}
