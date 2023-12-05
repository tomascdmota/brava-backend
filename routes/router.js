
import express from 'express';
import bcrypt from 'bcryptjs'
import shortUUID from 'short-uuid';
import jwt from "jsonwebtoken"
import connection from "../lib/db.js"
import { validateRegister, validateFormInputs} from '../middleware/users.js';
import { S3Client, S3, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import formidable from 'formidable';
import imageType from 'image-type';




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
  region, defaultAccessControlList: 'public-read',
});



const parsefile = async (req) => {
  const options = {
    maxFileSize: 10 * 1024 * 1024, // 10 MBs converted to bytes
    allowEmptyFiles: false,
  };

  const form = formidable(options);

  try {
    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err.message);
        } else {
          resolve({ files });
        }
      });
    });

    const uploadFile = async (file) => {
      const s3Key = `${Date.now().toString()}-${file.name}`;
      const fileBuffer = await fileToBuffer(file);
      const fileTypeResult = imageType(fileBuffer);

      const contentType = fileTypeResult ? fileTypeResult.mime : 'application/octet-stream';

      const s3Client = new S3Client({
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        region,
       
      });

      const uploadParams = {
        ACL: 'public-read',
        Bucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
      };

      try {
        // Upload file to S3
        const s3Response = await s3Client.send(new PutObjectCommand(uploadParams));
        return { s3Response, s3Key };
      } catch (error) {
        throw error;
      }
    };

    form.on('fileBegin', (formName, file) => {
      file.open = async function () {
        const { s3Response, s3Key } = await uploadFile(this);
        form.emit('data', { name: 'complete', value: { s3Response, s3Key } });
      };
    });
  } catch (error) {
    form.emit('error', error);
  }
};

const fileToBuffer = (file) => {
  return new Promise((resolve, reject) => {
    if (file.buffer) {
      // For multer
      resolve(file.buffer);
    } else {
      // For formidable
      const chunks = [];
      file.on('data', (chunk) => {
        chunks.push(chunk);
      });
      file.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      file.on('error', (error) => {
        reject(error);
      });
    }
  });
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
          httpOnly: false,
	  sameSite: 'None',
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


// app.get('/test-cookie', (req, res) => {
//   res.cookie('test_cookie', 'test_value', { path: '/' });
//   res.send('Cookie set!');
// });

// app.get('/read-cookie', verifyTokenMiddleware,(req, res) => {
//   console.log('Cookies:', req.cookies);
//   res.send('Cookie read!');
// });














router.get('/:id/profile',(req, res) => {
  const userId = req.params.id;

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
)  
});


router.get('/:id/dashboard', (req, res) => {
  const userId = req.params.id;
 const token = req.headers.authorization;
          console.log("Incoming token:", token); 
  connection.query(
    'SELECT * FROM contacts WHERE user_id = ?;',
    [userId],
    (error, result) => {
      if (error) {
        console.error('Error executing query:', error);
        connection.release();
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
      }

      // You may want to handle the case where the result is an empty array differently,
      // depending on your use case. For now, let's just return the array.
    
      const userData = result;

      if(userData === null){
        res.status(203).send({message: "No contacts"});
        console.log("No userdata")
      }
      // Send user data to the frontend
      res.json(userData);
      console.log(userData)
      console.log("Contact count:", userData.length)
    }
  );
});

router.post("/createcard", upload.fields([{ name: 'profilePicture', maxCount: 1 }, { name: 'background_image', maxCount: 1 }]), async (req, res) => {
  const { userId, name, email, company, position, phone, instagram, facebook, linkedin, url } = req.body;
  const cardId = Math.floor(Math.random() * 1000000);

  // Check if profilePicture and background_image fields exist in req.files
  const hasProfilePicture = req.files && req.files.profilePicture && req.files.profilePicture[0];
  const hasBackgroundImage = req.files && req.files.background_image && req.files.background_image[0];

  // Your S3 upload logic here
  const uploadToS3 = async (file, type) => {
    const s3Key = `${type}_${Date.now().toString()}-${file.originalname}`;
    const fileBuffer = await fileToBuffer(file);
    const fileTypeResult = imageType(fileBuffer);

    const contentType = fileTypeResult ? fileTypeResult.mime : 'application/octet-stream';

    const uploadParams = {
      Bucket,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType,
    };

    try {
      // Upload file to S3
      const s3Response = await s3Client.send(new PutObjectCommand(uploadParams));
      return { s3Response, s3Key };
    } catch (error) {
      throw error;
    }
  };

  try {
    let profilePictureUrl, backgroundImageUrl;

    // Upload profilePicture to S3 if it exists
    if (hasProfilePicture) {
      const profilePictureFile = req.files.profilePicture[0];
      const profilePictureData = await uploadToS3(profilePictureFile, 'profilePicture');
      profilePictureUrl = encodeURI(`https://${Bucket}.s3.${region}.amazonaws.com/${profilePictureData.s3Key}`);
    }

    // Upload backgroundImage to S3 if it exists
    if (hasBackgroundImage) {
      const backgroundImageFile = req.files.background_image[0];
      const backgroundImageData = await uploadToS3(backgroundImageFile, 'background_image');
      backgroundImageUrl = encodeURI(`https://${Bucket}.s3.${region}.amazonaws.com/${backgroundImageData.s3Key}`);
    }

    // Insert card information into the database
    connection.query(
      'INSERT INTO cards (card_id, id, username, email, company, title, phone, instagram, facebook, linkedin, url, profile_image_url, background_image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      [cardId, userId, name, email, company, position, phone, instagram, facebook, linkedin, url, profilePictureUrl, backgroundImageUrl],
      (err, result) => {
        if (err) {
          console.log("Error inserting card into database:", err);
          return res.status(500).json({ message: "Internal server error" });
        }

        res.status(201).json({ cardId, message: "Card created successfully", userId });
      }
    );
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});


router.get("/:id/dashboard/cards" ,(req, res, next) => {
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
      region, defaultAccessControlList: 'public-read',
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






router.post('/:id/message',(req,res,next) => {
  const userId = req.params.id;
  const contact_id = shortUUID.generate();
  const {name, email, message} = req.body;
  console.log("User id:", userId);
  console.log("Contact id:", contact_id);
  console.log("name:", name);
  console.log("email", email);
  console.log("Message", message);

  connection.query(`INSERT INTO contacts (user_id, contact_id, name, email, message, contact_date ) VALUES (?, ?, ?, ?, ?, NOW())`, [userId, contact_id, name,email,message], async (err, result) => {
    if(err) {
      return res.status(500).send({message: "Error sending contact"});
    }
    else{
      return res.status(200).send({message: "Message sent."});
    }
  })
})

