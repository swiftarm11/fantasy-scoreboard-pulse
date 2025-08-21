import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

// Get Yahoo OAuth configuration from environment variables
const YAHOO_CLIENT_ID = Deno.env.get('YAHOO_CLIENT_ID') || "dj0yJmk9anVKMG9vdmJhZ0daJmQ9WVdrOVJ6UldjRWhrYkRJbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PThh"

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, refreshToken, redirectUri, action, accessToken } = await req.json()
    
    // Get the Yahoo client secret from environment
    const clientSecret = Deno.env.get('YAHOO_CLIENT_SECRET')
    if (!clientSecret) {
      console.error('YAHOO_CLIENT_SECRET environment variable not set')
      throw new Error('Yahoo OAuth is not properly configured on the server')
    }

    // Validate client ID is configured
    if (!YAHOO_CLIENT_ID || YAHOO_CLIENT_ID === "dj0yJmk9anVKMG9vdmJhZ0daJmQ9WVdrOVJ6UldjRWhrYkRJbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PThh") {
      console.warn('Using default YAHOO_CLIENT_ID - please set YAHOO_CLIENT_ID environment variable')
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
      // Refresh token flow
      const params = new URLSearchParams({
        client_id: YAHOO_CLIENT_ID,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })

      tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params.toString()
      })
    } else if (code) {
      // Authorization code flow
      const params = new URLSearchParams({
        client_id: YAHOO_CLIENT_ID,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: code,
        grant_type: 'authorization_code'
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
      throw new Error('Missing required parameters')
    }

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Yahoo token exchange error:', errorText)
      throw new Error(`Token exchange failed: ${tokenResponse.status}`)
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