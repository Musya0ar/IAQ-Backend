// index.js
const express = require("express");
const AWS = require("aws-sdk");

const app = express();
app.use(express.json());

const dynamo = new AWS.DynamoDB.DocumentClient({
  region: "ap-southeast-1", // replace with your region
});

app.post("/iaq", async (req, res) => {
  const { pm25, co2 } = req.body;

  if (!pm25 || !co2) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const params = {
    TableName: "IAQData",
    Item: {
      id: Date.now().toString(),
      pm25,
      co2,
      timestamp: new Date().toISOString(),
    },
  };

  try {
    await dynamo.put(params).promise();
    res.json({ message: "Data saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error saving data" });
  }
});

module.exports.handler = require("serverless-http")(app);
