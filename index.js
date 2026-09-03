const express = require('express');
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const { MongoClient, ObjectId } = require("mongodb");
const app = express()
const port = process.env.PORT || 5365

app.use(cors());
app.use(express.json());

const JWKS = createRemoteJWKSet(
    new URL(`${process.env.FRONTEND_URL}/api/auth/jwks`)
)

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({
            message: "Unauthorized access"
        });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).send({
            message: "Unauthorized access"
        });
    }

    try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload;
        next()
    } catch (error) {
        return res.status(403).json({
            message: "Forbidden"
        });
    }
}

app.get('/', (req, res) => {

    res.send('Srever runing fine!')
})

const client = new MongoClient(process.env.MONGODB_URI);
async function connectToMongoDB() {
    try {
        await client.connect();

        app.post("/lessons", verifyToken, async (req, res) => {
            const db = client.db("ledgerlydb")
            const lessonsCollection = db.collection("lessons")

            const lessonData = req.body

            const newLesson = {
                ...lessonData,
                creatorEmail: req.user.email,
                creatorName: req.user.name,
                creatorImage: req.user.image,
                likes: [],
                savesCount: 0,
                isFeatured: false,
                isReviewed: false,
                createdAt: new Date(),
                updatedAt: new Date()
            }

            const result = await lessonsCollection.insertOne(newLesson)
            if (!result.acknowledged) {
                return res.status(500).send({
                    success: false,
                    message: "Failed to create lesson"
                })
            }

            res.status(201).send({
                success: true,
                message: "Lesson created successfully",
                lessonId: result.insertedId
            })
        })

        app.get("/lessons", async (req, res) => {
            const db = client.db("ledgerlydb")
            const lessonsCollection = db.collection("lessons")

            const requestedPage = req.query.page
            const requestedLimit = req.query.limit

            const search = req.query.search || ""
            const category = req.query.category || ""
            const tone = req.query.tone || ""

            const searchQuery = { visibility: "Public" }

            if (search) {
                searchQuery.title = {
                    $regex: search,
                    $options: "i"
                }
            }
            if (category) {
                searchQuery.category = {
                    $regex: category,
                    $options: "i"
                }
            }
            if (tone) {
                searchQuery.emotionalTone = {
                    $regex: tone,
                    $options: "i"
                }
            }

            const page = Math.max(parseInt(requestedPage) || 1, 1);
            const limit = Math.min(Math.max(parseInt(requestedLimit) || 9, 1), 30);
            const skip = (page - 1) * limit

            const sort = req.query.sort
            let sortQuery = { createdAt: -1 };
            if (sort == "mostSaved") {
                sortQuery = { savesCount: -1 };
            }

            const totalLessons = await lessonsCollection.countDocuments(searchQuery);
            const totalPages = Math.ceil(totalLessons / limit);

            const lessons = await lessonsCollection.find(searchQuery).sort(sortQuery).skip(skip).limit(limit).toArray();

            res.send({
                lessons,
                pagination: {
                    currentPage: page,
                    limit,
                    totalLessons,
                    totalPages,
                    nextPageStatus: page < totalPages,
                    previousPageStatus: page > 1
                }
            });
        })

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