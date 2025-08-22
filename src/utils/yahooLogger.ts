interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category: string;
  message: string;
  data?: any;
}

class YahooLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 500;
  private listeners: ((logs: LogEntry[]) => void)[] = [];

  private log(level: LogEntry['level'], category: string, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data ? JSON.parse(JSON.stringify(data)) : undefined
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Console logging with masked sensitive data
    const maskedData = this.maskSensitiveData(data);
    const consoleMethod = level === 'ERROR' ? console.error : 
                         level === 'WARN' ? console.warn : console.log;
    
    consoleMethod(`[YAHOO ${level}] ${category}: ${message}`, maskedData || '');

    // Notify listeners
    this.listeners.forEach(listener => listener([...this.logs]));
  }

  private maskSensitiveData(data: any): any {
    if (!data) return data;
    
    const masked = { ...data };
    
    // Mask tokens but show first 10-20 chars for debugging
    if (masked.accessToken) {
      masked.accessToken = masked.accessToken.substring(0, 15) + '...';
    }
    if (masked.refreshToken) {
      masked.refreshToken = masked.refreshToken.substring(0, 15) + '...';
    }
    if (masked.Authorization) {
      masked.Authorization = masked.Authorization.substring(0, 25) + '...';
    }

    return masked;
  }

  info(category: string, message: string, data?: any) {
    this.log('INFO', category, message, data);
  }

  warn(category: string, message: string, data?: any) {
    this.log('WARN', category, message, data);
  }

  error(category: string, message: string, data?: any) {
    this.log('ERROR', category, message, data);
  }

  debug(category: string, message: string, data?: any) {
    this.log('DEBUG', category, message, data);
  }

  // Log token details
  logTokens(category: string, tokens: any, action: string) {
    this.info(category, `Token ${action}`, {
      hasAccessToken: !!tokens?.accessToken,
      hasRefreshToken: !!tokens?.refreshToken,
      accessTokenPreview: tokens?.accessToken?.substring(0, 15) + '...',
      refreshTokenPreview: tokens?.refreshToken?.substring(0, 15) + '...',
      expiresAt: tokens?.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
      tokenType: tokens?.tokenType,
      isExpired: tokens?.expiresAt ? Date.now() >= tokens.expiresAt : null
    });
  }

  // Log localStorage state
  logLocalStorage(category: string, action: string) {
    const tokens = localStorage.getItem('yahoo_oauth_tokens');
    const userInfo = localStorage.getItem('yahoo_user_info');
    const state = localStorage.getItem('yahoo_oauth_state');

    this.debug(category, `LocalStorage ${action}`, {
      hasTokens: !!tokens,
      hasUserInfo: !!userInfo,
      hasState: !!state,
      tokensSize: tokens?.length || 0,
      userInfoSize: userInfo?.length || 0,
      stateSize: state?.length || 0
    });
  }

  // Log API request/response
  logAPICall(category: string, url: string, options: any, response?: any, error?: any) {
    const requestData = {
      url,
      method: options.method || 'GET',
      headers: this.maskSensitiveData(options.headers),
      body: options.body ? JSON.parse(options.body) : undefined,
      hasBody: !!options.body
    };

    if (error) {
      this.error(category, `API call failed: ${url}`, {
        request: requestData,
        error: error.message || error,
        stack: error.stack
      });
    } else {
      this.info(category, `API call: ${url}`, {
        request: requestData,
        response: {
          status: response?.status,
          statusText: response?.statusText,
          ok: response?.ok,
          headers: Object.fromEntries(response?.headers?.entries() || [])
        }
      });
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  addListener(listener: (logs: LogEntry[]) => void) {
    this.listeners.push(listener);
  }

  removeListener(listener: (logs: LogEntry[]) => void) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  clearLogs() {
    this.logs = [];
    this.listeners.forEach(listener => listener([]));
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const yahooLogger = new YahooLogger();