export interface DebugLogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'api';
  category: string;
  message: string;
  data?: any;
}

class DebugLogger {
  private logs: DebugLogEntry[] = [];
  private maxLogs = 50;
  private debugEnabled = false;
  private listeners: ((logs: DebugLogEntry[]) => void)[] = [];

  setDebugMode(enabled: boolean) {
    this.debugEnabled = enabled;
    if (enabled) {
      this.info('DEBUG', 'Debug logging enabled', { timestamp: new Date().toISOString() });
    }
  }

  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  private addLog(type: DebugLogEntry['type'], category: string, message: string, data?: any) {
    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type,
      category,
      message,
      data
    };

    this.logs.unshift(entry);
    
    // Keep only the latest logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Console logging with emojis
    const emoji = this.getEmoji(type);
    const timestamp = new Date().toLocaleTimeString();
    
    // Always log simulation and error messages, even if debug is disabled
    if (this.debugEnabled || type === 'error' || category === 'SIMULATION') {
      console.log(`${emoji} [${category}] ${message}`, {
        timestamp,
        data,
        ...entry
      });
    }

    // Notify listeners
    this.listeners.forEach(listener => listener([...this.logs]));
  }

  private getEmoji(type: DebugLogEntry['type']): string {
    switch (type) {
      case 'info': return '🔍';
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'api': return '🌐';
      default: return '📝';
    }
  }

  info(category: string, message: string, data?: any) {
    this.addLog('info', category, message, data);
  }

  success(category: string, message: string, data?: any) {
    this.addLog('success', category, message, data);
  }

  error(category: string, message: string, data?: any) {
    this.addLog('error', category, message, data);
  }

  warning(category: string, message: string, data?: any) {
    this.addLog('warning', category, message, data);
  }

  api(category: string, message: string, data?: any) {
    this.addLog('api', category, message, data);
  }

  getLogs(): DebugLogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this.listeners.forEach(listener => listener([]));
  }

  exportLogs(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      logs: this.logs
    }, null, 2);
  }

  onLogsUpdate(listener: (logs: DebugLogEntry[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // League addition specific logging
  logLeagueAdditionStart(leagueId: string) {
    this.info('LEAGUE_ADD', 'League Addition Started', {
      inputValue: leagueId,
      cleanedValue: leagueId.trim(),
      timestamp: new Date().toISOString()
    });
  }

  logValidationStep(step: string, success: boolean, details?: any) {
    if (success) {
      this.success('VALIDATION', `✅ ${step}`, details);
    } else {
      this.error('VALIDATION', `❌ ${step}`, details);
    }
  }

  logAPICall(url: string, method: string, startTime: number) {
    this.api('API_CALL', `Making request to: ${url}`, {
      url,
      method,
      timestamp: Date.now(),
      startTime
    });
  }

  logAPIResponse(status: number, statusText: string, data: any, responseTime: number) {
    this.success('API_RESPONSE', `Response received: ${status} ${statusText}`, {
      status,
      statusText,
      data: typeof data === 'object' ? JSON.stringify(data).substring(0, 200) + '...' : data,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    });
  }

  logAPIError(error: Error, response?: any, responseTime?: number) {
    this.error('API_ERROR', `API call failed: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      response,
      responseTime: responseTime ? `${responseTime}ms` : undefined,
      timestamp: new Date().toISOString()
    });
  }

  // Network diagnostics
  async testConnection(): Promise<{ success: boolean; message: string; details: any }> {
    this.info('NETWORK_TEST', 'Testing connection to Sleeper API');
    
    try {
      const startTime = Date.now();
      const response = await fetch('https://api.sleeper.app/v1/state/nfl', {
        method: 'GET',
        mode: 'cors'
      });
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        this.success('NETWORK_TEST', 'Connection test successful', {
          status: response.status,
          responseTime: `${responseTime}ms`,
          data
        });
        return {
          success: true,
          message: `Connection successful (${responseTime}ms)`,
          details: { status: response.status, responseTime, data }
        };
      } else {
        this.error('NETWORK_TEST', 'Connection test failed', {
          status: response.status,
          statusText: response.statusText,
          responseTime: `${responseTime}ms`
        });
        return {
          success: false,
          message: `HTTP ${response.status}: ${response.statusText}`,
          details: { status: response.status, responseTime }
        };
      }
    } catch (error) {
      this.error('NETWORK_TEST', 'Connection test failed with exception', {
        error: error.message,
        stack: error.stack
      });
      return {
        success: false,
        message: `Network error: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  logEnvironmentInfo() {
    const info = {
      userAgent: navigator.userAgent,
      url: window.location.href,
      referrer: document.referrer,
      cookieEnabled: navigator.cookieEnabled,
      language: navigator.language,
      platform: navigator.platform,
      onLine: navigator.onLine,
      timestamp: new Date().toISOString()
    };
    
    this.info('ENV_INFO', 'Environment information collected', info);
    return info;
  }
}

export const debugLogger = new DebugLogger();
