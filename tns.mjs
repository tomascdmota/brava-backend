import { readFileSync, writeFileSync } from 'fs';
import { decode } from 'jpeg-js';

async function jpegToTns(jpegPath, tnsPath) {
  try {
    // Read the JPEG file
    const jpegData = readFileSync(jpegPath);
    
    // Decode the JPEG data
    const { data, width, height } = decode(jpegData);

    // Create a buffer from the decoded pixel data
    const buffer = Buffer.from(data);

    // Save the buffer to a binary file (TNS file)
    writeFileSync(tnsPath, buffer);

    console.log(`Conversion successful. TNS file saved at: ${tnsPath}`);
  } catch (error) {
    console.error(`Error converting JPEG to TNS: ${error.message}`);
  }
}

// Example usage:
const jpegFilePath = './img.jpg';
const tnsFilePath = './output2.tns';

jpegToTns(jpegFilePath, tnsFilePath);
