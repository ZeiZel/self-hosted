{{- define "chart-base.service" -}}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "chart-base.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "chart-base.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type | default "ClusterIP" }}
  selector:
    {{- include "chart-base.selectorLabels" . | nindent 4 }}
  ports:
    - name: http
      port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.targetPort | default .Values.service.port }}
      protocol: TCP
{{- end }}
