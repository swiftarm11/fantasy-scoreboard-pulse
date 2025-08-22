import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

// Get Yahoo OAuth configuration from environment variables
const YAHOO_CLIENT_ID = Deno.env.get('YAHOO_CLIENT_ID') || "dj0yJmk9anVKMG9vdmJhZ0daJmQ9WVdrOVJ6UldqRWhrYkJWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3M9Y29uc3VtZXJzZWNyZXQ-"

// Debug logging for environment variable status
console.log('Yahoo OAuth Edge Function Configuration (PKCE Public App):', {
  clientIdPresent: !!Deno.env.get('YAHOO_CLIENT_ID'),
  usingFallbackClientId: !Deno.env.get('YAHOO_CLIENT_ID'),
  flowType: 'PKCE (public app, no client secret required)'
})

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, refreshToken, redirectUri, action, accessToken, codeVerifier } = await req.json()
    
    console.log('Processing Yahoo OAuth request:', {
      hasCode: !!code,
      hasRefreshToken: !!refreshToken,
      hasCodeVerifier: !!codeVerifier,
      action: action || 'token_exchange'
    })

    // Validate client ID is configured  
    if (!YAHOO_CLIENT_ID || YAHOO_CLIENT_ID === "dj0yJmk9anVKMG9vdmJhZ0daJmQ9WVdrOVJ6UldqRWhrYkJWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3M9Y29uc3VtZXJzZWNyZXQ-") {
      console.warn('Using fallback YAHOO_CLIENT_ID - please set YAHOO_CLIENT_ID environment variable for production')
    }

    if (action === 'getUserInfo' && accessToken) {
      // Fetch user information
      const userInfoResponse = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })

      if (!userInfoResponse.ok) {
        throw new Error('Failed to fetch user info')
      }

      const userInfo = await userInfoResponse.json()
      
      return new Response(
        JSON.stringify({
          guid: userInfo.sub,
          nickname: userInfo.name || userInfo.nickname || 'Yahoo User',
          profile_url: userInfo.profile || ''
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    let tokenResponse
    
    if (refreshToken) {
      // PKCE Refresh token flow - public app, no client secret needed
      console.log('Making PKCE refresh token request (public app)')
      
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: YAHOO_CLIENT_ID,
        refresh_token: refreshToken,
        redirect_uri: redirectUri
      })

      tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params.toString()
      })
    } else if (code && codeVerifier) {
      // PKCE authorization code flow - public app, no client secret needed
      console.log('Making PKCE token exchange request (public app)')
      
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: YAHOO_CLIENT_ID,
        code: code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })

      tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params.toString()
      })
    } else {
      throw new Error('Missing required parameters (code and codeVerifier required for PKCE flow)')
    }

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Yahoo token exchange error:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
        refreshToken: !!refreshToken,
        code: !!code
      })
      
      // Return more specific error information
      return new Response(
        JSON.stringify({ 
          error: `Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`,
          details: errorText,
          status: tokenResponse.status
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: tokenResponse.status === 401 ? 401 : 400,
        }
      )
    }

    const tokenData = await tokenResponse.json()

    return new Response(
      JSON.stringify(tokenData),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Yahoo OAuth error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})