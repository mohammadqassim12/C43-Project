const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const path = require("path");
const session = require("express-session");
const { JSDOM } = require("jsdom");
const { Chart } = require("chart.js");

const app = express();
const pool = new Pool({
  user: "postgres",
  host: "34.170.251.68",
  database: "mydb",
  password: "admin",
  port: 5432,
});
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
  })
);

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/register", (req, res) => {
  res.render("register");
});

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  await pool.query(
    "INSERT INTO Users (name, email, password) VALUES ($1, $2, $3)",
    [name, email, password]
  );
  res.redirect("/");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query(
    "SELECT * FROM Users WHERE email = $1 AND password = $2",
    [email, password]
  );
  const user = result.rows[0];

  if (user) {
    req.session.userId = user.userid;
    req.session.userName = user.name;
    res.redirect("/dashboard");
  } else {
    res.redirect("/login");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/dashboard", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    try {
      const userResult = await pool.query(
        "SELECT * FROM Users WHERE userID = $1",
        [req.session.userId]
      );
      const user = userResult.rows[0];

      const portfoliosResult = await pool.query(
        "SELECT * FROM Portfolios WHERE userID = $1",
        [req.session.userId]
      );
      const portfolios = portfoliosResult.rows;

      for (let portfolio of portfolios) {
        const stockListsResult = await pool.query(
          "SELECT * FROM Includes WHERE portfolioID = $1",
          [portfolio.portfolioid]
        );
        portfolio.stockLists = stockListsResult.rows;

        let totalValue = parseFloat(portfolio.cashamount);

        for (let stockList of portfolio.stockLists) {
          const stocksResult = await pool.query(
            `SELECT c.code, c.shares, s.close
                         FROM Contains c
                         JOIN Stocks s ON c.code = s.code
                         WHERE c.listName = $1
                         ORDER BY s.timestamp DESC
                         LIMIT 1`,
            [stockList.listname]
          );

          for (let stock of stocksResult.rows) {
            totalValue += parseFloat(stock.close) * parseFloat(stock.shares);
          }
        }

        portfolio.currentValue = totalValue;
      }

      res.render("dashboard", { user, portfolios });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.get("/add_stock", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    try {
      const stockCodesResult = await pool.query(
        "SELECT DISTINCT code FROM Stocks"
      );
      const stockCodes = stockCodesResult.rows.map((row) => row.code);
      res.render("add_stock", { stockCodes });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.post("/add_stock", async (req, res) => {
  const { code, newCode, timestamp, open, high, low, close, volume } = req.body;
  const stockCode = code === "new" ? newCode : code;
  try {
    await pool.query(
      "INSERT INTO Stocks (code, timestamp, open, high, low, close, volume) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [stockCode, timestamp, open, high, low, close, volume]
    );
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/view_stocks", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const result = await pool.query("SELECT * FROM Stocks LIMIT $1 OFFSET $2", [
      limit,
      offset,
    ]);
    const total = await pool.query("SELECT COUNT(*) FROM Stocks");
    const totalPages = Math.ceil(total.rows[0].count / limit);

    res.render("view_stocks", {
      stocks: result.rows,
      page,
      totalPages,
      query: "",
    });
  }
});

app.get("/search_stocks", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const query = req.query.query;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      "SELECT * FROM Stocks WHERE code ILIKE $1 LIMIT $2 OFFSET $3",
      [`%${query}%`, limit, offset]
    );
    const total = await pool.query(
      "SELECT COUNT(*) FROM Stocks WHERE code ILIKE $1",
      [`%${query}%`]
    );
    const totalPages = Math.ceil(total.rows[0].count / limit);

    res.render("view_stocks", { stocks: result.rows, page, totalPages, query });
  }
});

app.get("/create_portfolio", (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    res.render("create_portfolio");
  }
});

app.post("/create_portfolio", async (req, res) => {
  const { cashAmount } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO Portfolios (userID, cashAmount) VALUES ($1, $2) RETURNING portfolioID",
      [req.session.userId, cashAmount]
    );
    const portfolioID = result.rows[0].portfolioid;

    const listName = `Portfolio_${portfolioID}_StockList`;

    await pool.query(
      "INSERT INTO StockLists (listName, userID, visibility) VALUES ($1, $2, $3)",
      [listName, req.session.userId, "private"]
    );

    await pool.query(
      "INSERT INTO Includes (portfolioID, listName) VALUES ($1, $2)",
      [portfolioID, listName]
    );

    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/view_portfolios", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    try {
      const portfoliosResult = await pool.query(
        "SELECT * FROM Portfolios WHERE userID = $1",
        [req.session.userId]
      );
      const portfolios = portfoliosResult.rows;

      for (const portfolio of portfolios) {
        const stockListsResult = await pool.query(
          "SELECT sl.listName FROM Includes i JOIN StockLists sl ON i.listName = sl.listName WHERE i.portfolioID = $1",
          [portfolio.portfolioid]
        );
        portfolio.stockLists = stockListsResult.rows;
      }

      res.render("view_portfolios", { portfolios });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.get("/send_friend_request", (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    res.render("send_friend_request", { error: req.session.error });
    req.session.error = null;
  }
});

app.post("/send_friend_request", async (req, res) => {
  const { toUserID } = req.body;

  if (req.session.userId == toUserID) {
    req.session.error = "You cannot send a friend request to yourself.";
    return res.redirect("/send_friend_request");
  }

  try {
    const userExists = await pool.query(
      "SELECT * FROM Users WHERE userID = $1",
      [toUserID]
    );

    if (userExists.rows.length === 0) {
      req.session.error = "User does not exist.";
      res.redirect("/send_friend_request");
      return;
    }

    const friendsExist = await pool.query(
      "SELECT * FROM Friends WHERE (friend1 = $1 AND friend2 = $2) OR (friend1 = $2 AND friend2 = $1)",
      [req.session.userId, toUserID]
    );

    if (friendsExist.rows.length > 0) {
      req.session.error = "You are already friends.";
      res.redirect("/send_friend_request");
      return;
    }

    const existingRequest = await pool.query(
      "SELECT * FROM Requests WHERE (fromUserID = $1 AND toUserID = $2) OR (fromUserID = $2 AND toUserID = $1)",
      [req.session.userId, toUserID]
    );

    if (existingRequest.rows.length > 0) {
      const timePassed = parseInt(existingRequest.rows[0].timepassed, 10);
      const currentTime = Math.floor(Date.now() / 1000);

      if (currentTime - timePassed < 300) {
        req.session.error =
          "You cannot send a friend request to this user again within 5 minutes.";
        res.redirect("/send_friend_request");
        return;
      }
    }

    const currentTime = Math.floor(Date.now() / 1000);
    await pool.query(
      `INSERT INTO Requests (fromUserID, toUserID, status, timePassed) 
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (fromUserID, toUserID) DO UPDATE 
             SET status = EXCLUDED.status, timePassed = EXCLUDED.timePassed`,
      [req.session.userId, toUserID, "pending", currentTime]
    );

    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.post("/reject_friend_request", async (req, res) => {
  const { fromUserID } = req.body;
  try {
    const currentTime = Math.floor(Date.now() / 1000);
    await pool.query(
      "UPDATE Requests SET status = $1, timePassed = $2 WHERE fromUserID = $3 AND toUserID = $4 AND status = $5",
      ["rejected", currentTime, fromUserID, req.session.userId, "pending"]
    );
    res.redirect("/view_friend_requests");
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.post("/remove_friend", async (req, res) => {
  const { friendID } = req.body;
  try {
    const currentTime = Math.floor(Date.now() / 1000);

    await pool.query(
      "DELETE FROM Friends WHERE (friend1 = $1 AND friend2 = $2) OR (friend1 = $2 AND friend2 = $1)",
      [req.session.userId, friendID]
    );

    await pool.query(
      `INSERT INTO Requests (fromUserID, toUserID, status, timePassed) 
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (fromUserID, toUserID) DO UPDATE 
             SET status = EXCLUDED.status, timePassed = EXCLUDED.timePassed`,
      [req.session.userId, friendID, "removed", currentTime]
    );

    res.redirect("/view_friends");
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/view_friend_requests", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    try {
      const incomingResult = await pool.query(
        "SELECT * FROM Requests WHERE toUserID = $1 AND status = $2",
        [req.session.userId, "pending"]
      );
      const outgoingResult = await pool.query(
        "SELECT * FROM Requests WHERE fromUserID = $1 AND status = $2",
        [req.session.userId, "pending"]
      );
      res.render("view_friend_requests", {
        incomingRequests: incomingResult.rows,
        outgoingRequests: outgoingResult.rows,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.post("/accept_friend_request", async (req, res) => {
  const { fromUserID } = req.body;
  try {
    await pool.query("BEGIN");

    await pool.query(
      "UPDATE Requests SET status = $1 WHERE fromUserID = $2 AND toUserID = $3",
      ["accepted", fromUserID, req.session.userId]
    );

    await pool.query("INSERT INTO Friends (friend1, friend2) VALUES ($1, $2)", [
      fromUserID,
      req.session.userId,
    ]);

    await pool.query(
      "DELETE FROM Requests WHERE fromUserID = $1 AND toUserID = $2",
      [fromUserID, req.session.userId]
    );

    await pool.query("COMMIT");

    res.redirect("/dashboard");
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/view_friends", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    try {
      const result = await pool.query(
        `
                SELECT u.userid, u.name, u.email
                FROM Friends f
                JOIN Users u ON (f.friend1 = u.userid OR f.friend2 = u.userid)
                WHERE (f.friend1 = $1 OR f.friend2 = $1) AND u.userid != $1
            `,
        [req.session.userId]
      );
      res.render("view_friends", { friends: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.get("/my_account", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const result = await pool.query("SELECT * FROM Users WHERE userID = $1", [
      req.session.userId,
    ]);
    const user = result.rows[0];
    res.render("my_account", { user });
  }
});

app.post("/cancel_friend_request", async (req, res) => {
  const { toUserID } = req.body;
  await pool.query(
    "DELETE FROM Requests WHERE fromUserID = $1 AND toUserID = $2 AND status = $3",
    [req.session.userId, toUserID, "pending"]
  );
  res.redirect("/view_friend_requests");
});

app.get("/create_stock_list", (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const error = req.session.error || null;
    delete req.session.error;
    res.render("create_stock_list", { error });
  }
});

app.post("/create_stock_list", async (req, res) => {
  const { listName, visibility } = req.body;
  try {
    await pool.query(
      "INSERT INTO StockLists (listName, userID, visibility) VALUES ($1, $2, $3)",
      [listName, req.session.userId, visibility]
    );
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/add_stock_to_list/:listName", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const listName = req.params.listName;
    try {
      const availableStocks = await pool.query(
        `SELECT DISTINCT code FROM Stocks`
      );

      const error = req.session.error || null;
      delete req.session.error;
      res.render("add_stock_to_list", {
        error,
        listName,
        availableStocks: availableStocks.rows,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.post("/add_stock_to_list/:listName", async (req, res) => {
  const { code, shares } = req.body;
  const listName = req.params.listName;
  try {
    const latestStock = await pool.query(
      "SELECT timestamp FROM Stocks WHERE code = $1 ORDER BY timestamp DESC LIMIT 1",
      [code]
    );

    if (latestStock.rows.length === 0) {
      req.session.error = "Stock code not found.";
      return res.redirect(`/add_stock_to_list/${listName}`);
    }

    const timestamp = latestStock.rows[0].timestamp;

    await pool.query(
      "INSERT INTO Contains (code, timestamp, listName, shares) VALUES ($1, $2, $3, $4)",
      [code, timestamp, listName, shares]
    );
    req.session.successMessage = "Stock added to list successfully";
    res.redirect(`/view_stock_list/${listName}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/change_visibility/:listName", (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const { listName } = req.params;
    res.render("change_visibility", {
      listName,
      error: req.session.error || null,
    });
    req.session.error = null;
  }
});

app.post("/change_visibility", async (req, res) => {
  const { listName, visibility } = req.body;
  try {
    await pool.query(
      "UPDATE StockLists SET visibility = $1 WHERE listName = $2 AND userID = $3",
      [visibility, listName, req.session.userId]
    );
    req.session.successMessage = "Visibility updated successfully!";
    res.redirect("/view_stock_lists");
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/view_stock_lists", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    try {
      const result = await pool.query(
        `SELECT sl.listName, sl.visibility, 
                        CASE 
                            WHEN p.portfolioID IS NOT NULL THEN TRUE 
                            ELSE FALSE 
                        END AS isPortfolio, 
                        p.portfolioID
                 FROM StockLists sl
                 LEFT JOIN Includes i ON sl.listName = i.listName
                 LEFT JOIN Portfolios p ON i.portfolioID = p.portfolioID
                 WHERE sl.userID = $1`,
        [req.session.userId]
      );

      const successMessage = req.session.successMessage || null;
      delete req.session.successMessage;
      res.render("view_stock_lists", {
        successMessage,
        stockLists: result.rows,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.get("/view_stock_list/:listName", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const listName = req.params.listName;
    try {
      const stockListResult = await pool.query(
        `SELECT c.code, c.shares, s.timestamp, s.open, s.high, s.low, s.close, s.volume
                 FROM Contains c
                 JOIN Stocks s ON c.code = s.code AND c.timestamp = s.timestamp
                 WHERE c.listName = $1`,
        [listName]
      );

      const currentTime = new Date();

      const cvBetaResult = await pool.query(
        `SELECT code, coefficient_of_variation, beta
                 FROM StockStatisticsCache
                 WHERE last_updated > NOW() - INTERVAL '24 HOURS'
                 AND code IN (SELECT code FROM Contains WHERE listName = $1)`,
        [listName]
      );

      const cachedCodes = cvBetaResult.rows.map((row) => row.code);
      const missingCodes = stockListResult.rows
        .map((row) => row.code)
        .filter((code) => !cachedCodes.includes(code));

      if (missingCodes.length > 0) {
        const newCvBetaResult = await pool.query(
          `WITH MarketStats AS (
                        SELECT
                            stddev_samp(close) / avg(close) AS market_cv,
                            var_pop(close) AS market_var
                        FROM
                            Stocks
                    )
                    SELECT
                        s.code,
                        stddev_samp(s.close) / avg(s.close) AS coefficient_of_variation,
                        (covar_pop(s.close, m.close) / ms.market_var) AS beta
                    FROM
                        Stocks s
                    CROSS JOIN
                        MarketStats ms
                    JOIN
                        Stocks m ON s.timestamp = m.timestamp
                    WHERE
                        s.code = ANY($1)
                    GROUP BY
                        s.code, ms.market_var
                    HAVING
                        COUNT(s.close) > 1;`,
          [missingCodes]
        );

        const insertPromises = newCvBetaResult.rows.map((row) => {
          return pool.query(
            `INSERT INTO StockStatisticsCache (code, coefficient_of_variation, beta, last_updated)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (code) DO UPDATE
                         SET coefficient_of_variation = EXCLUDED.coefficient_of_variation,
                             beta = EXCLUDED.beta,
                             last_updated = EXCLUDED.last_updated`,
            [row.code, row.coefficient_of_variation, row.beta, currentTime]
          );
        });

        await Promise.all(insertPromises);
        cvBetaResult.rows.push(...newCvBetaResult.rows);
      }

      const covarianceResult = await pool.query(
        `SELECT code1, code2, covariance
                 FROM CovarianceCache
                 WHERE last_updated > NOW() - INTERVAL '24 HOURS'
                 AND code1 IN (SELECT code FROM Contains WHERE listName = $1)
                 AND code2 IN (SELECT code FROM Contains WHERE listName = $1)`,
        [listName]
      );

      const missingCovPairs = stockListResult.rows.flatMap((row1) => {
        return stockListResult.rows
          .map((row2) => {
            return { code1: row1.code, code2: row2.code };
          })
          .filter(
            (pair) =>
              !covarianceResult.rows.some(
                (row) =>
                  (row.code1 === pair.code1 && row.code2 === pair.code2) ||
                  (row.code1 === pair.code2 && row.code2 === pair.code1)
              )
          );
      });

      if (missingCovPairs.length > 0) {
        const newCovarianceResult = await pool.query(
          `SELECT
                        s1.code AS code1,
                        s2.code AS code2,
                        covar_pop(s1.close, s2.close) AS covariance
                     FROM
                        Stocks s1
                     JOIN
                        Stocks s2 ON s1.timestamp = s2.timestamp
                     WHERE
                        s1.code IN (SELECT code FROM Contains WHERE listName = $1)
                        AND s2.code IN (SELECT code FROM Contains WHERE listName = $1)
                        AND s1.close IS NOT NULL
                        AND s2.close IS NOT NULL
                     GROUP BY
                        s1.code, s2.code`,
          [listName]
        );

        const insertCovPromises = newCovarianceResult.rows.map((row) => {
          return pool.query(
            `INSERT INTO CovarianceCache (code1, code2, covariance, last_updated)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (code1, code2) DO UPDATE
                         SET covariance = EXCLUDED.covariance,
                             last_updated = EXCLUDED.last_updated`,
            [row.code1, row.code2, row.covariance, currentTime]
          );
        });

        await Promise.all(insertCovPromises);
        covarianceResult.rows.push(...newCovarianceResult.rows);
      }

      const correlationResult = await pool.query(
        `SELECT code1, code2, correlation
                 FROM CorrelationCache
                 WHERE last_updated > NOW() - INTERVAL '24 HOURS'
                 AND code1 IN (SELECT code FROM Contains WHERE listName = $1)
                 AND code2 IN (SELECT code FROM Contains WHERE listName = $1)`,
        [listName]
      );

      const missingCorrPairs = stockListResult.rows.flatMap((row1) => {
        return stockListResult.rows
          .map((row2) => {
            return { code1: row1.code, code2: row2.code };
          })
          .filter(
            (pair) =>
              !correlationResult.rows.some(
                (row) =>
                  (row.code1 === pair.code1 && row.code2 === pair.code2) ||
                  (row.code1 === pair.code2 && row.code2 === pair.code1)
              )
          );
      });

      if (missingCorrPairs.length > 0) {
        const newCorrelationResult = await pool.query(
          `SELECT
                        s1.code AS code1,
                        s2.code AS code2,
                        corr(s1.close, s2.close) AS correlation
                     FROM
                        Stocks s1
                     JOIN
                        Stocks s2 ON s1.timestamp = s2.timestamp
                     WHERE
                        s1.code IN (SELECT code FROM Contains WHERE listName = $1)
                        AND s2.code IN (SELECT code FROM Contains WHERE listName = $1)
                        AND s1.close IS NOT NULL
                        AND s2.close IS NOT NULL
                     GROUP BY
                        s1.code, s2.code`,
          [listName]
        );

        const insertCorrPromises = newCorrelationResult.rows.map((row) => {
          return pool.query(
            `INSERT INTO CorrelationCache (code1, code2, correlation, last_updated)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (code1, code2) DO UPDATE
                         SET correlation = EXCLUDED.correlation,
                             last_updated = EXCLUDED.last_updated`,
            [row.code1, row.code2, row.correlation, currentTime]
          );
        });

        await Promise.all(insertCorrPromises);
        correlationResult.rows.push(...newCorrelationResult.rows);
      }

      res.render("view_stock_list", {
        stocks: stockListResult.rows,
        listName,
        cvBetaData: cvBetaResult.rows,
        covarianceData: covarianceResult.rows,
        correlationData: correlationResult.rows,
        userId: req.session.userId,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.get("/stock_price", async (req, res) => {
  const { code } = req.query;
  try {
    const result = await pool.query(
      "SELECT close FROM Stocks WHERE code = $1 ORDER BY timestamp DESC LIMIT 1",
      [code]
    );
    if (result.rows.length > 0) {
      res.json({ success: true, price: result.rows[0].close });
    } else {
      res.json({ success: false, message: "Stock price not found." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "error" });
  }
});

app.get("/share_stock_list", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    try {
      const stockListsResult = await pool.query(
        "SELECT listName FROM StockLists WHERE userID = $1 AND visibility = $2",
        [req.session.userId, "private"]
      );
      const error = req.session.error || null;
      const success = req.session.success || null;
      delete req.session.error;
      delete req.session.success;
      res.render("share_stock_list", {
        stockLists: stockListsResult.rows,
        error,
        success,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.post("/share_stock_list", async (req, res) => {
  const { listName, userID } = req.body;

  if (req.session.userId == userID) {
    req.session.error = "You cannot share the stock list with yourself.";
    return res.redirect("/share_stock_list");
  }

  try {
    const userExists = await pool.query(
      "SELECT * FROM Users WHERE userID = $1",
      [userID]
    );

    if (userExists.rows.length === 0) {
      req.session.error = "User does not exist.";
      return res.redirect("/share_stock_list");
    }

    const alreadyShared = await pool.query(
      "SELECT * FROM Share WHERE userID = $1 AND listName = $2",
      [userID, listName]
    );

    if (alreadyShared.rows.length > 0) {
      req.session.error =
        "You have already shared this stock list with this user.";
      return res.redirect("/share_stock_list");
    }

    await pool.query("INSERT INTO Share (userID, listName) VALUES ($1, $2)", [
      userID,
      listName,
    ]);
    req.session.success = `Stock list "${listName}" shared with user ID ${userID} successfully.`;
    res.redirect("/share_stock_list");
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/add_review/:listName", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const { listName } = req.params;
    const stockListResult = await pool.query(
      `SELECT * FROM StockLists 
             WHERE listName = $1 AND (
                 visibility = 'public' 
                 OR listName IN (SELECT listName FROM Share WHERE userID = $2)
                 OR userID = $2
             )`,
      [listName, req.session.userId]
    );

    if (
      stockListResult.rows.length === 0 ||
      stockListResult.rows[0].userid === req.session.userId
    ) {
      req.session.error =
        "You do not have access to this stock list or you own it.";
      res.redirect("/view_all_stock_lists");
    } else {
      res.render("add_review", { listName, error: req.session.error || null });
      req.session.error = null;
    }
  }
});

app.post("/add_review", async (req, res) => {
  const { listName, text } = req.body;
  try {
    const stockListResult = await pool.query(
      `SELECT * FROM StockLists 
             WHERE listName = $1 AND (
                 visibility = 'public' 
                 OR listName IN (SELECT listName FROM Share WHERE userID = $2)
             ) AND userID != $2`,
      [listName, req.session.userId]
    );

    if (stockListResult.rows.length === 0) {
      req.session.error =
        "You do not have access to this stock list or it is your own.";
      res.redirect("/view_all_stock_lists");
    } else {
      const existingReview = await pool.query(
        "SELECT * FROM ReviewOn WHERE userID = $1 AND listName = $2",
        [req.session.userId, listName]
      );

      if (existingReview.rows.length > 0) {
        req.session.error = "You have already reviewed this stock list.";
        res.redirect(`/add_review/${listName}`);
      } else {
        const reviewResult = await pool.query(
          "INSERT INTO Reviews (userID, text) VALUES ($1, $2) RETURNING reviewID",
          [req.session.userId, text]
        );
        const reviewID = reviewResult.rows[0].reviewid;

        await pool.query(
          "INSERT INTO ReviewOn (reviewID, userID, listName) VALUES ($1, $2, $3)",
          [reviewID, req.session.userId, listName]
        );
        res.redirect(`/view_reviews/${listName}`);
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/view_all_stock_lists", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    try {
      const result = await pool.query(
        `SELECT * FROM StockLists 
                 WHERE userID = $1 
                    OR visibility = 'public' 
                    OR listName IN (SELECT listName FROM Share WHERE userID = $1)`,
        [req.session.userId]
      );
      res.render("view_all_stock_lists", {
        stockLists: result.rows,
        userId: req.session.userId,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.get("/view_reviews/:listName", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const listName = req.params.listName;
    try {
      const stockListResult = await pool.query(
        "SELECT * FROM StockLists WHERE listName = $1",
        [listName]
      );
      if (stockListResult.rows.length > 0) {
        const stockList = stockListResult.rows[0];
        let reviewsResult;

        if (
          stockList.visibility === "public" ||
          stockList.userid === req.session.userId
        ) {
          reviewsResult = await pool.query(
            "SELECT r.reviewID, r.userID, r.text, u.name FROM Reviews r JOIN ReviewOn ro ON r.reviewID = ro.reviewID JOIN Users u ON r.userID = u.userID WHERE ro.listName = $1",
            [listName]
          );
        } else {
          reviewsResult = await pool.query(
            "SELECT r.reviewID, r.userID, r.text, u.name FROM Reviews r JOIN ReviewOn ro ON r.reviewID = ro.reviewID JOIN Users u ON r.userID = u.userID WHERE ro.listName = $1 AND (ro.userID = $2 OR $3 = $4)",
            [listName, req.session.userId, stockList.userid, req.session.userId]
          );
        }

        res.render("view_reviews", {
          reviews: reviewsResult.rows,
          listName,
          stockListUserId: stockList.userid,
          userId: req.session.userId,
        });
      } else {
        res.status(404).send("Stock list not found");
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.get("/edit_review/:reviewID", async (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const reviewID = req.params.reviewID;
    const listName = req.query.listName;
    const reviewResult = await pool.query(
      "SELECT * FROM Reviews WHERE reviewID = $1 AND userID = $2",
      [reviewID, req.session.userId]
    );

    if (reviewResult.rows.length > 0) {
      res.render("edit_review", { review: reviewResult.rows[0], listName });
    } else {
      res.status(403).send("Forbidden");
    }
  }
});

app.post("/edit_review", async (req, res) => {
  const { reviewID, text, listName } = req.body;
  try {
    await pool.query(
      "UPDATE Reviews SET text = $1 WHERE reviewID = $2 AND userID = $3",
      [text, reviewID, req.session.userId]
    );
    res.redirect(`/view_reviews/${listName}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.post("/delete_review", async (req, res) => {
  const { reviewID, listName } = req.body;
  try {
    const reviewResult = await pool.query(
      "SELECT * FROM ReviewOn WHERE reviewID = $1",
      [reviewID]
    );
    const stockListResult = await pool.query(
      "SELECT * FROM StockLists WHERE listName = $1",
      [listName]
    );

    if (reviewResult.rows.length > 0 && stockListResult.rows.length > 0) {
      const review = reviewResult.rows[0];
      const stockList = stockListResult.rows[0];

      if (
        review.userid === req.session.userId ||
        req.session.userId === stockList.userid
      ) {
        await pool.query("DELETE FROM ReviewOn WHERE reviewID = $1", [
          reviewID,
        ]);
        await pool.query("DELETE FROM Reviews WHERE reviewID = $1", [reviewID]);
        res.redirect(`/view_reviews/${listName}`);
      } else {
        res.status(403).send("Forbidden");
      }
    } else {
      res.status(404).send("Review or Stock list not found");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/deposit/:portfolioID", (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    let { portfolioID } = req.params;

    const match = portfolioID.match(/(\d+)/);
    if (match) {
      portfolioID = match[0];
    } else {
      req.session.error = "Invalid portfolio ID.";
      return res.redirect("/view_stock_lists");
    }

    res.render("deposit", { portfolioID, error: req.session.error || null });
    req.session.error = null;
  }
});

app.post("/deposit", async (req, res) => {
  const { portfolioID, amount } = req.body;
  try {
    await pool.query(
      "UPDATE Portfolios SET cashAmount = cashAmount + $1 WHERE portfolioID = $2 AND userID = $3",
      [amount, portfolioID, req.session.userId]
    );
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    req.session.error = "Deposit failed.";
    res.redirect(`/deposit/${portfolioID}`);
  }
});

app.get("/withdraw/:portfolioID", (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    let { portfolioID } = req.params;

    const match = portfolioID.match(/(\d+)/);
    if (match) {
      portfolioID = match[0];
    } else {
      req.session.error = "Invalid portfolio ID.";
      return res.redirect("/view_stock_lists");
    }
    res.render("withdraw", { portfolioID, error: req.session.error || null });
    req.session.error = null;
  }
});

app.post("/withdraw", async (req, res) => {
  const { portfolioID, amount } = req.body;
  try {
    const result = await pool.query(
      "SELECT cashAmount FROM Portfolios WHERE portfolioID = $1 AND userID = $2",
      [portfolioID, req.session.userId]
    );
    const cashAmount = result.rows[0].cashamount;

    if (cashAmount < amount) {
      req.session.error = "Insufficient funds.";
      res.redirect(`/withdraw/${portfolioID}`);
    } else {
      await pool.query(
        "UPDATE Portfolios SET cashAmount = cashAmount - $1 WHERE portfolioID = $2 AND userID = $3",
        [amount, portfolioID, req.session.userId]
      );
      res.redirect("/dashboard");
    }
  } catch (err) {
    console.error(err);
    req.session.error = "Withdrawal failed.";
    res.redirect(`/withdraw/${portfolioID}`);
  }
});

app.get("/buy_stock/:portfolioID", async (req, res) => {
  let { portfolioID } = req.params;
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const match = portfolioID.match(/(\d+)/);
    if (match) {
      portfolioID = match[0];
    } else {
      req.session.error = "Invalid portfolio ID.";
      return res.redirect("/view_stock_lists");
    }

    try {
      const portfolioResult = await pool.query(
        "SELECT * FROM Portfolios WHERE portfolioID = $1 AND userID = $2",
        [portfolioID, req.session.userId]
      );
      const stockCodesResult = await pool.query(
        "SELECT DISTINCT code FROM Stocks"
      );

      if (portfolioResult.rows.length === 0) {
        res.status(404).send("Portfolio not found");
        return;
      }

      const portfolio = portfolioResult.rows[0];
      const stockCodes = stockCodesResult.rows.map((row) => row.code);

      res.render("buy_stock", {
        portfolioID,
        cashAmount: portfolio.cashamount,
        stockCodes,
        error: req.session.error || null,
        success: req.session.success || null,
        stockPrice: null,
        totalCost: null,
      });
      req.session.error = null;
      req.session.success = null;
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.post("/buy_stock", async (req, res) => {
  let { portfolioID, code, shares } = req.body;

  const match = portfolioID.match(/(\d+)/);
  if (match) {
    portfolioID = match[0];
  } else {
    req.session.error = "Invalid portfolio ID.";
    return res.redirect("/view_stock_lists");
  }

  try {
    const stockResult = await pool.query(
      "SELECT * FROM Stocks WHERE code = $1 ORDER BY timestamp DESC LIMIT 1",
      [code]
    );

    if (stockResult.rows.length === 0) {
      req.session.error = "Stock code not found.";
      return res.redirect(`/buy_stock/${portfolioID}`);
    }

    const stock = stockResult.rows[0];
    const cost = stock.close * shares;

    const portfolioResult = await pool.query(
      "SELECT * FROM Portfolios WHERE portfolioID = $1",
      [portfolioID]
    );
    const portfolio = portfolioResult.rows[0];

    if (portfolio.cashamount < cost) {
      req.session.error = "Insufficient funds to buy the stock.";
      return res.redirect(`/buy_stock/${portfolioID}`);
    }

    await pool.query(
      "UPDATE Portfolios SET cashAmount = cashAmount - $1 WHERE portfolioID = $2",
      [cost, portfolioID]
    );

    const stockListResult = await pool.query(
      "SELECT * FROM Includes WHERE portfolioID = $1",
      [portfolioID]
    );
    let listName;

    if (stockListResult.rows.length === 0) {
      listName = `Portfolio_${portfolioID}_StockList`;
      await pool.query(
        "INSERT INTO StockLists (listName, userID, visibility) VALUES ($1, $2, $3)",
        [listName, portfolio.userid, "private"]
      );
      await pool.query(
        "INSERT INTO Includes (portfolioID, listName) VALUES ($1, $2)",
        [portfolioID, listName]
      );
    } else {
      listName = stockListResult.rows[0].listname;
    }

    await pool.query(
      "INSERT INTO Contains (code, listName, timestamp, shares) VALUES ($1, $2, $3, $4) " +
        "ON CONFLICT (code, listName, timestamp) DO UPDATE SET shares = Contains.shares + EXCLUDED.shares",
      [code, listName, stock.timestamp, shares]
    );

    req.session.success = "Stock bought successfully!";
    res.redirect(`/buy_stock/${portfolioID}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/sell_stock/:portfolioID", async (req, res) => {
  let { portfolioID } = req.params;
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    const match = portfolioID.match(/(\d+)/);
    if (match) {
      portfolioID = match[0];
    } else {
      req.session.error = "Invalid portfolio ID.";
      return res.redirect("/view_stock_lists");
    }

    try {
      const stocksResult = await pool.query(
        "SELECT c.code, c.shares FROM Contains c " +
          "JOIN Includes i ON c.listName = i.listName " +
          "WHERE i.portfolioID = $1 AND i.portfolioID IN (SELECT portfolioID FROM Portfolios WHERE userID = $2)",
        [portfolioID, req.session.userId]
      );
      const stockCodes = stocksResult.rows;

      const cashResult = await pool.query(
        "SELECT cashAmount FROM Portfolios WHERE portfolioID = $1 AND userID = $2",
        [portfolioID, req.session.userId]
      );
      const cashAmount = cashResult.rows[0].cashamount;

      res.render("sell_stock", {
        portfolioID,
        stockCodes,
        cashAmount,
        stockPrice: null,
        totalSale: null,
        error: req.session.error || null,
        success: req.session.success || null,
      });
      req.session.error = null;
      req.session.success = null;
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
});

app.post("/sell_stock", async (req, res) => {
  let { portfolioID, code, shares } = req.body;

  const match = portfolioID.match(/(\d+)/);
  if (match) {
    portfolioID = match[0];
  } else {
    req.session.error = "Invalid portfolio ID.";
    return res.redirect("/view_stock_lists");
  }

  try {
    const stockResult = await pool.query(
      "SELECT * FROM Stocks WHERE code = $1 ORDER BY timestamp DESC LIMIT 1",
      [code]
    );

    if (stockResult.rows.length === 0) {
      req.session.error = "Stock code not found.";
      return res.redirect(`/sell_stock/${portfolioID}`);
    }

    const stock = stockResult.rows[0];
    const revenue = stock.close * shares;

    const holdingsResult = await pool.query(
      "SELECT c.shares, c.listName FROM Contains c " +
        "JOIN Includes i ON c.listName = i.listName " +
        "WHERE i.portfolioID = $1 AND c.code = $2",
      [portfolioID, code]
    );

    if (
      holdingsResult.rows.length === 0 ||
      holdingsResult.rows[0].shares < shares
    ) {
      req.session.error = "Insufficient shares to sell.";
      return res.redirect(`/sell_stock/${portfolioID}`);
    }

    const listName = holdingsResult.rows[0].listname;

    await pool.query(
      "UPDATE Portfolios SET cashAmount = cashAmount + $1 WHERE portfolioID = $2",
      [revenue, portfolioID]
    );

    await pool.query(
      "UPDATE Contains SET shares = shares - $1 WHERE code = $2 AND listName = $3",
      [shares, code, listName]
    );

    await pool.query(
      "DELETE FROM Contains WHERE code = $1 AND listName = $2 AND shares <= 0",
      [code, listName]
    );

    req.session.success = "Stock sold successfully!";
    res.redirect(`/sell_stock/${portfolioID}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.get("/historical_performance/:stockCode", async (req, res) => {
  const stockCode = req.params.stockCode;
  const pastInterval = req.query.pastInterval || "5y";
  const futureInterval = req.query.futureInterval || "1y";

  try {
    const pastDate = calculatePastDate(pastInterval);
    const historicalData = await pool.query(
      `SELECT to_char(timestamp, 'YYYY-MM-DD') AS timestamp, close 
             FROM Stocks 
             WHERE code = $1 AND timestamp >= $2
             ORDER BY timestamp`,
      [stockCode, pastDate]
    );

    const pastData = historicalData.rows.map((row, index) => ({
      index: index + 1,
      close: parseFloat(row.close),
    }));

    const averageGrowthRate = calculateAverageGrowthRate(pastData);
    const recessionEvents = identifyRecessionEvents(pastData);
    const lastClosePrice = pastData[pastData.length - 1].close;
    const futureData = generateFutureData(
      lastClosePrice,
      futureInterval,
      pastData.length,
      averageGrowthRate,
      recessionEvents
    );

    res.render("historical_performance", {
      stockCode,
      pastData,
      futureData,
      pastInterval,
      futureInterval,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

function calculatePastDate(interval) {
  const endDate = new Date("2018-02-08");
  switch (interval) {
    case "1w":
      endDate.setDate(endDate.getDate() - 7);
      break;
    case "1m":
      endDate.setMonth(endDate.getMonth() - 1);
      break;
    case "3m":
      endDate.setMonth(endDate.getMonth() - 3);
      break;
    case "1y":
      endDate.setFullYear(endDate.getFullYear() - 1);
      break;
    case "5y":
    default:
      endDate.setFullYear(endDate.getFullYear() - 5);
      break;
  }
  return endDate.toISOString().split("T")[0];
}

function calculateAverageGrowthRate(pastData) {
  if (pastData.length < 2) return 0;

  const growthRates = pastData.slice(1).map((data, index) => {
    const previousClose = pastData[index].close;
    return (data.close - previousClose) / previousClose;
  });

  return growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length;
}

function identifyRecessionEvents(pastData) {
  const recessionEvents = [];
  for (let i = 1; i < pastData.length; i++) {
    const drop =
      (pastData[i].close - pastData[i - 1].close) / pastData[i - 1].close;
    if (drop <= -0.7) {
      recessionEvents.push({ index: i, drop });
    }
  }
  return recessionEvents;
}

function generateFutureData(
  lastClosePrice,
  interval,
  pastDataLength,
  averageGrowthRate,
  recessionEvents
) {
  const futureData = [];
  let currentPrice = lastClosePrice;

  const totalDays =
    {
      "1w": 7,
      "1m": 30,
      "3m": 90,
      "1y": 365,
      "5y": 365 * 5,
    }[interval] || 365;

  for (let i = 1; i <= totalDays; i++) {
    if (i % 80 === 0) {
      currentPrice *= 1 - (Math.random() * 0.04 + 0.02);
    } else {
      currentPrice *= 1 + averageGrowthRate + (Math.random() * 0.01 - 0.005);
    }
    futureData.push({
      index: pastDataLength + i,
      close: currentPrice,
    });
  }

  if (totalDays >= 365) {
    if (recessionEvents.length > 0) {
      const randomEvent =
        recessionEvents[Math.floor(Math.random() * recessionEvents.length)];
      const recessionIndex =
        Math.floor(Math.random() * (totalDays - randomEvent.index)) +
        randomEvent.index;
      for (let i = recessionIndex; i < futureData.length; i++) {
        futureData[i].close *= 1 + randomEvent.drop * 1.5;
      }
    }
  }

  return futureData;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
