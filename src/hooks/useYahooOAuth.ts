// src/hooks/useYahooOAuth.ts

import { useState, useEffect, useCallback } from 'react';
import { YahooOAuthState, YahooUserInfo } from '../types/yahoo';
import { yahooOAuth } from '../utils/yahooOAuth';
import { toast } from '../components/ui/use-toast';
import { yahooLogger } from '../utils/yahooLogger';

export const useYahooOAuth = () => {
  const [state, setState] = useState<YahooOAuthState>({
    isConnected: false,
    userInfo: null,
    tokens: null,
    isLoading: false,
    error: null
  });

  // Initialize from stored values on mount
  useEffect(() => {
    const tokens = yahooOAuth.getStoredTokens();
    const userInfo = yahooOAuth.getStoredUserInfo();
    const isConnected = yahooOAuth.isConnected();
    setState({
      isConnected,
      tokens,
      userInfo,
      isLoading: false,
      error: null
    });
  }, []);

  const connect = useCallback(async () => {
    if (!yahooOAuth.isConfigured()) {
      toast({
        title: 'Configuration Error',
        description: 'Yahoo OAuth is not properly configured. Please check the settings.',
        variant: 'destructive'
      });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const authUrl = await yahooOAuth.getAuthUrl();
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
    yahooLogger.info('OAUTH_HOOK', 'Starting OAuth callback handling', {
      hasCode: !!code,
      hasState: !!oauthState,
      codePreview: code?.substring(0, 10) + '...'
    });

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const tokens = await yahooOAuth.exchangeCodeForTokens(code, oauthState);
      yahooLogger.info('OAUTH_HOOK', 'Token exchange completed successfully');

      const accessToken = await yahooOAuth.getValidAccessToken();
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ action: 'getUserInfo', accessToken })
      };

      yahooLogger.logAPICall('OAUTH_HOOK', 'https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', requestOptions);
      const userInfoResponse = await fetch('https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', requestOptions);
      yahooLogger.logAPICall('OAUTH_HOOK', 'https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', requestOptions, userInfoResponse);

      let userInfo: YahooUserInfo | null = null;
      if (userInfoResponse.ok) {
        userInfo = await userInfoResponse.json();
        yahooOAuth.storeUserInfo(userInfo);
        yahooLogger.info('OAUTH_HOOK', 'User info fetched successfully', {
          userGuid: userInfo.guid,
          userNickname: userInfo.nickname
        });
      } else {
        yahooLogger.warn('OAUTH_HOOK', 'User info fetch failed, but tokens are valid', {
          status: userInfoResponse.status,
          statusText: userInfoResponse.statusText
        });
      }

      setState(prev => ({
        ...prev,
        isConnected: true,
        tokens,
        userInfo,
        isLoading: false
      }));

      toast({
        title: 'Connected to Yahoo!',
        description: userInfo
          ? `Successfully connected as ${userInfo.nickname}`
          : 'Successfully connected to Yahoo Fantasy Sports'
      });
    } catch (error) {
      yahooLogger.error('OAUTH_HOOK', 'OAuth callback failed', {
        error: error instanceof Error ? error.message : error,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      });
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
      if (error instanceof Error && error.message === 'REAUTH_REQUIRED') {
        setState(prev => ({
          ...prev,
          isConnected: false,
          tokens: null,
          userInfo: null,
          error: 'Re-authentication required'
        }));
      } else {
        setState(prev => ({
          ...prev,
          isConnected: false,
          error: error instanceof Error ? error.message : 'Failed to refresh tokens'
        }));
      }
      throw error;
    }
  }, []);

  const checkConnectionStatus = useCallback(() => {
    const isCon = yahooOAuth.isConnected();
    const tokens = yahooOAuth.getStoredTokens();
    const userInfo = yahooOAuth.getStoredUserInfo();
    setState(prev => ({
      ...prev,
      isConnected: isCon,
      tokens,
      userInfo,
      error: isCon ? null : prev.error
    }));
    return isCon;
  }, []);

  const getStoredTokens = useCallback(() => {
    // Always get fresh tokens from localStorage to avoid stale cache
    const raw = localStorage.getItem('yahoo_oauth_tokens');
    return raw ? JSON.parse(raw) : null;
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    handleCallback,
    refreshTokens,
    checkConnectionStatus,
    getStoredTokens
  };
};
