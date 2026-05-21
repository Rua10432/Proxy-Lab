const fs = require('fs');

const html = fs.readFileSync('src/index.html', 'utf-8');

const pagesToExtract = ['test', 'scan', 'config', 'logs', 'settings'];

let newHtml = html;

if (!fs.existsSync('src/pages')) fs.mkdirSync('src/pages');

for (const page of pagesToExtract) {
  // Find the start of the page div
  const startRegex = new RegExp(`<!-- ═══════════════════════════════════════════════════════════════════════\\s+Page: ${page.charAt(0).toUpperCase() + page.slice(1)}\\s+═══════════════════════════════════════════════════════════════════════ -->\\s*<div class="page(?: active)?" id="page-${page}">`);
  
  const startMatch = html.match(startRegex);
  if (!startMatch) {
    console.log(`Could not find start of ${page}`);
    continue;
  }
  const startIndex = startMatch.index;
  
  // Find the end by looking for the next page banner, or the end of pages-container
  const endRegex1 = /<!-- ═══════════════════════════════════════════════════════════════════════/g;
  endRegex1.lastIndex = startIndex + 10;
  let endMatch = endRegex1.exec(html);
  
  let endIndex;
  if (endMatch) {
    endIndex = endMatch.index;
  } else {
    // End of container
    endIndex = html.indexOf('</div><!-- End #pages-container -->');
  }
  
  const pageContent = html.substring(startIndex, endIndex).trim();
  fs.writeFileSync(`src/pages/${page}.html`, pageContent);
  
  // Remove from newHtml
  newHtml = newHtml.replace(pageContent, '');
}

// Clean up whitespace in index.html where we removed things
newHtml = newHtml.replace(/(<div id="pages-container">)\s+(<\/div><!-- End #pages-container -->)/g, '$1\n          <!-- SPA Content Injected Here via Hash Router -->\n        $2');

fs.writeFileSync('src/index.html', newHtml);
console.log('Split completed');
