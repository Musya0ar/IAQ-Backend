const express = require("express");
const AWS = require("aws-sdk");
const serverless = require("serverless-http");
const getRawBody = require("raw-body");
const cors = require("cors");
const { Parser } = require("json2csv"); // install this later

const app = express();
app.use(cors());

// ✅ Raw body parser for Lambda httpApi JSON quirk
app.use(async (req, res, next) => {
  if (!req.headers["content-type"]?.includes("application/json")) return next();

  try {
    const raw = await getRawBody(req);
    req.body = JSON.parse(raw.toString("utf8"));
    next();
  } catch (err) {
    console.error("Failed to parse raw body:", err);
    res.status(400).json({ error: "Invalid JSON" });
  }
});

const dynamo = new AWS.DynamoDB.DocumentClient({ region: "ap-southeast-2" });
const TABLE_NAME = "IAQData";

// ✅ POST /iaq — for structured PM2.5 and CO2
app.post("/iaq", async (req, res) => {
  const { pm25, co2 } = req.body;

  if (pm25 === undefined || co2 === undefined) {
    return res.status(400).json({ error: "Missing fields", body: req.body });
  }

  const item = {
    id: Date.now().toString(),
    type: "structured",
    pm25,
    co2,
    timestamp: new Date().toISOString(),
  };

  try {
    await dynamo.put({ TableName: TABLE_NAME, Item: item }).promise();
    res.json({ message: "Data saved", data: item });
  } catch (err) {
    console.error("DynamoDB Error:", err);
    res.status(500).json({ error: "Error saving data" });
  }
});

// ✅ POST /rawlog — Arduino CSV-style logs
app.post("/rawlog", async (req, res) => {
  const { log } = req.body;

  if (!log) {
    return res.status(400).json({ error: "Missing log field" });
  }

  const parts = log.split(",");
  if (parts.length !== 11) {
    return res.status(400).json({ error: "Log must contain 11 comma-separated values" });
  }

  const [
    timestamp,
    temp,
    press,
    humid,
    gas,
    alt,
    R0,
    correctedRZero,
    resistance,
    ppm,
    correctedPPM,
  ] = parts;

  const item = {
    id: Date.now().toString(),
    type: "raw",
    timestamp,
    temperature: parseFloat(temp),
    pressure: parseFloat(press),
    humidity: parseFloat(humid),
    gas: parseFloat(gas),
    altitude: parseFloat(alt),
    R0: parseFloat(R0),
    correctedRZero: parseFloat(correctedRZero),
    resistance: parseFloat(resistance),
    ppm: parseFloat(ppm),
    correctedPPM: parseFloat(correctedPPM),
  };

  try {
    await dynamo.put({ TableName: TABLE_NAME, Item: item }).promise();
    res.json({ message: "Raw log saved", data: item });
  } catch (err) {
    console.error("DynamoDB Error:", err);
    res.status(500).json({ error: "Failed to save raw log" });
  }
});

// ✅ GET /iaq — retrieve structured data
app.get("/iaq", async (req, res) => {
  const params = {
    TableName: TABLE_NAME,
    FilterExpression: "#type = :type",
    ExpressionAttributeNames: {
      "#type": "type",
    },
    ExpressionAttributeValues: {
      ":type": "structured",
    },
    Limit: 20,
  };

  try {
    const result = await dynamo.scan(params).promise();
    res.json(result.Items);
  } catch (err) {
    console.error("Scan error:", err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// ✅ GET /rawlog — retrieve raw data
app.get("/rawlog", async (req, res) => {
  const params = {
    TableName: TABLE_NAME,
    FilterExpression: "#type = :type",
    ExpressionAttributeNames: {
      "#type": "type",
    },
    ExpressionAttributeValues: {
      ":type": "raw",
    },
    Limit: 20,
  };

  try {
    const result = await dynamo.scan(params).promise();
    res.json(result.Items);
  } catch (err) {
    console.error("Scan error:", err);
    res.status(500).json({ error: "Failed to fetch raw logs" });
  }
});

app.get("/iaq/csv", async (req, res) => {
  const params = {
    TableName: TABLE_NAME,
    FilterExpression: "#type = :type",
    ExpressionAttributeNames: { "#type": "type" },
    ExpressionAttributeValues: { ":type": "structured" },
    Limit: 100,
  };

  try {
    const result = await dynamo.scan(params).promise();
    const fields = ["id", "timestamp", "pm25", "co2"];
    const parser = new Parser({ fields });
    const csv = parser.parse(result.Items);

    res.header("Content-Type", "text/csv");
    res.attachment("iaq_data.csv");
    res.send(csv);
  } catch (err) {
    console.error("CSV export error:", err);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});

// ✅ CSV export for /rawlog
app.get("/rawlog/csv", async (req, res) => {
  const params = {
    TableName: TABLE_NAME,
    FilterExpression: "#type = :type",
    ExpressionAttributeNames: { "#type": "type" },
    ExpressionAttributeValues: { ":type": "raw" },
    Limit: 100,
  };

  try {
    const result = await dynamo.scan(params).promise();
    const fields = [
      "id", "timestamp", "temperature", "pressure", "humidity", "gas", "altitude",
      "R0", "correctedRZero", "resistance", "ppm", "correctedPPM"
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(result.Items);

    res.header("Content-Type", "text/csv");
    res.attachment("rawlog_data.csv");
    res.send(csv);
  } catch (err) {
    console.error("CSV export error:", err);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});
module.exports.handler = serverless(app);
