{{/*
chart-base.deployment — a compliant Deployment with security context, probes,
resource limits and an emptyDir /tmp (for readOnlyRootFilesystem).
*/}}
{{- define "chart-base.deployment" -}}
{{- $probes := .Values.probes | default dict }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "chart-base.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "chart-base.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount | default 1 }}
  selector:
    matchLabels:
      {{- include "chart-base.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "chart-base.selectorLabels" . | nindent 8 }}
      {{- with .Values.podAnnotations }}
      annotations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
    spec:
      serviceAccountName: {{ include "chart-base.serviceAccountName" . }}
      securityContext:
        {{- include "chart-base.podSecurityContext" . | nindent 8 }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy | default "IfNotPresent" }}
          securityContext:
            {{- include "chart-base.securityContext" . | nindent 12 }}
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort | default .Values.service.port }}
              protocol: TCP
          {{- with .Values.env }}
          env:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.envFrom }}
          envFrom:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with $probes.liveness }}
          livenessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with $probes.readiness }}
          readinessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with $probes.startup }}
          startupProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            {{- with .Values.volumeMounts }}
            {{- toYaml . | nindent 12 }}
            {{- end }}
      volumes:
        - name: tmp
          emptyDir: {}
        {{- with .Values.volumes }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
{{- end }}
