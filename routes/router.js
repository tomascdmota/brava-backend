
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
import nodemailer from 'nodemailer'
import bodyParser from 'body-parser';




const app = express();
app.set('json spaces', 5)
app.use(cookieParser());



const router = express.Router();
const upload = multer();
const JWT_SECRET = process.env.JWT_SECRET;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = 'eu-west-2'
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

router.post('/login', (req, res, next) => {
  connection.query(
    `SELECT * FROM users WHERE email = ?;`,
    [req.body.email],
    async (err, result) => {
      try {
        if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ message: 'Internal Server Error' });
        }
        console.log(req.body.email)
        console.log('SQL Query:', `SELECT * FROM users WHERE email = '${req.body.email}';`);
        console.log('Result from Database:', result);

        if (!result.length) {
          return res.status(400).send({
            message: 'Username or password incorrect!',
          });
        }

        const inputtedPassword = req.body.password.trim();
        const storedHashedPassword = result[0]['password'];

        console.log('Inputted Password:', inputtedPassword);
        console.log('Stored Hashed Password:', storedHashedPassword);

        // Directly compare the stored hash with a manually generated hash
        const manuallyGeneratedHash = '$2b$10$JDcL6JcNmIDtcQiu5etIf.oOOVZA2l2Pt7eVmaZU8OTzZPRmX91B6'; // Replace with the actual hash
        const directComparison = manuallyGeneratedHash === storedHashedPassword;
        console.log('Direct Comparison Result:', directComparison);

        const passwordMatch = await bcrypt.compare(inputtedPassword, storedHashedPassword);
        if (passwordMatch) {
          const token = generateToken({
            username: result[0].username,
            userId: result[0].id,
          });

          res.cookie('session_token', token, {
            maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days
            secure: process.env.NODE_ENV === 'production', // Set to true in production
            httpOnly: false,
            sameSite: 'None',
          });

          await connection.query(`UPDATE users SET last_login = NOW() WHERE id = ?;`, [result[0].id]);

          return res.status(200).send({
            message: 'Logged in!',
            token,
            user: result[0],
          });
        } else {
          console.log('Password does not match'); // Add this for troubleshooting
          return res.status(400).send({
            message: 'Username or password incorrect!',
          });
        }
      } catch (error) {
        console.error('Error during login:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
      }
    }
  );
});



// Function to generate JWT token
function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
}


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
  " SELECT contacts.*, users.username, cards.profile_image_url FROM contacts JOIN users ON contacts.user_id = users.id JOIN cards ON contacts.user_id = cards.id WHERE contacts.user_id = ?;",
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
  const { userId, name, email, company, position, phone, instagram, facebook, linkedin, url,tiktok, spotify, twitter, paypal, vinted, notes, standvirtual, olx, piscapisca, custojusto } = req.body;
  const cardId = Math.floor(Math.random() * 1000000);

  // Check if profilePicture and background_image fields exist in req.files
  const hasProfilePicture = req.files && req.files.profilePicture && req.files.profilePicture[0];
  const hasBackgroundImage = req.files && req.files.background_image && req.files.background_image[0];

  // Your S3 upload logic here
  const uploadToS3 = async (file, type) => {
    const s3Key = accessKeyId;
    const fileBuffer = await fileToBuffer(file);
    const fileTypeResult = imageType(fileBuffer);

    const contentType = fileTypeResult ? fileTypeResult.mime : 'application/octet-stream';

    const uploadParams = {
      Bucket,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // Set cache control headers (1 year in seconds)
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
      'INSERT INTO cards (card_id, id, username, email, company, title, phone, instagram, facebook, linkedin, url, profile_image_url, background_image_url, tiktok,spotify,twitter,paypal,vinted,notes,standvirtual,olx,piscapisca,custojusto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?,?,?,?,?,?,?,?);',
      [cardId, userId, name, email, company, position, phone, instagram, facebook, linkedin, url, profilePictureUrl, backgroundImageUrl,tiktok, spotify, twitter, paypal, vinted, notes, standvirtual, olx, piscapisca, custojusto ],
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

router.get("/:id/cards", (req, res, next) => {
  const userId = req.params.id;

  // Send immediate response to the client
  res.status(200).send({ message: "Fetching cards..." });

  // Fetch data asynchronously
  connection.query(`SELECT * FROM cards WHERE id = ?;`, [userId], (err, result) => {
    if (err) {
      console.error('Error fetching cards:', err);
      // Handle the error and send an appropriate response
      return res.status(500).send({ message: 'Internal Server Error' });
    }
    if (!result.length) {
      return res.status(400).send({ message: 'No cards found' });
    }
    console.log(result);
    // Send the fetched data to the client
    return res.status(200).send({
     
      cards: result,
    });
  });
});


export default router;







router.post('/:id/message', (req, res) => {
  const userId = req.params.id;
  const contact_id = Math.floor(Math.random() * 10000) + 1;
  const { name, email, company, message } = req.body;

  // Insert into the contacts table
  connection.query(
    `INSERT INTO contacts (user_id, contact_id, name, company, email, message, contact_date) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [userId, contact_id, name, company, email, message],
    (err, result) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send({ message: 'Error sending contact' });
      }
      console.log('Query executed successfully');

      // Fetch user email from the database
      connection.query(
        `SELECT email, username FROM users WHERE id=?`,
        [userId],
        (err, result) => {
          if (err) {
            return res.status(400).send({ message: err });
          }

          if (!result.length) {
            return res.status(400).send({
              message: 'Email doesn\'t exist',
            });
          }

          const user_email = result[0].email;
          const username = result[0].username;
          // Send email to the user email from the database
          sendEmail(user_email, name,username, email, company, message);

          return res.status(200).send({
            message: 'Message sent.',
            user_email: result,
          });
        }
      );
    }
  );
});

function sendEmail(to, name, username, email, company, message) {
  const transporter = nodemailer.createTransport({
    host: 'smtpout.secureserver.net',
    port: '465',
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: 'no-reply@bravanfc.com',
    to: to,
    subject: `Recebeu uma nova Lead de ${name}`,
    html: `
    <!DOCTYPE html>
    <html lang="pt">
    
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>New Lead Notification</title>
      <link href="https://fonts.googleapis.com/css2?family=Krona+One&display=swap" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Montserrat&display=swap" rel="stylesheet">
      <style>
        /* Add your styles here */
        body {
          margin: 0;
          padding: 0;
          font-family: 'Montserrat', sans-serif;
        }
    
        table {
          width: 100%;
        }
    
        .content-container {
          width: 600px;
          margin: 0 auto;
        }
    
        h1 {
          color: #333;
          font-family: 'Krona One', sans-serif;
        }
    
        h3 {
          color: #555;
        }
    
        .content-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
    
        .content-table td {
          padding: 10px;
          border-bottom: 1px solid #ddd;
          color: #666;
        }
    
        button {
          background-color: #4CAF50;
          border: none;
          color: white;
          padding: 15px 32px;
          text-align: center;
          text-decoration: none;
          display: inline-block;
          font-size: 16px;
          margin-top: 20px;
          cursor: pointer;
          border-radius: 5px;
        }
    
        button:hover {
          background-color: #45a049;
        }
    
        img {
          display: block;
          margin: 0 auto; /* Center the image horizontally */
        }
      </style>
    </head>
    
    <body>
      <table>
        <tr>
          <td align="center">
            <table class="content-container" bgcolor="#ffffff" cellpadding="0" cellspacing="0" align="center"
              style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; border-spacing: 0px; background-color: #ffffff; width: 100%;">
              <tr>
                <td align="left">
                  <img src="https://res.cloudinary.com/dnho57ne8/image/upload/v1699917168/t6fy6tyrusdmynitqh3q.ico" alt="Logo"
                    width="50">
                </td>
              </tr>
              <tr>
                <td align="left">
                  <h1>Olá ${username}, recebeu uma nova lead!</h1>
                </td>
              </tr>
              <tr>
                <td align="left">
                  <h3>Detalhes:</h3>
                  <table class="content-table">
                    <tr>
                      <td><b>Nome:</b></td>
                      <td>${name}</td>
                    </tr>
                    <tr>
                      <td><strong>Empresa:</strong></td>
                      <td>${company}</td>
                    </tr>
                    <tr>
                      <td><b>Email:</b></td>
                      <td>${email}</td>
                    </tr>
                    <tr>
                      <td><strong>Mensagem:</strong></td>
                      <td>${message}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center">
                  <a href="https://app.bravanfc.com/login"><button>Clique aqui para ver</button></a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    
    </html>
    
    `,
};

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Email sending error:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
}

