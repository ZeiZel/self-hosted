{{/*
Expand the name of the chart.
*/}}
{{- define "supabase.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "supabase.fullname" -}}
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
{{- define "supabase.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "supabase.labels" -}}
helm.sh/chart: {{ include "supabase.chart" . }}
{{ include "supabase.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "supabase.selectorLabels" -}}
app.kubernetes.io/name: {{ include "supabase.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Kong labels
*/}}
{{- define "supabase.kong.labels" -}}
{{ include "supabase.labels" . }}
app.kubernetes.io/component: kong
{{- end }}

{{/*
Kong selector labels
*/}}
{{- define "supabase.kong.selectorLabels" -}}
{{ include "supabase.selectorLabels" . }}
app.kubernetes.io/component: kong
{{- end }}

{{/*
Auth labels
*/}}
{{- define "supabase.auth.labels" -}}
{{ include "supabase.labels" . }}
app.kubernetes.io/component: auth
{{- end }}

{{/*
Auth selector labels
*/}}
{{- define "supabase.auth.selectorLabels" -}}
{{ include "supabase.selectorLabels" . }}
app.kubernetes.io/component: auth
{{- end }}

{{/*
Rest labels
*/}}
{{- define "supabase.rest.labels" -}}
{{ include "supabase.labels" . }}
app.kubernetes.io/component: rest
{{- end }}

{{/*
Rest selector labels
*/}}
{{- define "supabase.rest.selectorLabels" -}}
{{ include "supabase.selectorLabels" . }}
app.kubernetes.io/component: rest
{{- end }}

{{/*
Realtime labels
*/}}
{{- define "supabase.realtime.labels" -}}
{{ include "supabase.labels" . }}
app.kubernetes.io/component: realtime
{{- end }}

{{/*
Realtime selector labels
*/}}
{{- define "supabase.realtime.selectorLabels" -}}
{{ include "supabase.selectorLabels" . }}
app.kubernetes.io/component: realtime
{{- end }}

{{/*
Storage labels
*/}}
{{- define "supabase.storage.labels" -}}
{{ include "supabase.labels" . }}
app.kubernetes.io/component: storage
{{- end }}

{{/*
Storage selector labels
*/}}
{{- define "supabase.storage.selectorLabels" -}}
{{ include "supabase.selectorLabels" . }}
app.kubernetes.io/component: storage
{{- end }}

{{/*
Meta labels
*/}}
{{- define "supabase.meta.labels" -}}
{{ include "supabase.labels" . }}
app.kubernetes.io/component: meta
{{- end }}

{{/*
Meta selector labels
*/}}
{{- define "supabase.meta.selectorLabels" -}}
{{ include "supabase.selectorLabels" . }}
app.kubernetes.io/component: meta
{{- end }}

{{/*
Studio labels
*/}}
{{- define "supabase.studio.labels" -}}
{{ include "supabase.labels" . }}
app.kubernetes.io/component: studio
{{- end }}

{{/*
Studio selector labels
*/}}
{{- define "supabase.studio.selectorLabels" -}}
{{ include "supabase.selectorLabels" . }}
app.kubernetes.io/component: studio
{{- end }}

{{/*
Edge Runtime labels
*/}}
{{- define "supabase.edgeRuntime.labels" -}}
{{ include "supabase.labels" . }}
app.kubernetes.io/component: edge-runtime
{{- end }}

{{/*
Edge Runtime selector labels
*/}}
{{- define "supabase.edgeRuntime.selectorLabels" -}}
{{ include "supabase.selectorLabels" . }}
app.kubernetes.io/component: edge-runtime
{{- end }}

{{/*
ImgProxy labels
*/}}
{{- define "supabase.imgproxy.labels" -}}
{{ include "supabase.labels" . }}
app.kubernetes.io/component: imgproxy
{{- end }}

{{/*
ImgProxy selector labels
*/}}
{{- define "supabase.imgproxy.selectorLabels" -}}
{{ include "supabase.selectorLabels" . }}
app.kubernetes.io/component: imgproxy
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "supabase.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "supabase.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
PostgreSQL connection string
*/}}
{{- define "supabase.postgresql.uri" -}}
{{- if .Values.postgresql.external }}
{{- printf "postgresql://%s:%s@%s:%d/%s" .Values.postgresql.user .Values.postgresql.password .Values.postgresql.host (int .Values.postgresql.port) .Values.postgresql.database }}
{{- else }}
{{- printf "postgresql://%s-postgresql:5432/%s" (include "supabase.fullname" .) .Values.postgresql.database }}
{{- end }}
{{- end }}

{{/*
JWT Secret name
*/}}
{{- define "supabase.jwt.secretName" -}}
{{- if .Values.jwt.existingSecret }}
{{- .Values.jwt.existingSecret }}
{{- else }}
{{- printf "%s-jwt" (include "supabase.fullname" .) }}
{{- end }}
{{- end }}

{{/*
PostgreSQL Secret name
*/}}
{{- define "supabase.postgresql.secretName" -}}
{{- if .Values.postgresql.existingSecret }}
{{- .Values.postgresql.existingSecret }}
{{- else }}
{{- printf "%s-postgresql" (include "supabase.fullname" .) }}
{{- end }}
{{- end }}

{{/*
MinIO Secret name
*/}}
{{- define "supabase.minio.secretName" -}}
{{- if .Values.minio.existingSecret }}
{{- .Values.minio.existingSecret }}
{{- else }}
{{- printf "%s-minio" (include "supabase.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Redis Secret name
*/}}
{{- define "supabase.redis.secretName" -}}
{{- if .Values.redis.existingSecret }}
{{- .Values.redis.existingSecret }}
{{- else }}
{{- printf "%s-redis" (include "supabase.fullname" .) }}
{{- end }}
{{- end }}

{{/*
API URL
*/}}
{{- define "supabase.api.url" -}}
{{- if .Values.api.externalUrl }}
{{- .Values.api.externalUrl }}
{{- else if .Values.ingress.api.enabled }}
{{- $host := index .Values.ingress.api.hosts 0 }}
{{- if $host.host }}
{{- printf "https://%s" $host.host }}
{{- else }}
{{- printf "http://%s-kong:8000" (include "supabase.fullname" .) }}
{{- end }}
{{- else }}
{{- printf "http://%s-kong:8000" (include "supabase.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Studio URL
*/}}
{{- define "supabase.studio.url" -}}
{{- if .Values.studio.url }}
{{- .Values.studio.url }}
{{- else if .Values.ingress.studio.enabled }}
{{- $host := index .Values.ingress.studio.hosts 0 }}
{{- if $host.host }}
{{- printf "https://%s" $host.host }}
{{- else }}
{{- printf "http://%s-studio:3000" (include "supabase.fullname" .) }}
{{- end }}
{{- else }}
{{- printf "http://%s-studio:3000" (include "supabase.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Security context for pods
*/}}
{{- define "supabase.podSecurityContext" -}}
{{- if .Values.global.podSecurityContext.enabled }}
fsGroup: {{ .Values.global.podSecurityContext.fsGroup }}
{{- end }}
{{- end }}

{{/*
Security context for containers
*/}}
{{- define "supabase.containerSecurityContext" -}}
{{- if .Values.global.containerSecurityContext.enabled }}
runAsNonRoot: {{ .Values.global.containerSecurityContext.runAsNonRoot }}
allowPrivilegeEscalation: {{ .Values.global.containerSecurityContext.allowPrivilegeEscalation }}
{{- end }}
{{- end }}
