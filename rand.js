import { createConnection } from 'mysql';
import { writeFile } from 'fs';

// Configure your MySQL connection
const connection = createConnection({
  host: 'brava-db.cil54y9frn21.eu-west-2.rds.amazonaws.com',
  user: 'admin',
  password: 'Externo.14',
  database: 'bravadb',
});

// Function to query the 'cards' table and create a text file with URLs
function createTextFile() {
  // Connect to the database
  connection.connect((err) => {
    if (err) {
      console.error('Error connecting to MySQL: ' + err.stack);
      return;
    }

    console.log('Connected to MySQL as id ' + connection.threadId);

    // Query the 'cards' table
    connection.query('SELECT * FROM cards', (queryErr, results) => {
      if (queryErr) {
        console.error('Error querying MySQL: ' + queryErr.stack);
        connection.end(); // Close the connection in case of an error
        return;
      }

      // Create a text file and write URLs for each entry
      const fileContent = results.map((row) => `https://app.bravanfc.com/${row.id}/cards/${row.card_id}`).join('\n');

      writeFile('output.txt', fileContent, (writeErr) => {
        if (writeErr) {
          console.error('Error writing to file: ' + writeErr.stack);
        } else {
          console.log('Text file created successfully: output.txt');
        }

        // Close the MySQL connection
        connection.end();
      });
    });
  });
}

// Call the function to create the text file
createTextFile();
