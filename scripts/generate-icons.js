const fs = require('fs');
const path = require('path');

// Create a simple SVG icon for Melodiya
const createSVGIcon = (size) => {
  const center = size / 2;
  const radius = size * 0.35;
  
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#a855f7;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad)"/>
    <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="white" stroke-width="${size * 0.08}"/>
    <circle cx="${center}" cy="${center}" r="${radius * 0.3}" fill="white"/>
    <path d="M ${center - radius * 0.4} ${center - radius * 0.2} L ${center + radius * 0.4} ${center} L ${center - radius * 0.4} ${center + radius * 0.2} Z" fill="#a855f7"/>
  </svg>`;
};

// Convert SVG to PNG using Canvas (simplified version)
const svgToPng = (svg, size) => {
  // This is a simplified version - in a real implementation, you'd use a library like sharp or canvas
  // For now, we'll create a simple colored square as placeholder
  const canvas = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#a855f7"/>
      <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white" font-family="Arial, sans-serif" font-size="${size * 0.3}" font-weight="bold">M</text>
    </svg>
  `;
  return canvas;
};

// Generate all required icon sizes
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Ensure public directory exists
const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate icons
iconSizes.forEach(size => {
  const svg = createSVGIcon(size);
  const png = svgToPng(svg, size);
  const filename = `icon-${size}x${size}.png`;
  const filepath = path.join(publicDir, filename);
  
  // For now, we'll save as SVG since we don't have PNG conversion
  // In production, you'd convert to PNG
  fs.writeFileSync(filepath.replace('.png', '.svg'), png);
  console.log(`Generated ${filename}`);
});

console.log('Icon generation complete!');
console.log('Note: These are SVG files. For production, convert to PNG using a tool like sharp or canvas.');
