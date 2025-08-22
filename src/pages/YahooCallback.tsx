import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { yahooOAuth } from '@/utils/yahooOAuth';

export function YahooCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    let isProcessed = false;

    const handleCallback = async () => {
      // Prevent multiple executions
      if (isProcessed) return;
      isProcessed = true;

      try {
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');

        console.log('[YAHOO CALLBACK] Processing callback:', {
          hasCode: !!code,
          hasState: !!state,
          hasError: !!error,
          fullURL: window.location.href
        });

        if (error) {
          throw new Error(`Yahoo OAuth error: ${error}`);
        }

        if (!code || !state) {
          throw new Error('Missing authorization code or state parameter');
        }

        console.log('[YAHOO CALLBACK] Exchanging code for tokens...');
        
        // Exchange code for tokens - this should only happen ONCE
        await yahooOAuth.exchangeCodeForTokens(code, state);
        
        console.log('[YAHOO CALLBACK] Success! Tokens received');
        setProcessing(false);

        // Clean redirect to avoid reprocessing
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 1500);

      } catch (err) {
        console.error('[YAHOO CALLBACK] Failed:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setProcessing(false);
      }
    };

    // Small delay to ensure single execution
    const timer = setTimeout(handleCallback, 100);
    return () => clearTimeout(timer);

  }, []); // Empty dependency array to run only once

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Authentication Failed</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600">
          {processing ? 'Completing Yahoo authentication...' : 'Success! Redirecting...'}
        </p>
      </div>
    </div>
  );
}
