const fs = require('fs');

function main() {
  const xmlContent = fs.readFileSync('sample_do_firmy.xml', 'utf-8');
  
  // Search for LEGO EAN/SKU in the XML
  console.log("Does XML contain '5906142901678'?", xmlContent.includes('5906142901678'));
  console.log("Does XML contain '5702016914177'?", xmlContent.includes('5702016914177'));
  console.log("Does XML contain '10281'?", xmlContent.includes('10281'));
  
  // Let's print the first <o> block from XML
  const match = xmlContent.match(/<o[\s\S]*?<\/o>/);
  if (match) {
    console.log("\nFirst <o> tag block:");
    console.log(match[0]);
  }
}

main();
