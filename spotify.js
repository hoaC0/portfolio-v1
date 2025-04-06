document.addEventListener('DOMContentLoaded', function() {
  // API base URL of your proxy server
  const API_BASE_URL = 'https://spotify-api-iota-one.vercel.app';
  
  // Helper functions
  function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }
  
  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Error display
  function createErrorDisplay(icon, message, isAuthError = false) {
    return `
      <div class="not-playing">
        <i class="${icon}"></i>
        <p>${message}</p>
        ${isAuthError ? '<button class="retry-spotify-btn">Noch einmal versuchen</button>' : ''}
      </div>
    `;
  }

  // Cache for track data to prevent unnecessary DOM updates
  let nowPlayingCache = null;
  let recentTracksCache = null;
  let topTracksCache = {
    'short_term': null,
    'medium_term': null,
    'long_term': null
  };

  // Create a smooth loading animation
  function showLoading(container) {
    // Only show loading if the container is empty
    if (!container.innerHTML.trim() || container.innerHTML.includes('Loading...')) {
      container.innerHTML = '<div class="spotify-loading">Loading...</div>';
      return;
    }
    
    // If there's already content, don't replace it while loading
    // This prevents the flickering/jumping
  }

  // Function to update a container with a fade transition
  function updateContainerWithFade(container, newContent, cacheKey = null, cacheObj = null) {
    // If the content is the same, don't update
    if (cacheObj && cacheKey && cacheObj[cacheKey] === newContent) {
      return false;
    }
    
    // Update cache if provided
    if (cacheObj && cacheKey) {
      cacheObj[cacheKey] = newContent;
    }
    
    // Create temporary container to compare with current content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newContent;
    
    // Check if the new content is significantly different
    // This prevents minor updates from causing a full refresh
    if (container.innerHTML && tempDiv.textContent.trim() === container.textContent.trim()) {
      // If the text is the same, just update any attributes or minor differences
      // without a visible transition
      container.innerHTML = newContent;
      return true;
    }
    
    // Apply fade out transition
    container.style.opacity = '0';
    container.style.transition = 'opacity 0.3s ease';
    
    // Update content after slight delay
    setTimeout(() => {
      container.innerHTML = newContent;
      
      // Fade back in
      setTimeout(() => {
        container.style.opacity = '1';
      }, 50);
    }, 300);
    
    return true;
  }

  // Fetch and display currently playing track with improved error handling
  async function fetchNowPlaying() {
    const container = document.getElementById('currently-playing-track');
    
    // If there's no content yet, show loading
    if (!container.innerHTML.trim() || container.innerHTML.includes('retry-spotify-btn')) {
      showLoading(container);
    }
    
    try {
      // Add cache busting and timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch(`${API_BASE_URL}/api/spotify/now-playing?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      
      // Handle not playing state
      if (!data.isPlaying || !data.track) {
        // Create the not playing content
        const notPlayingContent = createErrorDisplay('fa-solid fa-headphones', 'Not playing anything right now');
        updateContainerWithFade(container, notPlayingContent, 'notPlaying', nowPlayingCache);
        return;
      }
      
      // Display track data
      const track = data.track;
      
      // Check if all required fields are present
      if (!track.name || !track.artists || !track.album) {
        throw new Error('Incomplete track data received');
      }
      
      // Create a hash for this track to compare with cache
      const trackHash = `${track.id || track.name}-${track.artists[0].id || track.artists[0].name}`;
      
      // If it's the same track as before, don't update the DOM
      if (nowPlayingCache && nowPlayingCache.trackHash === trackHash) {
        // Only update progress info if needed
        if (container.querySelector('.progress-fill')) {
          // Update progress bar if needed
          // This is a minor update that doesn't require full redraw
        }
        return;
      }
      
      // Otherwise, prepare new content
      // Truncate long text
      const trackName = truncateText(track.name, 45);
      const artists = track.artists.map(artist => artist.name).join(', ');
      const artistsText = truncateText(artists, 50);
      const albumName = truncateText(track.album.name, 45);
      
      // Use a fallback for images if none is available
      const albumImageUrl = track.album.images[0]?.url || './images/placeholder.webp';
      
      const newContent = `
        <div class="now-playing-card">
          <div class="now-playing-image">
            <img src="${albumImageUrl}" alt="${trackName} album cover">
            <div class="playing-indicator">
              <span></span><span></span><span></span><span></span>
            </div>
          </div>
          <div class="now-playing-info">
            <div class="now-playing-track" title="${track.name}">${trackName}</div>
            <div class="now-playing-artist" title="${artists}">${artistsText}</div>
            <div class="now-playing-album" title="${track.album.name}">${albumName}</div>
            <div class="now-playing-progress">
              <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
              </div>
              <div class="progress-time">
                <span>0:00</span>
                <span>${formatDuration(track.duration_ms)}</span>
              </div>
            </div>
            <a href="${track.external_urls.spotify}" target="_blank" class="listen-on-spotify">
              <i class="fa-brands fa-spotify"></i> Listen on Spotify
            </a>
          </div>
        </div>
      `;
      
      // Update cache
      nowPlayingCache = {
        trackHash: trackHash,
        content: newContent
      };
      
      // Update container with fade transition
      updateContainerWithFade(container, newContent);
      
    } catch (error) {
      console.error('Error fetching current track:', error);
      
      // Only show error if no content exists or if error display is already showing
      if (!container.innerHTML.trim() || container.innerHTML.includes('retry-spotify-btn') || container.innerHTML.includes('fa-headphones')) {
        // Specific error message based on error type
        let errorMessage = 'Unable to load currently playing track';
        let isAuthError = false;
        
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please refresh the page.';
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error. Please check your connection.';
        } else if (error.response && error.response.status === 401) {
          errorMessage = 'Authentication error. The site owner needs to log in again.';
          isAuthError = true;
        }
        
        const errorContent = createErrorDisplay('fa-solid fa-headphones', errorMessage, isAuthError);
        updateContainerWithFade(container, errorContent);
      }
    }
  }
  
  // Fetch and display top tracks with improved error handling
  async function fetchTopTracks(timeRange = 'medium_term') {
    const container = document.getElementById('top-tracks');
    
    // If we already have this data cached, don't show loading
    if (!topTracksCache[timeRange] || !container.innerHTML.trim() || container.innerHTML.includes('retry-spotify-btn')) {
      showLoading(container);
    }
    
    try {
      // If we already have the data cached, use it
      if (topTracksCache[timeRange]) {
        updateContainerWithFade(container, topTracksCache[timeRange]);
        return;
      }
      
      // Add cache busting and timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch(`${API_BASE_URL}/api/spotify/top-tracks?time_range=${timeRange}&t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      
      // Handle empty response
      if (!data.items || data.items.length === 0) {
        const noDataContent = createErrorDisplay('fa-solid fa-music', 'No top tracks found for this time period');
        topTracksCache[timeRange] = noDataContent;
        updateContainerWithFade(container, noDataContent);
        return;
      }
      
      // Display top tracks
      let html = `<div class="tracks-grid">`;
      
      data.items.forEach((track, index) => {
        // Check if track has all required properties
        if (!track || !track.name || !track.artists) {
          console.warn('Skipping invalid track data:', track);
          return;
        }
        
        // Truncate long titles and artist names
        const trackName = truncateText(track.name, 35);
        const artists = track.artists.map(artist => artist.name).join(', ');
        const artistsText = truncateText(artists, 40);
        
        // Fallback for album cover
        const albumImageUrl = track.album?.images[0]?.url || './images/placeholder.webp';
        
        html += `
          <div class="track-item">
            <div class="track-rank">#${index + 1}</div>
            <div class="track-image">
              <img src="${albumImageUrl}" alt="${trackName} album cover">
            </div>
            <div class="track-info">
              <div class="track-name" title="${track.name}">${trackName}</div>
              <div class="track-artist" title="${artists}">${artistsText}</div>
            </div>
            <a href="${track.external_urls?.spotify || '#'}" target="_blank" class="track-link">
              <i class="fa-brands fa-spotify"></i>
            </a>
          </div>
        `;
      });
      
      html += `</div>`;
      
      // Cache the result
      topTracksCache[timeRange] = html;
      
      // Update with fade transition
      updateContainerWithFade(container, html);
      
    } catch (error) {
      console.error('Error fetching top tracks:', error);
      
      // Only show error if no content exists or if error is already showing
      if (!container.innerHTML.trim() || container.innerHTML.includes('retry-spotify-btn') || container.innerHTML.includes('fa-music')) {
        // Specific error message based on error type
        let errorMessage = 'Unable to load top tracks';
        let isAuthError = false;
        
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please refresh the page.';
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error. Please check your connection.';
        } else if (error.response && error.response.status === 401) {
          errorMessage = 'Authentication error. The site owner needs to log in again.';
          isAuthError = true;
        }
        
        const errorContent = createErrorDisplay('fa-solid fa-music', errorMessage, isAuthError);
        updateContainerWithFade(container, errorContent);
      }
    }
  }
  
  // Fetch and display recently played tracks with improved error handling
  async function fetchRecentTracks() {
    const container = document.getElementById('recent-tracks');
    
    // If there's no content yet, show loading
    if (!container.innerHTML.trim() || container.innerHTML.includes('retry-spotify-btn')) {
      showLoading(container);
    }
    
    try {
      // Add cache busting and timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(`${API_BASE_URL}/api/spotify/recent?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${await response.text()}`);
      }
      
      const data = await response.json();
      
      // Generate a hash of the data to compare with cache
      const itemsHash = data.items ? data.items.slice(0, 3).map(item => item.track?.id || item.played_at).join('-') : '';
      
      // If it's the same data we already have, don't update
      if (recentTracksCache && recentTracksCache.hash === itemsHash) {
        return;
      }
      
      // Handle empty response
      if (!data.items || data.items.length === 0) {
        const noDataContent = createErrorDisplay('fa-solid fa-history', 'No recently played tracks found');
        recentTracksCache = {
          hash: 'empty',
          content: noDataContent
        };
        updateContainerWithFade(container, noDataContent);
        return;
      }
      
      // Display recently played tracks
      let html = `<div class="recent-tracks-grid">`;
      
      data.items.forEach(item => {
        // Skip invalid items
        if (!item || !item.track) {
          console.warn('Skipping invalid track item', item);
          return;
        }
        
        const track = item.track;
        
        // Skip tracks with missing properties
        if (!track.name || !track.artists) {
          console.warn('Skipping track with missing properties', track);
          return;
        }
        
        // Truncate long titles and artist names
        const trackName = truncateText(track.name, 35);
        const artists = track.artists.map(artist => artist.name).join(', ');
        const artistsText = truncateText(artists, 40);
        
        const playedAt = item.played_at ? formatDate(item.played_at) : 'Recently';
        const albumImageUrl = track.album?.images[0]?.url || './images/placeholder.webp';
        
        html += `
          <div class="recent-track-item">
            <div class="track-image">
              <img src="${albumImageUrl}" alt="${trackName} album cover">
            </div>
            <div class="track-info">
              <div class="track-name" title="${track.name}">${trackName}</div>
              <div class="track-artist" title="${artists}">${artistsText}</div>
              <div class="track-played-at">Played ${playedAt}</div>
            </div>
            <a href="${track.external_urls?.spotify || '#'}" target="_blank" class="track-link">
              <i class="fa-brands fa-spotify"></i>
            </a>
          </div>
        `;
      });
      
      html += `</div>`;
      
      // Update cache
      recentTracksCache = {
        hash: itemsHash,
        content: html
      };
      
      // Update with fade transition
      updateContainerWithFade(container, html);
      
    } catch (error) {
      console.error('Error fetching recently played tracks:', error);
      
      // Only show error if no content exists or error is already showing
      if (!container.innerHTML.trim() || container.innerHTML.includes('retry-spotify-btn') || container.innerHTML.includes('fa-history')) {
        // Specific error message based on error type
        let errorMessage = 'Unable to load recently played tracks';
        let isAuthError = false;
        
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please refresh the page.';
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error. Please check your connection.';
        } else if (error.message.includes('401')) {
          errorMessage = 'Authentication error. The site owner needs to log in again.';
          isAuthError = true;
        }
        
        const errorContent = createErrorDisplay('fa-solid fa-history', errorMessage, isAuthError);
        updateContainerWithFade(container, errorContent);
      }
    }
  }
  
  // Setup time range buttons
  function setupTimeRangeButtons() {
    const timeRangeButtons = document.querySelectorAll('.time-range-btn');
    
    if (!timeRangeButtons || timeRangeButtons.length === 0) {
      console.error('Time range buttons not found in DOM');
      return;
    }
    
    timeRangeButtons.forEach(button => {
      button.addEventListener('click', function() {
        // Remove active class from all buttons
        timeRangeButtons.forEach(btn => btn.classList.remove('active'));
        // Add active class to clicked button
        this.classList.add('active');
        // Fetch data for selected time range
        fetchTopTracks(this.dataset.range);
      });
    });
  }
  
  // Add CSS styles for smoother transitions
  function addTransitionStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .now-playing-content, .top-tracks-list, .recent-tracks-list {
        transition: opacity 0.3s ease;
      }
      
      .spotify-loading {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 2rem;
        color: #666;
        font-size: 0.9rem;
      }
    `;
    document.head.appendChild(styleEl);
  }
  
  // Improved initialization function
  function initialize() {
    console.log('Initializing Spotify integration...');
    addTransitionStyles();
    
    // Clean up URL if it has query parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('success') || urlParams.has('error')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Check if we need to retry authentication
    const authError = urlParams.get('error');
    if (authError) {
      console.error('Authentication error:', authError);
      localStorage.removeItem('spotify_auth_attempted');
    }
    
    // Check if we're returning from auth
    const isAuthSuccess = urlParams.get('success') === 'true';
    const hasNotAttemptedAuth = !localStorage.getItem('spotify_auth_attempted');

    // Handle authentication
    if (!isAuthSuccess && hasNotAttemptedAuth) {
      // First time loading the page without auth - initiate Spotify login
      localStorage.setItem('spotify_auth_attempted', 'true');
      window.location.href = `${API_BASE_URL}/login`;
      return; // Stop execution since we're redirecting
    } else if (isAuthSuccess) {
      // Successfully returned from authentication
      console.log('Successfully authenticated with Spotify!');
      localStorage.removeItem('spotify_auth_attempted');
    }
    
    // Load all data in parallel with error handling
    Promise.allSettled([
      fetchNowPlaying(),
      fetchTopTracks('medium_term'),
      fetchRecentTracks()
    ]).then(results => {
      // Count how many requests succeeded
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      console.log(`Spotify data loaded: ${successCount}/${results.length} requests succeeded`);
      
      // If all failed, we might need to re-authenticate
      if (successCount === 0) {
        console.warn('All Spotify requests failed. Might need to re-authenticate.');
        const allContainers = [
          document.getElementById('currently-playing-track'),
          document.getElementById('top-tracks'),
          document.getElementById('recent-tracks')
        ];
        
        // Add retry button to containers
        allContainers.forEach(container => {
          if (container) {
            container.innerHTML = `
              <div class="not-playing">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <p>Spotify-Daten konnten nicht geladen werden.</p>
                <button class="retry-spotify-btn">Noch einmal versuchen</button>
              </div>
            `;
          }
        });
      }
    }).catch(error => {
      console.error('Error in Promise.allSettled:', error);
    });
    
    // Setup UI interactions
    setupTimeRangeButtons();
    
    // Setup event listener for retry buttons
    document.addEventListener('click', function(e) {
      if (e.target && e.target.classList.contains('retry-spotify-btn')) {
        console.log('Retry button clicked');
        // Zeige sofort Lade-Indikatoren an
        const containers = [
          document.getElementById('currently-playing-track'),
          document.getElementById('top-tracks'),
          document.getElementById('recent-tracks')
        ];
        
        containers.forEach(container => {
          if (container) {
            showLoading(container);
          }
        });
        
        // Gehe zur Login-Seite
        localStorage.removeItem('spotify_auth_attempted');
        window.location.href = `${API_BASE_URL}/login`;
      }
    });
    
    const addJitter = (baseTime) => baseTime + (Math.random() * 500);

setInterval(fetchNowPlaying, addJitter(2000));
setInterval(fetchTopTracks, addJitter(60000)); 
setInterval(fetchRecentTracks, addJitter(10000));;
  }
  
  // Start everything when the DOM is ready
  initialize();
});