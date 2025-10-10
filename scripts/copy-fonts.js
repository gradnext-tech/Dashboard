const fs = require('fs');
const path = require('path');

console.log('Copying PDFKit font files...');

// Source directory where PDFKit stores its font files
const sourceDir = path.join(__dirname, '..', 'node_modules', 'pdfkit', 'js', 'data');

// Multiple possible destination directories for different Next.js environments
const possibleDestDirs = [
  path.join(__dirname, '..', '.next', 'server', 'vendor-chunks', 'data'),
  path.join(__dirname, '..', '.next', 'server', 'chunks', 'data'),
  path.join(__dirname, '..', '.next', 'static', 'chunks', 'data'),
  path.join(__dirname, '..', 'node_modules', 'pdfkit', 'js', 'data') // Fallback to source
];

try {
  // Check if source directory exists
  if (!fs.existsSync(sourceDir)) {
    console.log('PDFKit data directory not found at:', sourceDir);
    console.log('Trying alternative location...');
    
    // Try alternative location
    const altSourceDir = path.join(__dirname, '..', 'node_modules', 'pdfkit', 'data');
    if (fs.existsSync(altSourceDir)) {
      console.log('Found PDFKit data at:', altSourceDir);
      copyFonts(altSourceDir, destDir);
    } else {
      console.log('PDFKit font files not found. This might be expected in some environments.');
      process.exit(0);
    }
  } else {
    // Copy to all possible destination directories
    possibleDestDirs.forEach(destDir => {
      copyFonts(sourceDir, destDir);
    });
  }
} catch (error) {
  console.error('Error copying font files:', error);
  // Don't fail the build if font copying fails
  process.exit(0);
}

function copyFonts(source, dest) {
  // Create destination directory if it doesn't exist
  fs.mkdirSync(dest, { recursive: true });

  // Copy all font files
  const files = fs.readdirSync(source);
  let copiedCount = 0;
  
  files.forEach(file => {
    if (file.endsWith('.afm') || file.endsWith('.ttf') || file.endsWith('.otf')) {
      const sourceFile = path.join(source, file);
      const destFile = path.join(dest, file);
      
      try {
        fs.copyFileSync(sourceFile, destFile);
        copiedCount++;
        console.log(`Copied: ${file}`);
      } catch (error) {
        console.warn(`Failed to copy ${file}:`, error.message);
      }
    }
  });

  console.log(`Successfully copied ${copiedCount} font files to build directory.`);
}
