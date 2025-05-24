/**
 * Music Generation API Service Call - Debug
 */

// Get API base URL from environment variable, defaults to Google Cloud Run deployed service
const API_BASE_URL = import.meta.env.VITE_API_URL;

console.log('API_BASE_URL:', API_BASE_URL); // Debug: Show the API address being used

/**
 * Generates music
 * @param {File[]} images - Array of image files
 * @param {number[]} coords - Coordinate array [latitude, longitude]
 * @param {Object} options - Optional parameters
 * @param {string} options.style - Music style
 * @param {boolean} options.refineDescription - Whether to refine the scene description
 * @returns {Promise<Blob>} - Returns an audio file Blob
 */
export async function generateMusic(images, coords, options = {}) {
  console.log('generateMusic called with parameters:', {
    imagesCount: images.length,
    coords,
    options
  });

  try {
    // Create FormData object
    const formData = new FormData();

    // Add image files
    images.forEach((image, index) => {
      console.log(`Adding image ${index + 1}:`, image.name, image.size, 'bytes');
      formData.append('images', image);
    });

    // Add coordinates
    formData.append('latitude', coords[0]); // coords[0] is latitude
    formData.append('longitude', coords[1]); // coords[1] is longitude

    // Add optional parameters
    if (options.style) {
      formData.append('style', options.style);
    }

    formData.append('refine_description', options.refineDescription !== false);

    const requestUrl = `${API_BASE_URL}/api/generate-music`;
    console.log('Sending request to:', requestUrl);

    // Send request
    const response = await fetch(requestUrl, {
      method: 'POST',
      body: formData,
      // Do not set Content-Type; let the browser automatically set multipart/form-data with boundary
      // Add timeout handling, as music generation can take a long time
      // signal: AbortSignal.timeout(120000), // 2-minute timeout
    });

    console.log('Received response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });

    // Check response status
    if (!response.ok) {
      console.error('Request failed, status code:', response.status);
      // Attempt to parse error message
      try {
        const errorData = await response.json();
        console.error('Server error details:', errorData);
        throw new Error(errorData.error || `Server returned error: ${response.status}`);
      } catch (e) {
        console.error('Failed to parse error response:', e);
        // If JSON cannot be parsed, it might be a network error or other issue
        if (e.name === 'SyntaxError') {
          throw new Error(`Server returned error: ${response.status} - ${response.statusText}`);
        }
        throw e;
      }
    }

    // Check response type
    const contentType = response.headers.get('Content-Type');
    console.log('Response content type:', contentType);
    if (!contentType || !contentType.includes('audio')) {
      console.warn('Warning: Response might not be an audio file, Content-Type:', contentType);
    }

    // Return audio Blob
    const blob = await response.blob();
    console.log('Successfully obtained audio Blob, size:', blob.size, 'bytes');
    return blob;
  } catch (error) {
    console.error('Error in generateMusic:', error);
    if (error.name === 'TimeoutError') {
      throw new Error('Request timed out, music generation took too long. Please try again later.');
    }
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      throw new Error('Network connection failed. Please check your network or server status.');
    }
    throw error;
  }
}

/**
 * Checks API server health status
 * @returns {Promise<boolean>} - True if the server is healthy
 */
export async function checkApiHealth() {
  const healthUrl = `${API_BASE_URL}/api/health`;
  console.log('Checking API health status:', healthUrl);

  try {
    const response = await fetch(healthUrl, {
      // Health checks use a shorter timeout
      signal: AbortSignal.timeout(10000), // 10-second timeout
    });

    console.log('Health check response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (response.ok) {
      try {
        const data = await response.json();
        console.log('Health check response data:', data);
      } catch (e) {
        console.log('Health check response is not in JSON format.');
      }
    }

    return response.ok;
  } catch (error) {
    console.error('API server health check failed:', error);
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      console.error('Network connection failed - Possible reasons:');
      console.error('1. Server is not running');
      console.error('2. Network connectivity issues');
      console.error('3. CORS configuration issues');
      console.error('4. Incorrect URL address');
    }
    return false;
  }
}

/**
 * Debug function to test API connectivity
 */
export async function debugApiConnection() {
  console.log('=== API Connection Debug Start ===');
  console.log('API Base URL:', API_BASE_URL);

  // Test basic connection
  try {
    console.log('Testing basic connection...');
    const response = await fetch(API_BASE_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    console.log('Basic connection response:', response.status, response.statusText);
  } catch (error) {
    console.error('Basic connection failed:', error.message);
  }

  // Test health check endpoint
  const isHealthy = await checkApiHealth();
  console.log('Health check result:', isHealthy);

  console.log('=== API Connection Debug End ===');
  return isHealthy;
}