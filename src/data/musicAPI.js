// Music Generation API Service Call

// Get API base URL from environment variable
const API_BASE_URL = import.meta.env.VITE_API_URL;

/**
 * Generates music
 * @param {File[]} images - Array of image files
 * @param {number[]} coords - Coordinate array [latitude, longitude]
 * @param {Object} options - Optional parameters
 * @returns {Promise<Blob>} - Returns an audio file Blob
 */
export async function generateMusic(images, coords, options = {}) {
  try {
    const formData = new FormData();
    images.forEach(image => formData.append('images', image));
    formData.append('latitude', coords[0]);
    formData.append('longitude', coords[1]);
    if (options.style) formData.append('style', options.style);
    formData.append('refine_description', options.refineDescription !== false);

    const response = await fetch(`${API_BASE_URL}/api/generate-music`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      let errorMsg = `Server returned error: ${response.status}`;
      try {
        const errData = await response.json();
        errorMsg = errData.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }

    const blob = await response.blob();
    return blob;
  } catch (error) {
    // Log error details
    console.error('generateMusic error:', error);
    if (error.name === 'TimeoutError') {
      throw new Error('Request timed out, music generation took too long.');
    }
    if (error.name === 'TypeError') {
      throw new Error('Network connection failed. Please check your connection.');
    }
    throw error;
  }
}

/**
 * Checks API server health status
 * @returns {Promise<boolean>} - True if the server is healthy
 */
export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(10000)
    });
    return response.ok;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

/**
 * Debug function to test API connectivity
 */
export async function debugApiConnection() {
  try {
    await fetch(API_BASE_URL, { method: 'GET', signal: AbortSignal.timeout(5000) });
  } catch {
    // suppressed
  }
  return await checkApiHealth();
}
