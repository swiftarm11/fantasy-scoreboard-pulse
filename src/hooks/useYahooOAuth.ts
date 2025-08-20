import { useState, useEffect, useCallback } from 'react';
import { YahooOAuthState, YahooUserInfo } from '../types/yahoo';
import { yahooOAuth } from '../utils/yahooOAuth';
import { toast } from '../components/ui/use-toast';

export const useYahooOAuth = () => {
  const [state, setState] = useState<YahooOAuthState>({
    isConnected: false,
    userInfo: null,
    tokens: null,
    isLoading: false,
    error: null
  });

  useEffect(() => {
    // Initialize state from stored data
    const tokens = yahooOAuth.getStoredTokens();
    const userInfo = yahooOAuth.getStoredUserInfo();
    const isConnected = yahooOAuth.isConnected();

    setState(prev => ({
      ...prev,
      isConnected,
      tokens,
      userInfo,
    }));
  }, []);

  const connect = useCallback(() => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const authUrl = yahooOAuth.getAuthUrl();
      window.location.href = authUrl;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initiate OAuth flow'
      }));
      toast({
        title: 'Connection Error',
        description: 'Failed to connect to Yahoo. Please try again.',
        variant: 'destructive'
      });
    }
  }, []);

  const handleCallback = useCallback(async (code: string, oauthState: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const tokens = await yahooOAuth.exchangeCodeForTokens(code, oauthState);
      
      // Fetch user info after successful token exchange
      const accessToken = await yahooOAuth.getValidAccessToken();
      const userInfoResponse = await fetch('https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXF1aXRlY29nZG52Ynlpc3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2ODg0OTMsImV4cCI6MjA3MTI2NDQ5M30.63TmTlCTK_jVJnG_4vuZWUwS--UcyNgOSem5tI7q_1w`
        },
        body: JSON.stringify({
          action: 'getUserInfo',
          accessToken
        })
      });

      if (userInfoResponse.ok) {
        const userInfo: YahooUserInfo = await userInfoResponse.json();
        yahooOAuth.storeUserInfo(userInfo);
        
        setState(prev => ({
          ...prev,
          isConnected: true,
          tokens,
          userInfo,
          isLoading: false
        }));

        toast({
          title: 'Connected to Yahoo!',
          description: `Successfully connected as ${userInfo.nickname}`,
        });
      } else {
        // Even if user info fails, we still have valid tokens
        setState(prev => ({
          ...prev,
          isConnected: true,
          tokens,
          isLoading: false
        }));

        toast({
          title: 'Connected to Yahoo!',
          description: 'Successfully connected to Yahoo Fantasy Sports',
        });
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to complete OAuth flow'
      }));
      
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to connect to Yahoo',
        variant: 'destructive'
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    yahooOAuth.disconnect();
    setState({
      isConnected: false,
      userInfo: null,
      tokens: null,
      isLoading: false,
      error: null
    });
    
    toast({
      title: 'Disconnected',
      description: 'Successfully disconnected from Yahoo Fantasy Sports',
    });
  }, []);

  const refreshTokens = useCallback(async () => {
    try {
      const tokens = await yahooOAuth.refreshTokens();
      setState(prev => ({
        ...prev,
        tokens,
        isConnected: true,
        error: null
      }));
      return tokens;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isConnected: false,
        error: error instanceof Error ? error.message : 'Failed to refresh tokens'
      }));
      throw error;
    }
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    handleCallback,
    refreshTokens
  };
};