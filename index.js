import express from 'express';
import * as dotenv from 'dotenv';
dotenv.config();

// Init the app
const app = express();
const port = process.env.PORT || 1337;

app.use(express.json());


// Home directory
app.get("/", (req, res) => res.send(`
  <html>
    <head><title>Main page</title></head>
    <body>
      <h1>This is your home directory</h1>
      <p>Modify the html to give info to your clients</p>
    </body>
  </html>
`));

// You can personalize this route or copy this snippet to establish more webhooks
app.post("/webhook", (req, res) => {
  console.log(req);
  res.sendStatus(200)
})

// You can personalize this route or copy this snippet to establish more webhooks
app.post("/another-webhook", (req, res) => {
  console.log(req);
  res.sendStatus(200)
})


// Sets server port and logs message on success
app.listen(port, () => console.log(`webhook is listening at http://localhost:${port}/webhook`))

