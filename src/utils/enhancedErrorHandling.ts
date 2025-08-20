import { APIError, withRetry, createErrorHandler, isRetryableError } from './errorHandling';

interface RateLimitInfo {
  isRateLimited: boolean;
  retryAfter: number; // seconds
  requestsRemaining: number;
  resetTime: Date | null;
}

interface ApiRequestOptions {
  maxRetries?: number;
  respectRateLimit?: boolean;
  timeout?: number;
  retryDelay?: number;
}

class EnhancedAPIErrorHandler {
  private rateLimitInfo: Map<string, RateLimitInfo> = new Map();
  private requestQueue: Map<string, Promise<any>[]> = new Map();

  async makeRequest<T>(
    endpoint: string,
    requestFn: () => Promise<T>,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      respectRateLimit = true,
      timeout = 10000,
      retryDelay = 1000
    } = options;

    // Check if we're currently rate limited for this endpoint
    if (respectRateLimit && this.isCurrentlyRateLimited(endpoint)) {
      const rateLimitInfo = this.rateLimitInfo.get(endpoint);
      if (rateLimitInfo) {
        const waitTime = rateLimitInfo.retryAfter * 1000;
        console.log(`Rate limited for ${endpoint}, waiting ${waitTime}ms`);
        await this.delay(waitTime);
      }
    }

    const requestWithTimeout = () => {
      return Promise.race([
        requestFn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new APIError('Request timeout', 408)), timeout)
        )
      ]);
    };

    return withRetry(async () => {
      try {
        const result = await requestWithTimeout();
        
        // Clear rate limit info on successful request
        this.rateLimitInfo.delete(endpoint);
        
        return result;
      } catch (error) {
        // Handle rate limiting
        if (error instanceof APIError && error.status === 429) {
          this.handleRateLimit(endpoint, error.response);
          throw error;
        }

        // Handle other API errors
        if (error instanceof APIError && error.status && error.status >= 400) {
          this.logApiError(endpoint, error);
          
          // Don't retry client errors (except rate limits)
          if (error.status < 500 && error.status !== 429) {
            throw error;
          }
        }

        throw error;
      }
    }, {
      maxRetries,
      baseDelay: retryDelay,
      exponentialBackoff: true,
    });
  }

  private isCurrentlyRateLimited(endpoint: string): boolean {
    const rateLimitInfo = this.rateLimitInfo.get(endpoint);
    if (!rateLimitInfo) return false;

    const now = new Date();
    if (rateLimitInfo.resetTime && now > rateLimitInfo.resetTime) {
      this.rateLimitInfo.delete(endpoint);
      return false;
    }

    return rateLimitInfo.isRateLimited;
  }

  private handleRateLimit(endpoint: string, response: any) {
    const retryAfter = parseInt(response?.headers?.['retry-after'] || '60');
    const requestsRemaining = parseInt(response?.headers?.['x-ratelimit-remaining'] || '0');
    const resetTime = response?.headers?.['x-ratelimit-reset'] 
      ? new Date(parseInt(response.headers['x-ratelimit-reset']) * 1000)
      : new Date(Date.now() + retryAfter * 1000);

    this.rateLimitInfo.set(endpoint, {
      isRateLimited: true,
      retryAfter,
      requestsRemaining,
      resetTime,
    });

    console.warn(`Rate limited on ${endpoint}:`, {
      retryAfter,
      requestsRemaining,
      resetTime: resetTime.toISOString(),
    });
  }

  private logApiError(endpoint: string, error: APIError) {
    console.error(`API Error on ${endpoint}:`, {
      status: error.status,
      message: error.message,
      response: error.response,
      timestamp: new Date().toISOString(),
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRateLimitStatus(endpoint: string): RateLimitInfo | null {
    return this.rateLimitInfo.get(endpoint) || null;
  }

  clearRateLimit(endpoint: string) {
    this.rateLimitInfo.delete(endpoint);
  }

  getAllRateLimits(): Map<string, RateLimitInfo> {
    return new Map(this.rateLimitInfo);
  }
}

// Singleton instance
export const enhancedAPIHandler = new EnhancedAPIErrorHandler();

// Enhanced error messages for users
export const getUserFriendlyErrorMessage = (error: any): string => {
  if (error instanceof APIError) {
    switch (error.status) {
      case 400:
        return 'Invalid request. Please check your league settings.';
      case 401:
        return 'Authentication failed. Please check your API credentials.';
      case 403:
        return 'Access denied. You may not have permission to view this league.';
      case 404:
        return 'League not found. Please verify the league ID is correct.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'Fantasy platform is experiencing issues. Please try again later.';
      case 502:
      case 503:
      case 504:
        return 'Fantasy platform is temporarily unavailable. Please try again in a few minutes.';
      default:
        return `Service error (${error.status}). Please try again later.`;
    }
  }

  if (error.name === 'AbortError') {
    return 'Request was cancelled. Please try again.';
  }

  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return 'Network connection error. Please check your internet connection.';
  }

  return 'An unexpected error occurred. Please try again.';
};

// Network connectivity checker
export class NetworkConnectivity {
  private static isChecking = false;
  
  static async checkConnectivity(): Promise<boolean> {
    if (this.isChecking) return navigator.onLine;
    
    this.isChecking = true;
    
    try {
      // Try to fetch a small resource to verify actual connectivity
      const response = await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      });
      
      this.isChecking = false;
      return response.ok;
    } catch {
      this.isChecking = false;
      return false;
    }
  }

  static async waitForConnection(maxWaitTime = 30000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      if (await this.checkConnectivity()) {
        return true;
      }
      
      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return false;
  }
}