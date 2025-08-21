import { useCallback } from 'react';
import { toast } from '../components/ui/use-toast';
import { yahooOAuth } from '../utils/yahooOAuth';

export const useYahooAuthRecovery = () => {
  const handleAuthError = useCallback((error: Error, context: string = '') => {
    if (error.message === 'REAUTH_REQUIRED') {
      toast({
        title: 'Yahoo Authentication Required',
        description: 'Your Yahoo session has expired. Please reconnect your account.',
        variant: 'destructive'
      });
      
      // Navigate to settings after a brief delay
      setTimeout(() => {
        yahooOAuth.disconnect();
        window.location.href = '/settings?tab=connections';
      }, 2000);
      
      return true; // Handled
    }
    
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.warn('Yahoo API returned 401, may need re-authentication:', context);
      toast({
        title: 'Yahoo API Error',
        description: 'There was an authentication issue with Yahoo. You may need to reconnect.',
        variant: 'destructive'
      });
      return true; // Handled
    }
    
    return false; // Not handled
  }, []);

  const retryWithAuth = useCallback(async <T>(
    operation: () => Promise<T>,
    context: string = ''
  ): Promise<T | null> => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error) {
        const handled = handleAuthError(error, context);
        if (handled) {
          return null;
        }
      }
      throw error;
    }
  }, [handleAuthError]);

  return {
    handleAuthError,
    retryWithAuth
  };
};