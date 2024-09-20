import db from '../lib/db';
import { RowDataPacket } from 'mysql2/promise';


interface User {
  id: number;
  username: string;
  email: string;
  password: string;
  registered: Date;
  last_login: Date;
  phone: string;
}

const UserModel = {
  findByUsername: async (username: string): Promise<User | null> => {
    const query = `SELECT * FROM users WHERE username = ?;`;

    // db.query returns a tuple: [rows, metadata]. We only care about the rows.
    const [rows] = await db.query<User[] & RowDataPacket[]>(query, [username]);

    if (rows.length === 0) {
      return null;
    }
    return rows[0]; // Return the first User or null if no match
  },

  updateLastLogin: async (id: number): Promise<void> => {
    const query = `UPDATE users SET last_login = NOW() WHERE id = ?;`;

    await db.query(query, [id]); // No need for result typing here, just await
  }
};

export default UserModel;
