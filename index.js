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
        // await client.connect();

        app.post("/lessons", verifyToken, async (req, res) => {
            const db = client.db("ledgerlydb")
            const lessonsCollection = db.collection("lessons")

            const lessonData = req.body
            // console.log("lessonData:", lessonData);

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

        app.get("/my-lessons", verifyToken, async (req, res) => {
            const db = client.db("ledgerlydb")
            const lessonsCollection = db.collection("lessons")

            const myLessons = await lessonsCollection.find({ creatorEmail: req.user.email }).sort({ createdAt: -1 }).toArray()
            // console.log("myLessons count:", myLessons.length);

            res.send({ lessons: myLessons })
        })

        app.patch("/users/upgrade", verifyToken, async (req, res) => {
            const db = client.db("ledgerlydb")
            const userCollection = db.collection("user")

            const result = await userCollection.updateOne(
                { email: req.user.email },
                { $set: { isPremium: true } }
            )
            // console.log("upgrade result:", result);

            res.send({
                success: true,
                message: "Account upgraded to Premium"
            })
        })

        app.get("/admin/stats", verifyToken, async (req, res) => {
            if (req.user.role !== "admin") {
                return res.status(403).send({
                    success: false,
                    message: "Admins only"
                })
            }

            const db = client.db("ledgerlydb")
            const userCollection = db.collection("user")
            const lessonsCollection = db.collection("lessons")

            const totalUsers = await userCollection.countDocuments()
            const premiumUsers = await userCollection.countDocuments({ isPremium: true })
            const totalLessons = await lessonsCollection.countDocuments()
            const publicLessons = await lessonsCollection.countDocuments({ visibility: "Public" })

            const recentUsers = await userCollection.find({}, {
                projection: { name: 1, email: 1, image: 1, role: 1, isPremium: 1, createdAt: 1 }
            }).sort({ createdAt: -1 }).limit(5).toArray()
            // console.log("recentUsers:", recentUsers);

            res.send({
                totalUsers,
                premiumUsers,
                totalLessons,
                publicLessons,
                recentUsers
            })
        })

        app.get("/admin/users", verifyToken, async (req, res) => {
            if (req.user.role !== "admin") {
                return res.status(403).send({
                    success: false,
                    message: "Admins only"
                })
            }

            const db = client.db("ledgerlydb")
            const userCollection = db.collection("user")

            const users = await userCollection.find({}, {
                projection: { name: 1, email: 1, image: 1, role: 1, isPremium: 1, createdAt: 1 }
            }).sort({ createdAt: -1 }).toArray()

            res.send({ users })
        })

        app.patch("/admin/users/:id/premium", verifyToken, async (req, res) => {
            if (req.user.role !== "admin") {
                return res.status(403).send({
                    success: false,
                    message: "Admins only"
                })
            }

            const { id } = req.params
            const { isPremium } = req.body
            const db = client.db("ledgerlydb")
            const userCollection = db.collection("user")

            const result = await userCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { isPremium: isPremium } }
            )
            // console.log("manual premium update result:", result);

            res.send({
                success: true,
                message: isPremium ? "User upgraded to Premium" : "User downgraded to Free"
            })
        })

        app.get("/favorites", verifyToken, async (req, res) => {
            const db = client.db("ledgerlydb")
            const favoritesCollection = db.collection("favorites")
            const lessonsCollection = db.collection("lessons")

            const myFavorites = await favoritesCollection.find({ userEmail: req.user.email }).toArray()
            const lessonIds = myFavorites.map((fav) => new ObjectId(fav.lessonId))
            console.log("favorited lesson ids:", lessonIds);

            const lessons = await lessonsCollection.find({ _id: { $in: lessonIds } }).toArray()

            res.send({ lessons })
        })

        app.patch("/lessons/:id/like", verifyToken, async (req, res) => {
            const { id } = req.params
            const db = client.db("ledgerlydb")
            const lessonsCollection = db.collection("lessons")

            const lesson = await lessonsCollection.findOne({ _id: new ObjectId(id) })
            if (!lesson) {
                return res.status(404).send({
                    success: false,
                    message: "Lesson not found"
                })
            }

            const userEmail = req.user.email
            const alreadyLiked = lesson.likes?.includes(userEmail)
            // console.log("alreadyLiked:", alreadyLiked);

            const update = alreadyLiked
                ? { $pull: { likes: userEmail } }
                : { $addToSet: { likes: userEmail } }

            await lessonsCollection.updateOne({ _id: new ObjectId(id) }, update)

            res.send({
                success: true,
                liked: !alreadyLiked
            })
        })

        app.patch("/lessons/:id/favorite", verifyToken, async (req, res) => {
            const { id } = req.params
            const db = client.db("ledgerlydb")
            const lessonsCollection = db.collection("lessons")
            const favoritesCollection = db.collection("favorites")

            const userEmail = req.user.email

            const existingFavorite = await favoritesCollection.findOne({ userEmail, lessonId: id })
            // console.log("existingFavorite:", existingFavorite);

            if (existingFavorite) {
                await favoritesCollection.deleteOne({ userEmail, lessonId: id })
                await lessonsCollection.updateOne({ _id: new ObjectId(id) }, { $inc: { savesCount: -1 } })
                return res.send({ success: true, favorited: false })
            }

            await favoritesCollection.insertOne({ userEmail, lessonId: id, createdAt: new Date() })
            await lessonsCollection.updateOne({ _id: new ObjectId(id) }, { $inc: { savesCount: 1 } })
            res.send({ success: true, favorited: true })
        })

        app.get("/lessons/:id", verifyToken, async (req, res) => {
            const { id } = req.params
            const db = client.db("ledgerlydb")
            const lessonsCollection = db.collection("lessons")
            const favoritesCollection = db.collection("favorites")

            const lesson = await lessonsCollection.findOne({ _id: new ObjectId(id) })
            if (!lesson) {
                return res.status(404).send({
                    success: false,
                    message: "Lesson not found"
                })
            }

            const isOwner = lesson.creatorEmail === req.user.email
            const isAdmin = req.user.role === "admin"

            // private lesson, only owner/admin can view
            if (lesson.visibility === "Private" && !isOwner && !isAdmin) {
                return res.status(403).send({
                    success: false,
                    message: "This lesson is private"
                })
            }

            // premium lesson, free user gets a locked preview only
            if (lesson.accessLevel === "Premium" && !req.user.isPremium && !isOwner && !isAdmin) {
                return res.send({
                    locked: true,
                    _id: lesson._id,
                    title: lesson.title,
                    category: lesson.category,
                    emotionalTone: lesson.emotionalTone,
                    creatorName: lesson.creatorName,
                    creatorImage: lesson.creatorImage,
                    accessLevel: lesson.accessLevel,
                    createdAt: lesson.createdAt
                })
            }

            const existingFavorite = await favoritesCollection.findOne({ userEmail: req.user.email, lessonId: id })

            res.send({ locked: false, isFavorited: !!existingFavorite, ...lesson })
        })

        app.patch("/lessons/:id", verifyToken, async (req, res) => {
            const { id } = req.params
            const db = client.db("ledgerlydb")
            const lessonsCollection = db.collection("lessons")

            const lesson = await lessonsCollection.findOne({ _id: new ObjectId(id) })
            if (!lesson) {
                return res.status(404).send({
                    success: false,
                    message: "Lesson not found"
                })
            }

            const isOwner = lesson.creatorEmail === req.user.email
            const isAdmin = req.user.role === "admin"
            if (!isOwner && !isAdmin) {
                return res.status(403).send({
                    success: false,
                    message: "You are not allowed to update this lesson"
                })
            }

            const updateData = req.body
            // console.log("updateData:", updateData);
            delete updateData._id

            const result = await lessonsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { ...updateData, updatedAt: new Date() } }
            )

            res.send({
                success: true,
                message: "Lesson updated successfully",
                modifiedCount: result.modifiedCount
            })
        })

        app.delete("/lessons/:id", verifyToken, async (req, res) => {
            const { id } = req.params
            const db = client.db("ledgerlydb")
            const lessonsCollection = db.collection("lessons")

            const lesson = await lessonsCollection.findOne({ _id: new ObjectId(id) })
            if (!lesson) {
                return res.status(404).send({
                    success: false,
                    message: "Lesson not found"
                })
            }

            const isOwner = lesson.creatorEmail === req.user.email
            const isAdmin = req.user.role === "admin"
            if (!isOwner && !isAdmin) {
                return res.status(403).send({
                    success: false,
                    message: "You are not allowed to delete this lesson"
                })
            }

            const result = await lessonsCollection.deleteOne({ _id: new ObjectId(id) })

            res.send({
                success: true,
                message: "Lesson deleted successfully",
                deletedCount: result.deletedCount
            })
        })

        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}

connectToMongoDB()

//  have to remove comment out
module.exports = app;

// app.listen(port, () => {
//     console.log(`app listening on port ${port}`)
// })