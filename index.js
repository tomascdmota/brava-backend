import express  from "express";
import cors from 'cors';
import router from "./routes/router.js"
import dotenv from "dotenv"
const app = express();

dotenv.config();

const PORT = 3306;

app.use(express.json());
app.use(cors());

app.use("/api", router);
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));