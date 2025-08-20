interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBackoff: boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 8000,  // 8 seconds
  exponentialBackoff: true,
};

export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain types of errors
      if (error instanceof APIError && error.status) {
        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          throw error;
        }
      }

      // If this was the last attempt, throw the error
      if (attempt === opts.maxRetries) {
        break;
      }

      // Calculate delay for next attempt
      let delay = opts.baseDelay;
      if (opts.exponentialBackoff) {
        delay = Math.min(opts.baseDelay * Math.pow(2, attempt), opts.maxDelay);
      }

      // Add some jitter to prevent thundering herd
      delay += Math.random() * 1000;

      console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function createErrorHandler(context: string) {
  return (error: any): APIError => {
    console.error(`${context} error:`, error);
    
    if (error instanceof APIError) {
      return error;
    }

    if (error.name === 'AbortError') {
      return new APIError('Request was cancelled', 0);
    }

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return new APIError('Network error - please check your internet connection');
    }

    return new APIError(
      error.message || `An error occurred in ${context}`,
      error.status
    );
  };
}

export function isRetryableError(error: any): boolean {
  if (error instanceof APIError) {
    // Retry on server errors (5xx) and rate limits (429)
    return (error.status >= 500) || error.status === 429;
  }

  // Retry on network errors
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return true;
  }

  return false;
}

export class ConnectionStatus {
  private static instance: ConnectionStatus;
  private isOnline: boolean = navigator.onLine;
  private listeners: Set<(online: boolean) => void> = new Set();

  static getInstance(): ConnectionStatus {
    if (!ConnectionStatus.instance) {
      ConnectionStatus.instance = new ConnectionStatus();
    }
    return ConnectionStatus.instance;
  }

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.setOnline(true));
      window.addEventListener('offline', () => this.setOnline(false));
    }
  }

  private setOnline(online: boolean) {
    if (this.isOnline !== online) {
      this.isOnline = online;
      this.listeners.forEach(listener => listener(online));
    }
  }

  getStatus(): boolean {
    return this.isOnline;
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const connectionStatus = ConnectionStatus.getInstance();