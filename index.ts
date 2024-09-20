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
  'https://brava-bucket.s3.eu-west-2.amazonaws.com',
  '*'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
      console.log(origin);
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use('/api/auth', authRoutes);
app.use('/api/card', cardRoutes);  

const PORT = process.env.PORT || 4001;

app.listen(4001, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
