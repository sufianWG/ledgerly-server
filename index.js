const express = require('express');
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const app = express()
const port = process.env.PORT || 5365

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {

    res.send('Srever runing fine!')
})

const client = new MongoClient(process.env.MONGODB_URI);
async function connectToMongoDB() {
    try {
        await client.connect();            
            // tutor data get
        const db = client.db("ledgerlydb")
        
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}

connectToMongoDB()

app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})