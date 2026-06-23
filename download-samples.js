const fs = require('fs');

const feeds = {
  do_firmy: 'https://cloud.appstore.mamezi.pl/feeds/shop4184b3ea00a6457ce3777d0ddab35ee5753c7c72/doFirmyPrivateApp01-pl_PL.xml',
  btp: 'https://ext.btp.link/Gateway/ExportData/ProductCatalogue?Format=Xml&u=7C93A576-737A-4E62-B0AD-C2CB40FAB893&uc=A694FB15-1C0E-4A1C-81B8-6423BB43547A',
  hurtownia_przemyslowa: 'https://www.hurtowniaprzemyslowa.pl/xml/baselinker.xml',
  leker: 'https://b2b.leker.pl/xml/base_all_drop_pln_pl.xml',
  polzoo: 'https://polzoo.pl/edi/export-offer.php?client=support@wb-partners.pl&language=pol&token=d8149dd25ac49d1c07e1fa5&shop=1&type=full&format=xml&iof_3_0',
  hurtownia_kuchenna: 'https://kinghoff.online/offers/type/xml/key/d00cdfe53b534389/lang/pl'
};

async function downloadSample(name, url) {
  console.log(`Downloading sample for ${name} from ${url}...`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const reader = response.body.getReader();
    let receivedLength = 0;
    let chunks = [];
    
    // Read up to 150KB
    const limit = 150 * 1024; 
    
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      
      chunks.push(value);
      receivedLength += value.length;
      
      if (receivedLength >= limit) {
        console.log(`Reached limit of 150KB for ${name}, canceling stream.`);
        await reader.cancel();
        break;
      }
    }
    
    let allChunks = new Uint8Array(receivedLength);
    let position = 0;
    for (let chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }
    
    const text = new TextDecoder("utf-8").decode(allChunks);
    fs.writeFileSync(`sample_${name}.xml`, text);
    console.log(`Saved sample_${name}.xml successfully.`);
  } catch (error) {
    console.error(`Error downloading ${name}:`, error.message);
  }
}

async function main() {
  for (const [name, url] of Object.entries(feeds)) {
    await downloadSample(name, url);
  }
}

main();
