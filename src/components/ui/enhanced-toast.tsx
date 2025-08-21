import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { toast as originalToast } from './use-toast';

interface ToastOptions {
  title?: string;
  description?: string;
  duration?: number;
  action?: React.ReactNode;
  className?: string;
}

interface EnhancedToastOptions extends ToastOptions {
  type?: 'success' | 'error' | 'warning' | 'info' | 'loading' | 'connection';
  autoClose?: boolean;
}

export class EnhancedToast {
  static success(title: string, description?: string, options: Partial<EnhancedToastOptions> = {}) {
    const { type, autoClose, action, ...toastOptions } = options;
    return originalToast({
      title: `✅ ${title}`,
      description,
      duration: options.duration || 4000,
      className: 'border-l-4 border-l-green-500',
      ...toastOptions
    });
  }

  static error(title: string, description?: string, options: Partial<EnhancedToastOptions> = {}) {
    const { type, autoClose, action, ...toastOptions } = options;
    return originalToast({
      title: `❌ ${title}`,
      description,
      duration: options.duration || 6000,
      variant: 'destructive',
      className: 'border-l-4 border-l-red-500',
      ...toastOptions
    });
  }

  static warning(title: string, description?: string, options: Partial<EnhancedToastOptions> = {}) {
    const { type, autoClose, action, ...toastOptions } = options;
    return originalToast({
      title: `⚠️ ${title}`,
      description,
      duration: options.duration || 5000,
      className: 'border-l-4 border-l-yellow-500',
      ...toastOptions
    });
  }

  static info(title: string, description?: string, options: Partial<EnhancedToastOptions> = {}) {
    const { type, autoClose, action, ...toastOptions } = options;
    return originalToast({
      title: `ℹ️ ${title}`,
      description,
      duration: options.duration || 4000,
      className: 'border-l-4 border-l-blue-500',
      ...toastOptions
    });
  }

  static loading(title: string, description?: string, options: Partial<EnhancedToastOptions> = {}) {
    const { type, autoClose, action, ...toastOptions } = options;
    return originalToast({
      title: `⏳ ${title}`,
      description,
      duration: options.duration || 0, // Don't auto-dismiss loading toasts
      className: 'border-l-4 border-l-blue-500',
      ...toastOptions
    });
  }

  static connection(isConnected: boolean, title?: string, description?: string, options: Partial<EnhancedToastOptions> = {}) {
    const { type, autoClose, action, ...toastOptions } = options;
    const icon = isConnected ? '📶' : '📵';
    const defaultTitle = isConnected ? 'Connected' : 'Connection Lost';
    const defaultDescription = isConnected 
      ? 'Successfully connected to services' 
      : 'Trying to reconnect...';

    return originalToast({
      title: `${icon} ${title || defaultTitle}`,
      description: description || defaultDescription,
      duration: options.duration || (isConnected ? 3000 : 0),
      variant: isConnected ? 'default' : 'destructive',
      className: isConnected ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500',
      ...toastOptions
    });
  }

  // Preset notifications for common scenarios
  static leagueAdded(leagueName: string, platform: string) {
    return this.success(
      'League Added',
      `${leagueName} from ${platform} has been added to your dashboard`,
      { duration: 4000 }
    );
  }

  static leagueRemoved(leagueName: string) {
    return this.info(
      'League Removed',
      `${leagueName} has been removed from your dashboard`,
      { duration: 3000 }
    );
  }

  static dataRefreshed(platform?: string) {
    return this.success(
      'Data Refreshed',
      platform ? `${platform} data updated successfully` : 'All league data updated successfully',
      { duration: 3000 }
    );
  }

  static settingsSaved() {
    return this.success(
      'Settings Saved',
      'Your preferences have been updated',
      { duration: 3000 }
    );
  }

  static authenticationSuccess(platform: string) {
    return this.success(
      'Authentication Successful',
      `Successfully connected to ${platform}`,
      { duration: 4000 }
    );
  }

  static authenticationError(platform: string, error?: string) {
    return this.error(
      'Authentication Failed',
      error || `Failed to connect to ${platform}. Please try again.`,
      { duration: 6000 }
    );
  }

  static rateLimitWarning(platform: string, waitTime?: string) {
    return this.warning(
      'Rate Limited',
      `${platform} API limit reached. ${waitTime ? `Please wait ${waitTime}` : 'Requests are being throttled.'}`,
      { duration: 5000 }
    );
  }
}

// Export both the class and individual methods for convenience
export const toast = EnhancedToast;