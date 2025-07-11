// TikTok Connection Error Script
console.log('TikTok connection failed');

// Close the popup window after a short delay
setTimeout(() => {
  console.log('Closing error popup window...');
  if (window.opener) {
    // Send error message to parent window
    window.opener.postMessage({ type: 'TIKTOK_AUTH_ERROR', error: 'Connection failed' }, '*');
  }
  window.close();
}, 3000);

// Fallback in case window.close() doesn't work
setTimeout(() => {
  console.log('Fallback: showing close message...');
  document.body.innerHTML = '<div style="text-align: center; padding: 2rem; font-family: Arial, sans-serif;"><h2>❌ Error</h2><p>Please close this window and try again.</p></div>';
}, 5000);