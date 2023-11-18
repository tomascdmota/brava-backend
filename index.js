import express  from "express";
import cors from 'cors';
const router =  require("./routes/router");
const app = express();

require('dotenv').config();

const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors());

app.use("/api", router);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));