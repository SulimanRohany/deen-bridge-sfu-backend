// Diagnostic script to check mediasoup installation
const path = require('path');
const fs = require('fs');

// Check Node.js version

// Try to resolve mediasoup
try {
  const mediasoupMainPath = require.resolve('mediasoup');
  // mediasoup main is at node_modules/mediasoup/node/lib/index.js
  // We need to go up to the mediasoup root: node_modules/mediasoup
  const mediasoupRoot = path.join(path.dirname(mediasoupMainPath), '..', '..');
  
  // Check for worker binary
  const workerPath = path.join(mediasoupRoot, 'worker', 'out', 'Release', 'mediasoup-worker.exe');
  
  if (fs.existsSync(workerPath)) {
    const stats = fs.statSync(workerPath);
    
    // Try to require mediasoup
    const mediasoup = require('mediasoup');
    
    mediasoup.createWorker({
      logLevel: 'warn',
      logTags: ['worker'],
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
    }).then((worker) => {
      // Clean up
      worker.close();
      process.exit(0);
    }).catch((error) => {
      process.exit(1);
    });
    
  } else {
    process.exit(1);
  }
  
} catch (error) {
  process.exit(1);
}

