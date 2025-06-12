require('dotenv').config();
const express = require('express');
const cors = require('cors');
const os = require('os');
const { InfluxDB } = require('@influxdata/influxdb-client');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

const influxDB = new InfluxDB({
  url: process.env.INFLUX_URL,
  token: process.env.INFLUX_TOKEN,
});
const queryApi = influxDB.getQueryApi(process.env.INFLUX_ORG);

const SENSOR_FIELDS = [
  "TGS2602", "H", "MQ138", "MQ2", "T",
  "TGS2600", "TGS2603", "TGS2610",
  "TGS2620", "TGS2611", "TGS822"
];

app.get('/sensor-data', async (req, res) => {
  console.log("📡 Hit /sensor-data");

  const fluxQuery = `
    from(bucket: "${process.env.INFLUX_BUCKET}")
      |> range(start: -5m)
      |> filter(fn: (r) => r._measurement == "wifi_status")
      |> filter(fn: (r) => ${SENSOR_FIELDS.map(f => `r._field == "${f}"`).join(" or ")})
      |> keep(columns: ["_time", "_field", "_value"])
      |> sort(columns: ["_time"], desc: false)
  `;

  try {
    const rows = await queryApi.collectRows(fluxQuery);

    const grouped = {};
    rows.forEach(row => {
      const time = row._time;
      if (!grouped[time]) {
        grouped[time] = { time };
      }
      grouped[time][row._field] = row._value;
    });

    const finalData = Object.values(grouped);
    console.log(`✅ Fetched and grouped ${finalData.length} records.`);
    res.json(finalData);
  } catch (error) {
    console.error("❌ Server error:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const config of iface) {
      if (config.family === 'IPv4' && !config.internal) {
        return config.address;
      }
    }
  }
  return 'localhost';
}

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://${getLocalIP()}:${port}`);
});
