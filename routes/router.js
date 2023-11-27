
import express from 'express';
import bcrypt from 'bcryptjs'
import shortUUID from 'short-uuid';
import jwt from "jsonwebtoken"
import connection from "../lib/db.js"
import { validateRegister, verifyTokenMiddleware} from '../middleware/users.js';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Client, S3, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import formidable from 'formidable';
import imageType from 'image-type';
import { Transform } from 'stream';



const app = express();
app.set('json spaces', 5)
app.use(cookieParser());



const router = express.Router();
const upload = multer();
const JWT_SECRET = process.env.JWT_SECRET;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.S3_REGION;
const Bucket = process.env.S3_BUCKET;



const s3Client = new S3Client({
  credentials: {
    accessKeyId,
    secretAccessKey
  },
  region
});



const parsefile = async (req) => {
  const options = {
    maxFileSize: 10 * 1024 * 1024, // 10 MBs converted to bytes
    allowEmptyFiles: false,
  };

  const form = formidable(options);

  try {
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err.message);
        } else {
          resolve({ fields, files });
        }
      });
    });

    const uploadFile = async (file) => {
      const s3Key = `${Date.now().toString()}-${file.originalFilename}`;

      await new Upload({
        client: new S3Client({
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
          region,
        }),
        params: {
          ACL: 'public-read',
          Bucket,
          Key: s3Key,
          Body: file,
        },
        tags: [], // optional tags
        queueSize: 4, // optional concurrency configuration
        partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
        leavePartsOnError: false, // optional manually handle dropped parts
      })
        .done()
        .then((data) => {
          form.emit('data', { name: 'complete', value: data });
        })
        .catch((err) => {
          form.emit('error', err);
        });
    };

    form.on('fileBegin', (formName, file) => {
      file.open = async function () {
        const uploadPromise = uploadFile(this);

        this._writeStream = new Transform({
          transform(chunk, encoding, callback) {
            callback(null, chunk);
          },
        });

        this._writeStream.on('error', (e) => {
          form.emit('error', e);
        });

        try {
          await uploadPromise;
        } catch (err) {
          form.emit('error', err);
        }
      };
    });
  } catch (error) {
    form.emit('error', error);
  }
};




router.post('/sign-up', validateRegister, (req, res, next) => {
  const { username, email, phone, password } = req.body;
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

          const userId = shortUUID.generate();
          // Insert user data into the database
          connection.query(
            'INSERT INTO users (id, username, email, phone, password, registered, last_login) VALUES (?, ?, ?, ?, ?, NOW(), NOW());',
            [userId, username, email, phone, hash],
            (err, result) => {
              if (err) {
                console.error('Error inserting user into the database:', err);
                return res.status(500).json({ message: 'Internal Server Error' });
              }

              // Generate JWT token
              const token = jwt.sign({ userId, username, email }, JWT_SECRET, { expiresIn: '30d' });

              // Assuming you want to send the user ID back to the frontend for session management
              req.userId = userId;
              req.token = token;
              
              res.cookie('session_token', token, {
                maxAge: 60*60*24*30*1000, //30 days
                secure: true,
                httpOnly: false
              })

              return res.status(201).json({ userId, message: 'Registado com sucesso!', token });
            }
          );
        });
      }
    }
  );
});

router.post('/login' ,(req, res, next) => {
  connection.query(
    `SELECT * FROM users WHERE email = ?;`,
    [req.body.email],
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
      bcrypt.compare(req.body.password, result[0]['password'], (bErr, bResult) => {
        if (bErr) {
          return res.status(400).send({
            message: 'Username or password incorrect!',
          });
        }
        if (bResult) {
          // password match
          

          // Generate a JWT token
          const token = jwt.sign(
            {
                username: result[0].username,
                userId: result[0].id,
            },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );
        res.cookie('session_token', token, {
          maxAge: 60*60*24*30*1000, //30 days
          secure: false,
          httpOnly: false
        })
          connection.query(`UPDATE users SET last_login = NOW() WHERE id = ?;`, [result[0].id]);

          return res.status(200).send({
            message: 'Logged in!',
            token,
            user: result[0],
          });
        }
        return res.status(400).send({
          message: 'Username or password incorrect!',
        });
      });
    }
  );
});

router.get('/:id/profile', verifyTokenMiddleware,(req, res) => {
  const userId = req.params.id;
  console.log(res.data)

  connection.query(
    'SELECT username, email, phone, registered FROM users WHERE id = ?;',
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
      // Send user data to the frontend
      res.json(userData);
    }
  );
});


router.get('/:id/dashboard', verifyTokenMiddleware,(req, res) => {
  const userId = req.params.id;
  console.log(res.data)

  connection.query(
    'SELECT username FROM users WHERE id = ?;',
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
      // Send user data to the frontend
      res.json(userData);
    }
  );
});



router.post("/createcard", verifyTokenMiddleware, upload.single('profilePicture'), async (req, res) => {
  const { userId, name, email, company, position, phone, instagram, facebook, linkedin, url } = req.body;
  const cardId = Math.floor(Math.random() * 1000000);

  if (!req.file) {
    return res.status(400).json({ message: "No file provided" });
  }

  // Your S3 upload logic here
  

  const uploadParams = {
    Bucket,
    Key: `${Date.now().toString()}-${req.file.originalname}`,
    Body: req.file.buffer, // Assuming multer saves the file in req.file.buffer
    ContentDisposition: 'inline'
  };

  try {
    // Upload file to S3
    const s3Response = await s3Client.send(new PutObjectCommand(uploadParams));
  
    // Log the S3 response
    console.log('S3 Response:', s3Response);
  
    // Construct the S3 URL based on bucket and key
    const imageUrl = encodeURI(`https://${Bucket}.s3.${region}.amazonaws.com/${uploadParams.Key}`);
    
    // Insert card information into the database
    connection.query(
      'INSERT INTO cards (card_id, id, username, email, company, title, phone, instagram, facebook, linkedin, url, profile_image_url) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?, ?);',
      [cardId, userId, name, email, company, position, phone, instagram, facebook, linkedin, url, imageUrl],
      async (err, result) => {
        if (err) {
          console.log("Error inserting card into database:", err);
          return res.status(500).json({ message: "Internal server error" });
        }

        // Call the correct function here
        try {
          const data =  parsefile(req);
          console.log(imageUrl);
          res.status(201).json({ cardId, message: "Card created successfully", userId, data });
        } catch (fileParserError) {
          console.error("Error parsing file:", fileParserError);
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});


router.get("/:id/dashboard/cards", verifyTokenMiddleware ,(req, res, next) => {
  connection.query(`SELECT * FROM cards WHERE id = ?;`, [req.params.id], (err, result) => {
    if (err) {
      return res.status(400).send({ message: err });
    }
    if (!result.length) {
      return res.status(400).send({
        message: 'No cards yet',
      });
    }

    return res.status(200).send({
      message: "Cards",
      cards: result,
    });
  });
});

router.get("/profile/:cardId", (req, res, next) => {
  connection.query(`SELECT * FROM cards WHERE card_id = ?`, [req.params.id], (err, result) => {
    if (err) {
      return res.status(400).send({ message: err });
    }
    if (!result.length) {
      return res.status(400).send({
        message: 'No cards yet',
      });
    }
    console.log(result)
    return res.status(200).send({
      message: "Cards",
      cards: result,
    });
  });
})


router.get('/images/:id', async (req, res) => {
  const cardId = req.params.id;

  // Fetch the card from the database to get the S3 key
  connection.query('SELECT * FROM cards WHERE id = ?;', [cardId], async (err, result) => {
    if (err) {
      console.error('Error fetching card from the database:', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const card = result[0];
    const s3Key = card.profile_image_url;

    const s3Client = new S3Client({
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      region,
    });

    // Fetch the image from S3
    try {
      const data = await s3Client.send(new GetObjectCommand({ Bucket, Key: s3Key }));
      const imageInfo = imageType(data.Body);
      const imageBuffer = Buffer.from(data.Body);

      // Set appropriate headers and send the image to the client
      res.setHeader('Content-Type', imageInfo.mime);
      res.send(imageBuffer);
    } catch (error) {
      console.error('Error fetching image from S3:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
});


router.get("/:id/cards", (req, res,next) => {
  const userId = req.params.id;

  connection.query(`SELECT * FROM cards WHERE id = ?;`, [userId], (err, result) => {
    if (err) {
      return res.status(400).send({ message: err });
    }
    if (!result.length) {
      return res.status(400).send({
        message: 'No cards yet',
      });
    }
    console.log(result)
    return res.status(200).send({
      message: "Cards",
      cards: result,
    });
  });
});

export default router;