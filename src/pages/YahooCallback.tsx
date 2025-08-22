import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { yahooOAuth } from '@/utils/yahooOAuth';

export function YahooCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const state = params.get('state');
    const errorParam = params.get('error');

    console.log('[YAHOO CALLBACK] Immediate processing - no delays');

    if (errorParam) {
      setError(`Yahoo OAuth error: ${errorParam}`);
      return;
    }

    if (!code || !state) {
      setError('Missing authorization code or state parameter');
      return;
    }

    // IMMEDIATE token exchange - no setTimeout or delays
    yahooOAuth.exchangeCodeForTokens(code, state)
      .then(() => {
        console.log('[YAHOO CALLBACK] Success - redirecting immediately');
        navigate('/', { replace: true });
      })
      .catch((err) => {
        console.error('[YAHOO CALLBACK] Exchange failed:', err);
        setError(err.message);
      });

  }, [location.search, navigate]); // Only depend on search params

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Authentication Failed</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-blue-500 text-white rounded">
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
        <p className="text-gray-600">Processing Yahoo authentication...</p>
      </div>
    </div>
  );
}
