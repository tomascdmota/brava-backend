
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
import axios from 'axios';
import Apiip from 'apiip.net';
const apiip = Apiip('fa54ad08-d0fe-4dab-b6d0-365c7e42dcff');




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

  // Preprocess username: remove spacing and convert to lowercase
  const processedUsername = username.replace(/\s/g, '').toLowerCase();

  // Check if the username already exists
  connection.query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER(?);',
    [processedUsername], // Use the preprocessed username
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
            [userId, processedUsername, email, phone, hash], // Use the preprocessed username
            (err, result) => {
              if (err) {
                console.error('Error inserting user into the database:', err);
                return res.status(500).json({ message: 'Internal Server Error' });
              }

              // Generate JWT token
              const token = jwt.sign({ userId, username: processedUsername, email }, JWT_SECRET, { expiresIn: '30d' });

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
    `SELECT * FROM users WHERE username = ?;`,
    [req.body.username],
    async (err, result) => {
      try {
        if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ message: 'Internal Server Error' });
        }
        console.log(req.body.username)
        console.log('SQL Query:', `SELECT * FROM users WHERE username = '${req.body.email}';`);
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

  // Query to fetch user data and card profile image URL
  const userDataQuery = `
    SELECT users.username, cards.profile_image_url 
    FROM users 
    LEFT JOIN cards ON users.id = cards.id 
    WHERE users.id = ?;
  `;

  // Query to fetch contacts data
  const contactsQuery = `
    SELECT * FROM contacts WHERE user_id = ?;
  `;

  // Query to fetch lead data (city and country)
  const leadsQuery = `
    SELECT * 
    FROM leads 
    WHERE user_id = ?;
  `;

  // Execute all queries in parallel using Promise.all
  Promise.all([
    // Query to fetch user data and card profile image URL
    new Promise((resolve, reject) => {
      connection.query(userDataQuery, [userId], (error, userDataResult) => {
        if (error) {
          console.error('Error executing user data query:', error);
          reject(error);
        } else {
          resolve(userDataResult.length > 0 ? userDataResult[0] : {
            username: 'No username', // Default username if not found
            profile_image_url: 'default_profile_image_url' // Default profile image URL if not found
          });
        }
      });
    }),
    // Query to fetch contacts data
    new Promise((resolve, reject) => {
      connection.query(contactsQuery, [userId], (error, contactsResult) => {
        if (error) {
          console.error('Error executing contacts query:', error);
          reject(error);
        } else {
          resolve(contactsResult);
        }
      });
    }),
    // Query to fetch lead data (city and country)
    new Promise((resolve, reject) => {
      connection.query(leadsQuery, [userId], (error, leadsResult) => {
        if (error) {
          console.error('Error executing leads query:', error);
          reject(error);
        } else {
          resolve(leadsResult.length > 0 ? leadsResult : {
            city: null, // Default city if not found
            country: null, // Default country if not found
            date:null
          });
        }
      });
    })
  ])
  .then(([userData, contactsData, leadsData]) => {
    // Construct the final response object
    const responseData = {
      userData,
      contactsData,
      leadsData
    };
    // Send the combined data as JSON response
    res.json(responseData);
  })
  .catch(error => {
    console.error('Error:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  });
});


router.get("/:id/contacts", (req,res) => {
  const userId = req.params.id;
  connection.query("SELECT * FROM contacts WHERE user_id = ?", [userId], (error, result) => {
    if (error) {
      return res.status(400).send({ message: error });
    }
    if (!result.length) {
      return res.status(400).send({
        message: 'No Contacts yet',
      });
    }
    console.log('Result',result)
    return res.status(200).send({
      contacts: result,
    });
  })
})







router.post("/createcard", upload.fields([{ name: 'profilePicture', maxCount: 1 }, { name: 'background_image', maxCount: 1 }]), async (req, res) => {
  const { userId, username, email, company, position, phone, instagram, facebook, linkedin, url, tiktok, spotify, twitter, paypal, vinted, notes, standvirtual, olx, piscapisca, custojusto } = req.body;
  const cardId = Math.floor(Math.random() * 1000000);

  // Check if profilePicture and background_image fields exist in req.files
  const hasProfilePicture = req.files && req.files.profilePicture && req.files.profilePicture[0];
  const hasBackgroundImage = req.files && req.files.background_image && req.files.background_image[0];

  // Your S3 upload logic here
  const uploadToS3 = async (file, type) => {
    const s3Key = `${type}_${Date.now().toString()}-${file.originalname}`;// Using uuidv4 to generate a unique key
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
      const profilePictureData = await uploadToS3(profilePictureFile, 'profilePictures'); // Use a folder named profilePictures
      profilePictureUrl = encodeURI(`https://${Bucket}.s3.${region}.amazonaws.com/${profilePictureData.s3Key}`);
    }

    // Upload backgroundImage to S3 if it exists
    if (hasBackgroundImage) {
      const backgroundImageFile = req.files.background_image[0];
      const backgroundImageData = await uploadToS3(backgroundImageFile, 'backgroundImages'); // Use a folder named backgroundImages
      backgroundImageUrl = encodeURI(`https://${Bucket}.s3.${region}.amazonaws.com/${backgroundImageData.s3Key}`);
    }

    // Insert card information into the database
    connection.query(
      'INSERT INTO cards (card_id, id, username, email, company, title, phone, instagram, facebook, linkedin, url, profile_image_url, background_image_url, tiktok,spotify,twitter,paypal,vinted,notes,standvirtual,olx,piscapisca,custojusto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?,?,?,?,?,?,?,?);',
      [cardId, userId, username, email, company, position, phone, instagram, facebook, linkedin, url, profilePictureUrl, backgroundImageUrl, tiktok, spotify, twitter, paypal, vinted, notes, standvirtual, olx, piscapisca, custojusto],
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




router.put("/updatecard/:id/:cardId", upload.fields([{ name: 'profilePicture', maxCount: 1 }, { name: 'background_image', maxCount: 1 }]), async (req, res) => {
  const { id, cardId } = req.params;
  const { userId, username, email, company, position, phone, instagram, facebook, linkedin, url, tiktok, spotify, twitter, paypal, vinted, notes, standvirtual, olx, piscapisca, custojusto, address } = req.body;

  // Check if profilePicture and background_image fields exist in req.files
  const hasProfilePicture = req.files && req.files.profilePicture && req.files.profilePicture[0];
  const hasBackgroundImage = req.files && req.files.background_image && req.files.background_image[0];

  // Your S3 upload logic here
  const uploadToS3 = async (file, type) => {
    const s3Key = `${type}_${Date.now().toString()}-${file.originalname}`;// Using uuidv4 to generate a unique key
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
      const profilePictureData = await uploadToS3(profilePictureFile, 'profilePictures');
      profilePictureUrl = encodeURI(`https://${Bucket}.s3.${region}.amazonaws.com/${profilePictureData.s3Key}`);
    }

    // Upload backgroundImage to S3 if it exists
    if (hasBackgroundImage) {
      const backgroundImageFile = req.files.background_image[0];
      const backgroundImageData = await uploadToS3(backgroundImageFile, 'backgroundImages');
      backgroundImageUrl = encodeURI(`https://${Bucket}.s3.${region}.amazonaws.com/${backgroundImageData.s3Key}`);
    }

    // Construct the update query based on the fields that were changed
    const updateFields = [];
    const updateValues = [];

    if (username) {
      updateFields.push('username');
      updateValues.push(username);
    }
    if (email) {
      updateFields.push('email');
      updateValues.push(email);
    }
    if (company) {
      updateFields.push('company');
      updateValues.push(company);
    }
    if (position) {
      updateFields.push('title');
      updateValues.push(position);
    }
    if (phone) {
      updateFields.push('phone');
      updateValues.push(phone);
    }
    if (instagram) {
      updateFields.push('instagram');
      updateValues.push(instagram);
    }
    if (facebook) {
      updateFields.push('facebook');
      updateValues.push(facebook);
    }
    if (linkedin) {
      updateFields.push('linkedin');
      updateValues.push(linkedin);
    }
    if (url) {
      updateFields.push('url');
      updateValues.push(url);
    }
    if (tiktok) {
      updateFields.push('tiktok');
      updateValues.push(tiktok);
    }
    if (spotify) {
      updateFields.push('spotify');
      updateValues.push(spotify);
    }
    if (twitter) {
      updateFields.push('twitter');
      updateValues.push(twitter);
    }
    if (paypal) {
      updateFields.push('paypal');
      updateValues.push(paypal);
    }
    if (vinted) {
      updateFields.push('vinted');
      updateValues.push(vinted);
    }
    if (notes) {
      updateFields.push('notes');
      updateValues.push(notes);
    }
    if (standvirtual) {
      updateFields.push('standvirtual');
      updateValues.push(standvirtual);
    }
    if (olx) {
      updateFields.push('olx');
      updateValues.push(olx);
    }
    if (piscapisca) {
      updateFields.push('piscapisca');
      updateValues.push(piscapisca);
    }
    if (custojusto) {
      updateFields.push('custojusto');
      updateValues.push(custojusto);
    }
    if (address) {
      updateFields.push('address');
      updateValues.push(address);
    }

    console.log(updateValues)
    // Execute the update query
    connection.query(
      `UPDATE cards SET ${updateFields.map(field => `${field} = ?`).join(', ')} WHERE card_id = ? `,
      [...updateValues, cardId],
      (err, result) => {
        if (err) {
          console.error("Error updating card in database:", err);
          return res.status(500).json({ message: "Internal server error" });
        }

        res.status(200).json({ message: "Card updated successfully", cardId, userId });
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


 // Import Axios library for making HTTP requests
 router.get("/:id/cards", async (req, res, next) => {
  const userId = req.params.id;
  const ipAddress = req.ip; // Get client's IP address

  try {
    // Use apiip library to get location information
    const location = await apiip.getLocation({
      ip: '89.115.109.26',
      output: 'json',
      fields: 'city, regionName, countryName',
    });

    
    // Extract city and country from the location object
    const city = location.city;
    const country = location.countryName;
    // Generate a short UUID
    const linkId = Math.floor(Math.random() * 532164);

    // Insert a new row into the leads table with location and access date
    const accessDate = new Date(); // Current date and time
    const leadData = {
      link_id: linkId, // Use the generated short UUID as link_id
      user_id: userId,
      access_date: accessDate,
      city: city, // Insert city into the city column
      country: country // Insert country into the country column
    };
    // Insert lead data into the leads table
    const insertResult = await new Promise((resolve, reject) => {
      connection.query(`INSERT INTO leads SET ?`, leadData, (insertErr, insertResult) => {
        if (insertErr) {
          console.error('Error inserting lead:', insertErr);
          reject(insertErr);
        } else {
          resolve(insertResult);
        }
      });
    });

    // Fetch the user's cards
    const result = await new Promise((resolve, reject) => {
      connection.query(`SELECT * FROM cards WHERE id = ?;`, [userId], (fetchErr, result) => {
        if (fetchErr) {
          console.error('Error fetching cards:', fetchErr);
          reject(fetchErr);
        } else {
          resolve(result);
        }
      });
    });

    if (!result.length) {
      return res.status(400).send({ message: 'No cards found' });
    }

    // Send the fetched data to the client
    return res.status(200).send({
      cards: result,
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).send({ message: 'Internal Server Error' });
  }
});


export default router;





router.post('/:id/message', (req, res) => {
  const userId = req.params.id;
  const contact_id = Math.floor(Math.random() * 123235) + 1;
  const { name, email, company,sector, phone, message, terms } = req.body;

  // Insert into the contacts table
  connection.query(
    `INSERT INTO contacts (user_id, contact_id, name, company, email, phone, sector, message, contact_date, terms_agreed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
    [userId, contact_id, name, company, email, phone, sector, message, terms],
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
          sendEmail(user_email, name,username, email, company,sector, phone, message);

          return res.status(200).send({
            message: 'Message sent.',
            user_email: result,
          });
        }
      );
    }
  );
});

function sendEmail(to, name, username, email, company,sector, phone,message) {
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
                      <td><strong>Telemovel:</strong></td>
                      <td>${phone}</td>
                    </tr>
                    <tr>
                      <td><strong>Empresa:</strong></td>
                      <td>${company}</td>
                    </tr>
                    <tr>
                      <td><strong>Setor:</strong></td>
                      <td>${sector}</td>
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

