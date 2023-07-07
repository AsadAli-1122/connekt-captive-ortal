import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import bodyParser from "body-parser";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, set } from "firebase/database";
import useragent from "express-useragent";
import ngrok from "ngrok";
import os from "os";
import macaddress from "macaddress";
import axios from "axios";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(useragent.express());

// Firebase initialize
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

// Twilio
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Retrieve public IP address
async function getPublicIpAddress() {
  try {
    const response = await axios.get("https://api.ipify.org?format=json");
    return response.data.ip;
  } catch (error) {
    console.error("Error retrieving public IP address:", error);
    throw error;
  }
}

// Start ngrok to create a tunnel
ngrok
  .connect(port)
  .then(async (url) => {
    console.log(`Server is running on ${url}`);

    // Send OTP by Twilio
    app.post("/send-otp", (req, res) => {
      const { number, code } = req.body;

      client.messages
        .create({
          body: `Your verification code is: ${code}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: `+${number}`,
        })
        .then((message) => {
          console.log(message.sid);
          res.sendStatus(200); // Sending 200 OK status to indicate success
        })
        .catch((error) => {
          console.log("Error sending SMS:", error);
          res.sendStatus(500); // Sending 500 Internal Server Error status to indicate failure
        });
    });

    // Store Data in Firebase Realtime Database
    app.post("/store-data", async (req, res) => {
      const { name, number } = req.body;

      // Retrieve public IP address
      const ipAddress = await getPublicIpAddress();

      // Get MAC address
      macaddress.one((err, macAddress) => {
        if (err) {
          console.error("Error retrieving MAC address:", err);
          macAddress = "Unknown";
        }

        // Get device name
        const deviceName = os.hostname();

        try {
          // Generate a unique key for the data
          const newDataKey = push(ref(database)).key;

          // Create the data object
          const date = new Date();
          const formattedTime = `${date.getHours()}:${date.getMinutes()} ${date.getDate()}-${
            date.getMonth() + 1
          }-${date.getFullYear()}`;

          // Create the data object
          const newData = {
            id: newDataKey,
            name: name,
            number: `+${number}`,
            macAddress: macAddress,
            deviceName: deviceName,
            ipAddress: ipAddress,
            time: formattedTime,
          };

          // Store the data in the Firebase Realtime Database
          set(ref(database, `users/${newDataKey}`), newData)
            .then(() => {
              console.log("Data stored in Firebase Realtime Database");
              res.sendStatus(200); // Sending 200 OK status to indicate success
            })
            .catch((error) => {
              console.error(
                "Error storing data in Firebase Realtime Database:",
                error
              );
              res.sendStatus(500); // Sending 500 Internal Server Error status to indicate failure
            });
        } catch (error) {
          console.error("Error retrieving public IP address:", error);
          res.sendStatus(500); // Sending 500 Internal Server Error status to indicate failure
        }
      });
    });

    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Error starting ngrok:", error);
  });
