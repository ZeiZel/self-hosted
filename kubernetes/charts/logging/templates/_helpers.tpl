{{/*
Expand the name of the chart.
*/}}
{{- define "logging.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "logging.fullname" -}}
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
{{- define "logging.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "logging.labels" -}}
helm.sh/chart: {{ include "logging.chart" . }}
{{ include "logging.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "logging.selectorLabels" -}}
app.kubernetes.io/name: {{ include "logging.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "logging.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "logging.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Generate initial master nodes list for Elasticsearch cluster.
Produces "elasticsearch-0,elasticsearch-1,elasticsearch-2" for replicaCount=3.
*/}}
{{- define "elasticsearch.initialMasterNodes" -}}
{{- $nodes := list -}}
{{- range $i := until (int .Values.elasticsearch.replicaCount) -}}
{{- $nodes = append $nodes (printf "elasticsearch-%d" $i) -}}
{{- end -}}
{{- join "," $nodes -}}
{{- end -}}
