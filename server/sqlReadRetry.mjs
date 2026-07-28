const SQL_DEADLOCK_NUMBER = 1205;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;

function sqlErrorNumber(error) {
  return Number(
    error?.number
    ?? error?.originalError?.number
    ?? error?.originalError?.info?.number,
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function executeSqlReadWithDeadlockRetry(operation, {
  sleep = wait,
} = {}) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (sqlErrorNumber(error) !== SQL_DEADLOCK_NUMBER || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      await sleep(BASE_DELAY_MS * attempt);
    }
  }
  throw new Error("SQL okuma yeniden deneme sınırına ulaştı.");
}
