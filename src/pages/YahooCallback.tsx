import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useYahooOAuth } from '../hooks/useYahooOAuth';
import { LoadingScreen } from '../components/LoadingScreen';
import { toast } from '../components/ui/use-toast';

export const YahooCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleCallback } = useYahooOAuth();

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Handle OAuth errors (user cancellation, access denied, etc.)
      if (error) {
        let errorMessage = 'Yahoo authentication failed';
        
        if (error === 'access_denied') {
          errorMessage = 'Access denied - you need to approve the application to continue';
        } else if (errorDescription) {
          errorMessage = `Authentication error: ${errorDescription}`;
        } else {
          errorMessage = `Authentication error: ${error}`;
        }

        toast({
          title: 'Authentication Error',
          description: errorMessage,
          variant: 'destructive'
        });
        
        // Redirect back to settings with error indication
        navigate('/?auth_error=true');
        return;
      }

      // Handle missing required parameters
      if (!code || !state) {
        toast({
          title: 'Authentication Error',
          description: 'Missing required parameters from Yahoo callback. Please try connecting again.',
          variant: 'destructive'
        });
        navigate('/?auth_error=missing_params');
        return;
      }

      try {
        // Process the OAuth callback
        await handleCallback(code, state);
        
        // Show success message
        toast({
          title: 'Connected Successfully',
          description: 'Yahoo Fantasy Sports account connected successfully!',
        });
        
        // Redirect to main page with success indication
        navigate('/?auth_success=true');
      } catch (error) {
        console.error('OAuth callback processing error:', error);
        
        let errorMessage = 'Failed to complete Yahoo authentication';
        if (error instanceof Error) {
          if (error.message.includes('REAUTH_REQUIRED')) {
            errorMessage = 'Authentication session expired. Please try connecting again.';
          } else {
            errorMessage = `Authentication failed: ${error.message}`;
          }
        }

        toast({
          title: 'Authentication Failed',
          description: errorMessage,
          variant: 'destructive'
        });
        
        navigate('/?auth_error=callback_failed');
      }
    };

    processCallback();
  }, [searchParams, handleCallback, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <LoadingScreen 
          isLoading={true} 
          loadingStage="Completing Yahoo authentication..." 
          progress={50}
        />
        <p className="text-sm text-muted-foreground max-w-md">
          Please wait while we complete your Yahoo Fantasy Sports authentication.
          You will be redirected automatically.
        </p>
      </div>
    </div>
  );
};