// spotify.js
// This file will handle the Spotify API connection and data fetching

// Variables for Spotify API (replace with your own credentials)
const CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID';
const REDIRECT_URI = 'https://hoachau.de/spotify-callback'; // Update with your domain
const SCOPES = [
  'user-read-recently-played',
  'user-top-read',
  'user-read-currently-playing'
];

// Spotify API endpoints
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// Generate a random string for state parameter
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Redirect user to Spotify login (for admin use only)
function redirectToSpotifyLogin() {
  const state = generateRandomString(16);
  localStorage.setItem('spotify_auth_state', state);

  const authUrl = new URL(SPOTIFY_AUTH_URL);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', CLIENT_ID);
  authUrl.searchParams.append('scope', SCOPES.join(' '));
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('state', state);

  window.location = authUrl.toString();
}

// Handle the callback from Spotify
async function handleSpotifyCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  const storedState = localStorage.getItem('spotify_auth_state');

  if (state === null || state !== storedState) {
    console.error('State mismatch error');
    return;
  }

  localStorage.removeItem('spotify_auth_state');

  try {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(CLIENT_ID + ':' + 'YOUR_CLIENT_SECRET')
      },
      body: new URLSearchParams({
        'code': code,
        'redirect_uri': REDIRECT_URI,
        'grant_type': 'authorization_code'
      })
    });

    const data = await response.json();
    
    // Store tokens (in a real app, you'd want to store these securely)
    localStorage.setItem('spotify_access_token', data.access_token);
    localStorage.setItem('spotify_refresh_token', data.refresh_token);
    localStorage.setItem('spotify_token_expiry', Date.now() + (data.expires_in * 1000));

    // Redirect back to main page
    window.location = '/';
  } catch (error) {
    console.error('Error getting access token', error);
  }
}

// Refresh token when expired
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  
  if (!refreshToken) {
    console.error('No refresh token available');
    return null;
  }

  try {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(CLIENT_ID + ':' + 'YOUR_CLIENT_SECRET')
      },
      body: new URLSearchParams({
        'grant_type': 'refresh_token',
        'refresh_token': refreshToken
      })
    });

    const data = await response.json();
    
    localStorage.setItem('spotify_access_token', data.access_token);
    localStorage.setItem('spotify_token_expiry', Date.now() + (data.expires_in * 1000));
    
    return data.access_token;
  } catch (error) {
    console.error('Error refreshing token', error);
    return null;
  }
}

// Get valid access token
async function getAccessToken() {
  const accessToken = localStorage.getItem('spotify_access_token');
  const tokenExpiry = localStorage.getItem('spotify_token_expiry');
  
  // If token is expired or about to expire, refresh it
  if (!accessToken || !tokenExpiry || Date.now() > (parseInt(tokenExpiry) - 60000)) {
    return await refreshAccessToken();
  }
  
  return accessToken;
}

// Fetch recently played tracks
async function fetchRecentlyPlayed(limit = 10) {
  const token = await getAccessToken();
  
  if (!token) {
    console.error('No valid token available');
    return null;
  }

  try {
    const response = await fetch(`${SPOTIFY_API_BASE}/me/player/recently-played?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    return await response.json();
  } catch (error) {
    console.error('Error fetching recently played tracks', error);
    return null;
  }
}

// Fetch top tracks
async function fetchTopTracks(limit = 10, timeRange = 'medium_term') {
  const token = await getAccessToken();
  
  if (!token) {
    console.error('No valid token available');
    return null;
  }

  try {
    const response = await fetch(`${SPOTIFY_API_BASE}/me/top/tracks?limit=${limit}&time_range=${timeRange}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    return await response.json();
  } catch (error) {
    console.error('Error fetching top tracks', error);
    return null;
  }
}

// Fetch currently playing track
async function fetchCurrentlyPlaying() {
  const token = await getAccessToken();
  
  if (!token) {
    console.error('No valid token available');
    return null;
  }

  try {
    const response = await fetch(`${SPOTIFY_API_BASE}/me/player/currently-playing`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.status === 204) {
      return { is_playing: false };
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching currently playing track', error);
    return null;
  }
}