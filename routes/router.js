
import express from 'express';
const router = express.Router();
import bcrypt from 'bcryptjs'
import {v4 as uuidv4} from "uuid";
import jwt from "jsonwebtoken"
import connection from "../lib/db.js"
import { validateRegister, fetchUserProfile } from '../middleware/users.js';

const JWT_SECRET = process.env.JWT_SECRET;

router.post('/sign-up', validateRegister, (req, res, next) => {
  const { username, email, password } = req.body;

  // Check if the username already exists
  connection.query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER(?);',
    [username],
    (err, result) => {
      if (err) {
        console.error('Error checking for existing user:', err);
        return res.status(500).json({ message: 'Internal Server Error' });
      }

      if (result && result.length) {
        // Username already in use
        return res.status(409).json({ message: 'Um utilizador com este nome já existe.' });
      } else {
        // Username not in use
        bcrypt.hash(password, 10, (err, hash) => {
          if (err) {
            console.error('Error hashing password:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
          }

          const userId = uuidv4();
          // Insert user data into the database
          connection.query(
            'INSERT INTO users (id, username, email, password, registered) VALUES (?, ?, ?, ?, NOW());',
            [userId, username, email, hash],
            (err, result) => {
              if (err) {
                console.error('Error inserting user into the database:', err);
                return res.status(500).json({ message: 'Internal Server Error' });
              }

              // Generate JWT token
              const token = jwt.sign({ userId, username, email }, JWT_SECRET, { expiresIn: '1h' });

              // Assuming you want to send the user ID back to the frontend for session management
              req.userId = userId;
              req.token = token;

              return res.status(201).json({ userId, message: 'Registado com sucesso!', token });
            }
          );
        });
      }
    }
  );
});

router.post('/login', (req, res, next) => {
  connection.query(
    `SELECT * FROM users WHERE username = ?;`,
    [req.body.username],
    (err, result) => {
      if (err) {
        return res.status(400).send({
          message: err,
        });
      }
      if (!result.length) {
        return res.status(400).send({
          message: 'Username or password incorrect!',
        });
      }
      bcrypt.compare(
        req.body.password,
        result[0]['password'],
        (bErr, bResult) => {
          if (bErr) {
            return res.status(400).send({
              message: 'Username or password incorrect!',
            });
          }
          if (bResult) {
            // password match
            const token = jwt.sign(
              {
                username: result[0].username,
                userId: result[0].id,
              },
              'SECRETKEY',
              { expiresIn: '7d' }
            );
            connection.query(`UPDATE users SET last_login = now() WHERE id = ?;`, [
              result[0].id,
            ]);
            return res.status(200).send({
              message: 'Logged in!',
              token,
              user: result[0],
            });
          }
          return res.status(400).send({
            message: 'Username or password incorrect!',
          });
        }
      );
    }
  );
});

router.get('/profile/:id', (req, res) => {
  const userId = req.params.id;

  connection.query(
    'SELECT username, email, registered FROM users WHERE id = ?;',
    [userId],
    (error, result) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
      }

      if (result.length === 0) {
        // If user not found, return 404
        return res.status(404).json({ message: 'User not found' });
      }

      const userData = result[0];

      console.log('Query Result:', userData);

      // Send user data to the frontend
      res.json(userData);
    }
  );
});

export default router;