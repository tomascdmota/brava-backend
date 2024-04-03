  import express from "express";
  import cors from 'cors';
  import router from "./routes/router.js";
  import dotenv from "dotenv";
  import cookieParser from "cookie-parser";

const app = express();
app.use(cookieParser());
dotenv.config();
const allowedOrigins = [
  'http://localhost:3000',
  'http://192.168.1.155:3000',
  'http://18.133.155.66:3000',
  'https://18.133.155.66:3000',
  'https://app.bravanfc.com/*',
  'https://brava-bucket.s3.eu-west-2.amazonaws.com',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


const PORT = 4001;


app.use(express.json());

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  next();
});
app.use("/api", router, (req,res,next)=> {console.log('REQUEST HEADERS:', req.headers); next()}) ;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
