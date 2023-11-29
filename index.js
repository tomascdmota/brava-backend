import express from "express";
import cors from 'cors';
import router from "./routes/router.js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

const app = express();

dotenv.config();
const allowedOrigins = [
  'http://192.168.1.155:3000',
  'https://192.168.1.155:3000',
  'http://10.11.66.111:3000',
  'https://brava-bucket.s3.eu-west-2.amazonaws.com',
];





app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified origin.';
      return callback(new Error(msg), false);
    }

    return callback(null, true);
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
}));

const PORT = 3306;

app.use(express.json());
app.use(cookieParser());
app.use("/api", router);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));