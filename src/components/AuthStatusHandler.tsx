import { useEffect, useState } from 'react';
import { useYahooOAuth } from '../hooks/useYahooOAuth';
import { Alert, AlertDescription } from './ui/alert';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface AuthStatusHandlerProps {
  onStatusChange?: (status: 'success' | 'error' | null) => void;
}

export const AuthStatusHandler = ({ onStatusChange }: AuthStatusHandlerProps) => {
  const [authStatus, setAuthStatus] = useState<'success' | 'error' | null>(null);
  const [authMessage, setAuthMessage] = useState<string>('');
  const { checkConnectionStatus } = useYahooOAuth();

  useEffect(() => {
    // Check URL parameters for auth status
    const urlParams = new URLSearchParams(window.location.search);
    const authSuccess = urlParams.get('auth_success');
    const authError = urlParams.get('auth_error');

    if (authSuccess === 'true') {
      setAuthStatus('success');
      setAuthMessage('Yahoo account connected successfully!');
      // Clear URL parameters
      window.history.replaceState({}, '', window.location.pathname);
      // Update connection status
      checkConnectionStatus();
    } else if (authError) {
      setAuthStatus('error');
      let message = 'Authentication failed';
      
      switch (authError) {
        case 'missing_params':
          message = 'Authentication parameters missing. Please try again.';
          break;
        case 'callback_failed':
          message = 'Failed to process authentication. Please try again.';
          break;
        case 'true':
          message = 'Authentication was denied or cancelled.';
          break;
        default:
          message = 'Authentication error occurred. Please try again.';
      }
      
      setAuthMessage(message);
      // Clear URL parameters
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Notify parent component
    onStatusChange?.(authStatus);

    // Auto-hide status after 10 seconds
    if (authStatus) {
      const timer = setTimeout(() => {
        setAuthStatus(null);
        setAuthMessage('');
        onStatusChange?.(null);
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [checkConnectionStatus, onStatusChange, authStatus]);

  if (!authStatus) return null;

  return (
    <Alert className={authStatus === 'success' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-destructive/50 bg-destructive/5'}>
      <div className="flex items-center gap-2">
        {authStatus === 'success' ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <AlertCircle className="h-4 w-4 text-destructive" />
        )}
        <AlertDescription>{authMessage}</AlertDescription>
      </div>
    </Alert>
  );
};