export interface ProductionStage {
  id: string;
  name: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  progress: number; // 0 to 100
  timeElapsedMinutes: number;
  timeRemainingMinutes: number;
  totalEstimatedMinutes: number;
}

export interface ProductionMockData {
  totalProgress: number; // 0 to 100
  totalTimeRemainingMinutes: number;
  stages: ProductionStage[];
  currentStageName: string;
}

const STAGE_NAMES = [
  'Розкрій (Cutting)',
  'Кромкування (Edge Banding)',
  'Присадка / Фрезерування (Milling)',
  'Шліфовка (Sanding)',
  'Поліровка (Polishing)',
  'Упаковка (Packaging)'
];

const BASE_TIMES = [120, 60, 180, 90, 60, 30]; // estimated minutes per stage

// Simple hash function for deterministic randomness based on string
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function generateMesDataForOrder(orderId: string): ProductionMockData {
  const hash = hashString(orderId);
  
  // Decide how far along this order is (from 0 to 5)
  // Let's bias it so some are finished, some are just starting
  const currentStageIndex = hash % STAGE_NAMES.length;
  const currentStageProgress = (hash % 100); // 0 to 99

  let totalEstimated = 0;
  let totalElapsed = 0;
  let totalRemaining = 0;

  const stages: ProductionStage[] = STAGE_NAMES.map((name, index) => {
    // Add some deterministic variance to times (+- 20%)
    const variance = ((hash + index) % 40) - 20; 
    const estimatedMinutes = Math.floor(BASE_TIMES[index] * (1 + variance / 100));
    totalEstimated += estimatedMinutes;

    let status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
    let progress = 0;
    let timeElapsedMinutes = 0;
    let timeRemainingMinutes = 0;

    if (index < currentStageIndex) {
      status = 'COMPLETED';
      progress = 100;
      timeElapsedMinutes = estimatedMinutes;
      timeRemainingMinutes = 0;
    } else if (index === currentStageIndex) {
      status = 'IN_PROGRESS';
      progress = currentStageProgress;
      timeElapsedMinutes = Math.floor(estimatedMinutes * (progress / 100));
      timeRemainingMinutes = estimatedMinutes - timeElapsedMinutes;
    } else {
      status = 'PENDING';
      progress = 0;
      timeElapsedMinutes = 0;
      timeRemainingMinutes = estimatedMinutes;
    }

    totalElapsed += timeElapsedMinutes;
    totalRemaining += timeRemainingMinutes;

    return {
      id: `stage-${index}`,
      name,
      status,
      progress,
      timeElapsedMinutes,
      timeRemainingMinutes,
      totalEstimatedMinutes: estimatedMinutes
    };
  });

  const totalProgress = Math.floor((totalElapsed / totalEstimated) * 100);

  return {
    totalProgress,
    totalTimeRemainingMinutes: totalRemaining,
    stages,
    currentStageName: STAGE_NAMES[currentStageIndex]
  };
}
