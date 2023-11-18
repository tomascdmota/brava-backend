import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import jwt from "jsonwebtoken"
import connection from '../lib/db.js';
import dotenv from "dotenv"

dotenv.config();


export async function validateRegister(req, res, next) {
    // username min length 3
    if (!req.body.username || req.body.username.length < 3) {
      return res.status(400).json({
        message: 'Please enter a username with min. 3 chars',
      });
    }j
    // password min 6 chars
    if (!req.body.password || req.body.password.length < 6) {
      return res.status(400).json({
        message: 'Please enter a password with min. 6 chars',
      });
    }
    // password (repeat) must match
    if (!req.body.passwordVerify || req.body.password !== req.body.passwordVerify) {
      return res.status(400).json({
        message: 'Both passwords must match',
      });
    }
    // Validate email format
    if (!validateEmail(req.body.email)) {
      return res.status(400).json({
        message: 'Please enter a valid email address',
      });
    }
  
    // Register the user
    try {
      // Check if the username or email already exists
      const existingUser = await checkExistingUser(req.body.username, req.body.email);
  
      if (existingUser) {
        console.log("um utilizador com este username ja existe")
        // Username or email already in use
        return res.status(409).json({
          message: 'Um utilizador com este nome ou email já existe.',
        });
       
      }
  
      // Username and email are not in use
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const userId = uuidv4();
      const token = jwt.sign({ userId: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
      
      // Assuming you want to send the user ID back to the frontend for session management
      req.userId = userId;
      req.token = token;
      
      next();
    } catch (error) {
      console.error('Error hashing password or checking existing user:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  }
  
  async function checkExistingUser(username, email) {
    return new Promise((resolve, reject) => {
      connection.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?);',
        [username, email],
        (error, result) => {
          if (error) {
            console.error('Error checking existing user:', error);
            reject(error);
          } else {
            resolve(result && result.length > 0);
          }
        }
      );
    });
  }
  
  export function validateEmail(email) {
    // You can use a regular expression or a library like 'validator' to validate email format
    // Here, a simple regex is used for demonstration purposes
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  export function validateToken(req, res, next) {
    const token = req.headers.authorization;
  
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
  
    try {
      // Verify the token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
      // Assuming you want to send the decoded information to the next middleware
      req.userData = decoded;
  
      next();
    } catch (error) {
      console.error('Error validating token:', error);
      return res.status(401).json({ message: 'Unauthorized' });
    }
  }



