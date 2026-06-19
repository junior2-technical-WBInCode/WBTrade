const fs = require('fs');

async function searchOnline() {
  const url = 'https://cloud.appstore.mamezi.pl/feeds/shop4184b3ea00a6457ce3777d0ddab35ee5753c7c72/doFirmyPrivateApp01-pl_PL.xml';
  console.log('Searching online stream of do_firmy feed for lego codes...');
  
  try {
    const response = await fetch(url);
    const reader = response.body.getReader();
    let decoder = new TextDecoder('utf-8');
    let buffer = '';
    let found = false;
    
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, {stream: true});
      
      // Let's see if we have full <o> tags in the buffer
      let startIdx;
      while ((startIdx = buffer.indexOf('<o id=')) !== -1) {
        let endIdx = buffer.indexOf('</o>', startIdx);
        if (endIdx === -1) break; // incomplete tag, wait for more data
        
        const block = buffer.substring(startIdx, endIdx + 4);
        buffer = buffer.substring(endIdx + 4);
        
        if (block.includes('5702016914177') || block.includes('5906142901678')) {
          console.log('\nFOUND MATCHING <o> BLOCK IN DO_FIRMY:');
          console.log(block);
          found = true;
          break;
        }
      }
      
      if (found) {
        await reader.cancel();
        break;
      }
      
      // Keep buffer size reasonable
      if (buffer.length > 500000) {
        buffer = buffer.substring(buffer.length - 100000);
      }
    }
    
    if (!found) {
      console.log('Not found in do_firmy feed.');
    }
  } catch (error) {
    console.error('Error searching:', error.message);
  }
}

searchOnline();
