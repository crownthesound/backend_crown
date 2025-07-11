// TikTok Connection Success Script
console.log('TikTok connection successful!');

// Close the popup window after a short delay
setTimeout(() => {
  console.log('Closing popup window...');
  if (window.opener) {
    // Send success message to parent window
    window.opener.postMessage({ type: 'TIKTOK_AUTH_SUCCESS' }, '*');
  }
  window.close();
}, 1500);

// Fallback in case window.close() doesn't work
setTimeout(() => {
  console.log('Fallback: redirecting to close message...');
  document.body.innerHTML = '<div style="text-align: center; padding: 2rem; font-family: Arial, sans-serif;"><h2>✅ Success!</h2><p>You can now close this window.</p></div>';
}, 3000);