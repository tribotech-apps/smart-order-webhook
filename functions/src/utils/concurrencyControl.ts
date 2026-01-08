// Map para controlar processamento concorrente por conversa
const processingLocks = new Map<string, boolean>();

/**
 * Função wrapper para garantir que apenas uma operação por lockKey seja executada por vez
 * Automaticamente remove o lock quando a operação termina (sucesso ou erro)
 */
export async function withLock<T>(
  lockKey: string, 
  operation: () => Promise<T>
): Promise<T | undefined> {
  if (processingLocks.get(lockKey)) {
    console.log(`⚠️ Operação ignorada - ${lockKey} já está sendo processada`);
    return;
  }
  
  processingLocks.set(lockKey, true);
  
  try {
    return await operation();
  } finally {
    processingLocks.delete(lockKey);
  }
}

/**
 * Gera uma chave de lock única para uma conversa
 */
export function generateLockKey(phoneNumber: string, storeId: string): string {
  return `${phoneNumber}_${storeId}`;
}

/**
 * Verifica se uma conversa está sendo processada
 */
export function isLocked(lockKey: string): boolean {
  return processingLocks.get(lockKey) || false;
}