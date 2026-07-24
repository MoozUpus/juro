# Миграция маршрутов конструктора документов

| Старый URL | Новый URL | Тип | Состояние |
|---|---|---:|---|
| `/document-builder/library` | `/document-builder` | 308 | Реализован |
| `/document-builder/library/{category}` | `/document-builder/{category}` | 308 | Реализован |
| `/document-builder/library/{category}/{code}` | `/document-builder/{category}/{code}` | 308 | Реализован |
| `/document-builder` (прежний экран расписки) | `/document-builder/debt/0602001` | внутренняя миграция | Реализован как карточка в единой библиотеке |

При перенаправлении корневой библиотеки сохраняются только безопасные параметры `lang`, `q`, `category`, `status` и `resume`. Для ссылки документа сохраняются только `lang`, `resume`, `draft` и `invitation`. Email, телефон, Ф.И.О. и другие персональные данные не переносятся в URL.
