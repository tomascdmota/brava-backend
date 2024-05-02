import { createPool } from 'mysql';
import { hash as _hash } from 'bcrypt';

// Create MySQL connection pool
const pool = createPool({
  host: 'brava-db.cil54y9frn21.eu-west-2.rds.amazonaws.com',
  user: 'admin',
  password: 'Externo.14',
  database: 'bravadb',
  connectionLimit: 10 // Adjust according to your needs
});

// Function to update password
function updatePassword(userId, newPassword) {
  // Hash the new password
  _hash(newPassword, 10, (err, hash) => {
    if (err) {
      console.error('Error hashing new password:', err);
      return;
    }

    // Update the user's password in the database
    pool.getConnection((err, connection) => {
      if (err) {
        console.error('Error getting database connection:', err);
        return;
      }

      connection.query(
        'UPDATE users SET password = ? WHERE id = ?',
        [hash, userId],
        (err, result) => {
          connection.release(); // Release the connection back to the pool
          if (err) {
            console.error('Error updating password:', err);
            return;
          }

          console.log('Password updated successfully');
        }
      );
    });
  });
}

// Example usage
updatePassword('pLQ38usDJMYGbRe5YWgk3r', 'damasiocar');
