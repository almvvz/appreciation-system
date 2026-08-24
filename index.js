import "dotenv/config";
import morgan from "morgan";
import express from "express";
import bcrypt from "bcrypt";
import db from "./db.js";
import session from "express-session";

const app = express();
const port = 3000;

const categoryRates = {
    study: 1,
    sports: 1,
    music: 1,
    creativity: 0.75,
    health: 0.75,
    selfcare: 0.5,
    chores: 0.5,
    growth: 0.5
};

app.set("view engine", "ejs");

app.use(morgan("dev"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: "some-secret-string",
    resave: false,
    saveUninitialized: false,
}));

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.redirect("/login");
    }
    next();
}

app.get("/", requireLogin, (req, res) => {
    res.redirect("/log");
});

app.get("/log", requireLogin, async (req, res) => {
    const userId = req.session.userId;
    const totalResult = await db.query(
        "SELECT COALESCE(SUM(points_earned), 0) AS total FROM entries WHERE user_id = $1",
        [userId]
    );
    const recentResult = await db.query(
        "SELECT * FROM entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3",
        [userId]
    );
    res.render("log", {
        username: req.session.username,
        total: totalResult.rows[0].total,
        recent: recentResult.rows,
        justLogged: req.query.success === "1",
        active: "log"
    });
});

app.get("/history", requireLogin, async (req, res) => {
    const userId = req.session.userId;
    const totalResult = await db.query(
        "SELECT COALESCE(SUM(points_earned), 0) AS total FROM entries WHERE user_id = $1",
        [userId]
    );
    const entriesResult = await db.query(
        "SELECT * FROM entries WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
    );
    res.render("history", {
        username: req.session.username,
        total: totalResult.rows[0].total,
        entries: entriesResult.rows,
        active: "history"
    });
});

app.get("/shop", requireLogin, async (req, res) => {
    const userId = req.session.userId;
    const totalResult = await db.query(
        "SELECT COALESCE(SUM(points_earned), 0) AS total FROM entries WHERE user_id = $1",
        [userId]
    );
    const rewardsResult = await db.query("SELECT * FROM rewards ORDER BY point_cost ASC");
    res.render("shop", {
        username: req.session.username,
        total: totalResult.rows[0].total,
        rewards: rewardsResult.rows,
        justBought: req.query.success === "1",
        active: "shop"
    });
});

app.get("/register", (req, res) => {
    res.render("register");
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", async (req, res) => {
    const username = req.body["username"];
    const password = req.body["password"];
    const result = await db.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];

    if (!user) {
        return res.send("Invalid login!");
    }

    if (await bcrypt.compare(password, user.password_hash)) {
        req.session.userId = user.id;
        req.session.username = user.username;
        res.redirect("/");
    } else {
        res.send("Invalid login!");
    }
});

app.post("/register", async (req, res) => {
    const username = req.body["username"];
    const password = req.body["password"];

    const hash = await bcrypt.hash(password, 10);

    await db.query(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
        [username, hash]
    );

    res.redirect("/login");
});

app.post("/entries", requireLogin, async (req, res) => {
    const diary_text = req.body["diary_text"];
    const category = req.body["category"];
    const duration_minutes = req.body["duration_minutes"];
    const userId = req.session.userId;


    const rate = categoryRates[category] || 1;
    const points = Math.floor((duration_minutes / 15) * rate);

    await db.query(
        "INSERT INTO entries (user_id, diary_text, category, duration_minutes, points_earned) VALUES ($1, $2, $3, $4, $5)",
        [userId, diary_text, category, duration_minutes, points]
    );

    res.redirect("/log?success=1");
});

app.post("/redeem", requireLogin, async (req, res) => {
    const rewardId = req.body["reward_id"];
    const userId = req.session.userId;

    const totalResult = await db.query(
        "SELECT COALESCE(SUM(points_earned), 0) AS total FROM entries WHERE user_id = $1",
        [userId]
    );
    const total = totalResult.rows[0].total;

    const rewardResult = await db.query("SELECT * FROM rewards WHERE id = $1", [rewardId]);
    const reward = rewardResult.rows[0];

    if (total >= reward.point_cost) {
        await db.query(
            "INSERT INTO redemptions (user_id, reward_id) VALUES ($1, $2)",
            [userId, rewardId]
        );

        await db.query(
            "INSERT INTO entries (user_id, diary_text, category, duration_minutes, points_earned) VALUES ($1, $2, $3, $4, $5)",
            [userId, `Redeemed: ${reward.name}`, "redemption", 0, -reward.point_cost]
        );

        res.redirect("/shop?success=1");
    } else {
        res.send("Not enough points!");
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

app.listen(port, () => {
    console.log(`Listening to port: ${port}`);
});