---
sidebar_position: 2
---

# Что нам нужно для старта

## Утилиты

- docker - контейнеризация
- kubernetes - оркестрация
  - helm
  - helmfile
- terraform - выделение ресурсов
- ansible - автоматизация подготовки окружений
- sops - работа с зашированными переменными

## Команды запуска



Инициализация helmfile

```bash
helmfile init --force
```

Кластерной базой является [kubespray](https://github.com/kubernetes-sigs/kubespray?tab=readme-ov-file)


