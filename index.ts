import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes'; // Updated import for TypeScript
import cardRoutes from './routes/cardRoutes'

dotenv.config();

const app = express();

app.use(cookieParser());
app.use(express.json());

const allowedOrigins = [
  'http://localhost:3000',
  'http://192.168.1.155:3000',
  'http://18.133.155.66:3000',
  'https://18.133.155.66:3000',
  'https://app.bravanfc.com',
  'http://185.97.146.17:3000',
  'http://srv597605.hstgr.cloud:3000',
  'https://brava-bucket.s3.eu-west-2.amazonaws.com',
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests, etc.)
    if (!origin) return callback(null, true);

    // Log the incoming origin for debugging
    console.log(`Incoming origin: ${origin}`);

    // Check if the incoming origin is in the allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`Origin not allowed by CORS: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true, // Allow cookies/auth headers
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}));


app.options('*', cors()); // Handle preflight

app.use('/api/auth', authRoutes);
app.use('/api/card', cardRoutes);  

const PORT = process.env.PORT || 4001;

app.listen(4001, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
