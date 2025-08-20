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

      if (error) {
        toast({
          title: 'Authentication Error',
          description: `Yahoo authentication failed: ${error}`,
          variant: 'destructive'
        });
        navigate('/');
        return;
      }

      if (!code || !state) {
        toast({
          title: 'Authentication Error',
          description: 'Missing required parameters from Yahoo callback',
          variant: 'destructive'
        });
        navigate('/');
        return;
      }

      try {
        await handleCallback(code, state);
        // Redirect to main page after successful authentication
        navigate('/');
      } catch (error) {
        console.error('OAuth callback error:', error);
        navigate('/');
      }
    };

    processCallback();
  }, [searchParams, handleCallback, navigate]);

  return (
    <LoadingScreen 
      isLoading={true} 
      loadingStage="Completing Yahoo authentication..." 
      progress={50}
    />
  );
};