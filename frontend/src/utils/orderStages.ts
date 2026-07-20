export const isPaused = (status: string | undefined | null): boolean => {
  return status?.startsWith('PAUSED') ?? false;
};

export const getMacroStage = (status: string | undefined | null): string => {
  if (!status) return 'UNKNOWN';

  if (status === 'PAUSED') {
    return 'PAUSE';
  }
  if (['MEASUREMENT_SCHEDULING', 'MEASUREMENT_PRE_SCHEDULED', 'PAUSED_MEASUREMENT_SCHEDULING'].includes(status)) {
    return 'MEASUREMENT_SCHEDULING';
  }
  if (status.startsWith('MEASUREMENT_')) {
    return 'MEASUREMENT';
  }
  if (status.startsWith('ENGINEERING_') || status === 'CLIENT_APPROVAL') {
    return 'ENGINEERING';
  }
  if (status.startsWith('PRODUCTION_') || status === 'IN_PRODUCTION') {
    return 'MANUFACTURING';
  }
  if (status.startsWith('DELIVERY_') || status === 'READY_FOR_PICKUP') {
    return 'DELIVERY';
  }
  if (['INSTALLATION_SCHEDULING', 'PAUSED_INSTALLATION_SCHED'].includes(status)) {
    return 'INSTALLATION_SCHEDULING';
  }
  if (status.startsWith('INSTALLATION_')) {
    return 'INSTALLATION';
  }
  if (status === 'COMPLETED' || status === 'CLOSED') {
    return 'CLOSING';
  }
  if (status === 'CANCELLED') {
    return 'CANCELLED';
  }
  
  return 'UNKNOWN';
};

export const MACRO_STAGE_LABELS: Record<string, string> = {
  'PAUSE': 'НА ПАУЗІ',
  'MEASUREMENT_SCHEDULING': 'ПЛАНУВАННЯ ЗАМІРУ',
  'MEASUREMENT': 'ЗАМІР',
  'ENGINEERING': 'КОНСТРУКТИВ',
  'MANUFACTURING': 'ВИРОБНИЦТВО',
  'DELIVERY': 'ДОСТАВКА',
  'INSTALLATION_SCHEDULING': 'ПЛАНУВАННЯ МОНТАЖУ',
  'INSTALLATION': 'МОНТАЖ',
  'CLOSING': 'ЗАВЕРШЕНО',
  'CANCELLED': 'СКАСОВАНО',
  'UNKNOWN': 'НЕВІДОМО'
};

export const TASK_STAGE_LABELS: Record<string, string> = {
  'MEASUREMENT_SCHEDULING': 'Планування заміру',
  'ENGINEERING': 'Конструктив',
  'INSTALLATION_SCHEDULING': 'Планування Монтажу',
  'DELIVERY_SCHEDULING': 'Планування Доставок',
  'MEASUREMENT': 'ЗАмір',
  'DELIVERY': 'Доставки',
  'INSTALLATION': 'Монтаж',
  'MANUFACTURING': 'Виробництво'
};


export const STATUS_LABELS: Record<string, string> = {
  // PAUSED
  'PAUSED': 'На паузі',
  'PAUSED_MEASUREMENT_SCHEDULING': 'Відправлено на паузу',
  'PAUSED_ENGINEERING': 'Відправлено на паузу',
  'PAUSED_PRODUCTION': 'Відправлено на паузу',
  'PAUSED_INSTALLATION_SCHED': 'Відправлено на паузу',
  'PAUSED_DELIVERY': 'Відправлено на паузу',

  // MEASUREMENT
  'MEASUREMENT_SCHEDULING': 'Очікує планування заміру',
  'MEASUREMENT_PRE_SCHEDULED': 'Попередньо заплановано',
  'MEASUREMENT_SCHEDULED': 'Очікує замір (Заплановано)',
  'MEASUREMENT_IN_PROGRESS': 'Замір в роботі',
  'MEASUREMENT_FINISHED_ON_SITE': "Завершив роботу на об'єкті",
  'MEASUREMENT_COMPLETED': 'Замір виконано',
  'MEASUREMENT_FAILED': 'Замір не відбувся',
  'MEASUREMENT_CANCELED_BY_MEASURER': 'Скасовано замірником',

  // ENGINEERING
  'ENGINEERING_QUEUE': 'Очікує конструювання',
  'ENGINEERING_IN_PROGRESS': 'Конструювання в роботі',
  'CLIENT_APPROVAL': 'Очікує погодження клієнта',
  'ENGINEERING_NESTING': 'Підготовка розкрою',

  // PRODUCTION
  'PRODUCTION_QUEUE': 'В черзі на виробництво',
  'IN_PRODUCTION': 'У виробництві',
  'PRODUCTION_COMPLETED': 'Готово на складі',

  // DELIVERY
  'DELIVERY_SCHEDULING': 'Очікує планування доставки',
  'DELIVERY_IN_TRANSIT': 'В дорозі',
  'READY_FOR_PICKUP': 'Готово до самовивозу',

  // INSTALLATION
  'INSTALLATION_SCHEDULING': 'Очікує планування монтажу',
  'INSTALLATION_SCHEDULED': 'Очікує монтаж (Заплановано)',
  'INSTALLATION_IN_PROGRESS': 'Монтаж в роботі',
  'INSTALLATION_FINISHED_ON_SITE': "Завершили роботу на об'єкті",
  'INSTALLATION_COMPLETED': 'Монтаж виконано',
  'INSTALLATION_FAILED': 'Монтаж не відбувся',
  'INSTALLATION_RECLAMATION': 'Проблема на монтажі (Рекламація)',

  // GLOBAL
  'COMPLETED': 'Завершено',
  'CANCELLED': 'Скасовано'
};
