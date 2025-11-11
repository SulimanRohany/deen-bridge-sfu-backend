// Diagnostic script to check mediasoup installation
const path = require('path');
const fs = require('fs');

console.log('=== Mediasoup Installation Diagnostic ===\n');

// Check Node.js version
console.log(`Node.js version: ${process.version}`);
console.log(`Platform: ${process.platform}`);
console.log(`Architecture: ${process.arch}\n`);

// Try to resolve mediasoup
try {
  const mediasoupMainPath = require.resolve('mediasoup');
  // mediasoup main is at node_modules/mediasoup/node/lib/index.js
  // We need to go up to the mediasoup root: node_modules/mediasoup
  const mediasoupRoot = path.join(path.dirname(mediasoupMainPath), '..', '..');
  
  console.log(`✓ Mediasoup package found at: ${mediasoupRoot}\n`);
  
  // Check for worker binary
  const workerPath = path.join(mediasoupRoot, 'worker', 'out', 'Release', 'mediasoup-worker.exe');
  console.log(`Checking for worker binary at:`);
  console.log(`  ${workerPath}\n`);
  
  if (fs.existsSync(workerPath)) {
    const stats = fs.statSync(workerPath);
    console.log(`✓ Worker binary found!`);
    console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Modified: ${stats.mtime}\n`);
    
    // Try to require mediasoup
    console.log('Attempting to import mediasoup...');
    const mediasoup = require('mediasoup');
    console.log('✓ Mediasoup imported successfully\n');
    
    console.log('Attempting to create a worker...');
    mediasoup.createWorker({
      logLevel: 'warn',
      logTags: ['worker'],
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
    }).then((worker) => {
      console.log('✓ Worker created successfully!');
      console.log(`  Worker PID: ${worker.pid}`);
      console.log(`  Worker closed: ${worker.closed}\n`);
      
      console.log('=== All checks passed! ===');
      console.log('Your mediasoup installation is working correctly.\n');
      
      // Clean up
      worker.close();
      process.exit(0);
    }).catch((error) => {
      console.error('✗ Failed to create worker:');
      console.error(`  ${error.message}`);
      console.error(`\nStack trace:`);
      console.error(error.stack);
      process.exit(1);
    });
    
  } else {
    console.error(`✗ Worker binary NOT found!`);
    console.error(`\nThe mediasoup-worker.exe file is missing.`);
    console.error(`This usually happens when:`);
    console.error(`  1. npm install didn't complete the build`);
    console.error(`  2. Build tools are not installed`);
    console.error(`  3. Python is not available\n`);
    
    console.error(`To fix this, try:`);
    console.error(`  1. npm rebuild mediasoup`);
    console.error(`  2. npm uninstall mediasoup && npm install mediasoup`);
    console.error(`  3. Install Windows Build Tools (see TROUBLESHOOTING.md)\n`);
    
    process.exit(1);
  }
  
} catch (error) {
  console.error('✗ Error during diagnostic:');
  console.error(`  ${error.message}\n`);
  console.error('Stack trace:');
  console.error(error.stack);
  process.exit(1);
}

