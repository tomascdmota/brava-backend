import express  from "express";
import cors from 'cors';
import router from "./routes/router.js"
import dotenv from "dotenv"
import cookieParser from "cookie-parser";
const app = express();

dotenv.config();
const corsOptions = {
    origin: "http://localhost:3000",
    credentials: true
}
const PORT = 3306;

app.use(express.json());
app.use(cors(corsOptions));


app.use(cookieParser());

app.use("/api", router);
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));