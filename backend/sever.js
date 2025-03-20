// server.js
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
  origin: 'https://hoachau.de', // Your domain
  credentials: true
}));

// Spotify API credentials
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'https://hoachau.de/spotify-callback';
const FRONTEND_URI = process.env.FRONTEND_URI || 'https://hoachau.de';

// Spotify API endpoints
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// Store tokens (in memory for simplicity - in production use a proper database)
let tokenData = null;

// Login route
app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  res.cookie('spotify_auth_state', state);

  const scope = [
    'user-read-recently-played',
    'user-top-read',
    'user-read-currently-playing'
  ].join(' ');

  const queryParams = querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: scope,
    redirect_uri: REDIRECT_URI,
    state: state
  });

  res.redirect(`${SPOTIFY_AUTH_URL}?${queryParams}`);
});

// Callback route
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies ? req.cookies.spotify_auth_state : null;

  if (state === null || state !== storedState) {
    res.redirect(`${FRONTEND_URI}?error=state_mismatch`);
    return;
  }

  res.clearCookie('spotify_auth_state');

  try {
    const response = await axios.post(
      SPOTIFY_TOKEN_URL,
      querystring.stringify({
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
        }
      }
    );

    tokenData = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in,
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };

    res.redirect(`${FRONTEND_URI}?success=true`);
  } catch (error) {
    res.redirect(`${FRONTEND_URI}?error=invalid_token`);
  }
});

// Route to get recent tracks
app.get('/api/spotify/recent', async (req, res) => {
  try {
    await checkAndRefreshToken();
    
    if (!tokenData || !tokenData.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    const response = await axios.get(`${SPOTIFY_API_BASE}/me/player/recently-played?limit=10`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching recent tracks:', error);
    res.status(500).json({ error: 'Failed to fetch recent tracks' });
  }
});

// Route to get top tracks
app.get('/api/spotify/top-tracks', async (req, res) => {
  const timeRange = req.query.time_range || 'medium_term'; // short_term, medium_term, long_term
  
  try {
    await checkAndRefreshToken();
    
    if (!tokenData || !tokenData.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    const response = await axios.get(`${SPOTIFY_API_BASE}/me/top/tracks?limit=10&time_range=${timeRange}`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching top tracks:', error);
    res.status(500).json({ error: 'Failed to fetch top tracks' });
  }
});

// Route to get currently playing
app.get('/api/spotify/now-playing', async (req, res) => {
  try {
    await checkAndRefreshToken();
    
    if (!tokenData || !tokenData.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    const response = await axios.get(`${SPOTIFY_API_BASE}/me/player/currently-playing`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    // If no track is playing, API returns 204 No Content
    if (response.status === 204) {
      return res.json({ isPlaying: false });
    }

    res.json({
      isPlaying: response.data.is_playing,
      track: response.data.item
    });
  } catch (error) {
    console.error('Error fetching currently playing:', error);
    res.status(500).json({ error: 'Failed to fetch currently playing track' });
  }
});

// Helper function to refresh token
async function checkAndRefreshToken() {
  if (!tokenData) return;

  // If token is expired or about to expire in the next minute
  if (Date.now() >= tokenData.expires_at - 60000) {
    try {
      const response = await axios.post(
        SPOTIFY_TOKEN_URL,
        querystring.stringify({
          grant_type: 'refresh_token',
          refresh_token: tokenData.refresh_token
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
          }
        }
      );

      tokenData = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || tokenData.refresh_token,
        expires_in: response.data.expires_in,
        expires_at: Date.now() + (response.data.expires_in * 1000)
      };
    } catch (error) {
      console.error('Error refreshing token:', error);
      tokenData = null;
    }
  }
}

// Helper function to generate random string
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});