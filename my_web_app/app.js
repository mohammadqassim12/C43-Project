const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const session = require('express-session');

const app = express();
const pool = new Pool({
    user: 'postgres',
    host: '34.170.251.68',
    database: 'mydb',
    password: 'admin',
    port: 5432,
});
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    await pool.query('INSERT INTO Users (name, email, password) VALUES ($1, $2, $3)', [name, email, password]);
    res.redirect('/');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM Users WHERE email = $1 AND password = $2', [email, password]);
    const user = result.rows[0];

    if (user) {
        req.session.userId = user.userid;
        req.session.userName = user.name;
        res.redirect('/dashboard');
    } else {
        res.redirect('/login');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        try {
            const userResult = await pool.query('SELECT * FROM Users WHERE userID = $1', [req.session.userId]);
            const user = userResult.rows[0];

            const portfoliosResult = await pool.query('SELECT * FROM Portfolios WHERE userID = $1', [req.session.userId]);
            const portfolios = portfoliosResult.rows;

            for (let portfolio of portfolios) {
                const stockListsResult = await pool.query('SELECT * FROM Includes WHERE portfolioID = $1', [portfolio.portfolioid]);
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

            res.render('dashboard', { user, portfolios });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

// Route to render the add stock form
app.get('/add_stock', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        try {
            const stockCodesResult = await pool.query('SELECT DISTINCT code FROM Stocks');
            const stockCodes = stockCodesResult.rows.map(row => row.code);
            res.render('add_stock', { stockCodes });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

// Handle form submission for adding stock
app.post('/add_stock', async (req, res) => {
    const { code, newCode, timestamp, open, high, low, close, volume } = req.body;
    const stockCode = (code === 'new') ? newCode : code;
    try {
        await pool.query(
            'INSERT INTO Stocks (code, timestamp, open, high, low, close, volume) VALUES ($1, $2, $3, $4, $5, $6, $7)', 
            [stockCode, timestamp, open, high, low, close, volume]
        );
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/view_stocks', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        const result = await pool.query('SELECT * FROM Stocks LIMIT $1 OFFSET $2', [limit, offset]);
        const total = await pool.query('SELECT COUNT(*) FROM Stocks');
        const totalPages = Math.ceil(total.rows[0].count / limit);

        res.render('view_stocks', { stocks: result.rows, page, totalPages, query: '' });
    }
});

app.get('/search_stocks', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const query = req.query.query;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        const result = await pool.query('SELECT * FROM Stocks WHERE code ILIKE $1 LIMIT $2 OFFSET $3', [`%${query}%`, limit, offset]);
        const total = await pool.query('SELECT COUNT(*) FROM Stocks WHERE code ILIKE $1', [`%${query}%`]);
        const totalPages = Math.ceil(total.rows[0].count / limit);

        res.render('view_stocks', { stocks: result.rows, page, totalPages, query });
    }
});

// Create Portfolio
app.get('/create_portfolio', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        res.render('create_portfolio');
    }
});

app.post('/create_portfolio', async (req, res) => {
    const { cashAmount } = req.body;
    try {
        // Insert the new portfolio and get its ID
        const result = await pool.query('INSERT INTO Portfolios (userID, cashAmount) VALUES ($1, $2) RETURNING portfolioID', [req.session.userId, cashAmount]);
        const portfolioID = result.rows[0].portfolioid;

        // Create a unique stock list name
        const listName = `Portfolio_${portfolioID}_StockList`;

        // Insert a new private stock list associated with the portfolio
        await pool.query('INSERT INTO StockLists (listName, userID, visibility) VALUES ($1, $2, $3)', [listName, req.session.userId, 'private']);

        // Associate the stock list with the portfolio
        await pool.query('INSERT INTO Includes (portfolioID, listName) VALUES ($1, $2)', [portfolioID, listName]);

        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

// View Portfolios
app.get('/view_portfolios', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        try {
            const portfoliosResult = await pool.query('SELECT * FROM Portfolios WHERE userID = $1', [req.session.userId]);
            const portfolios = portfoliosResult.rows;

            // Fetch associated stock lists for each portfolio
            for (const portfolio of portfolios) {
                const stockListsResult = await pool.query(
                    'SELECT sl.listName FROM Includes i JOIN StockLists sl ON i.listName = sl.listName WHERE i.portfolioID = $1',
                    [portfolio.portfolioid]
                );
                portfolio.stockLists = stockListsResult.rows;
            }

            res.render('view_portfolios', { portfolios });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

// Send Friend Request
app.get('/send_friend_request', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        res.render('send_friend_request', { error: req.session.error });
        req.session.error = null;  // Clear the error after displaying
    }
});

app.post('/send_friend_request', async (req, res) => {
    const { toUserID } = req.body;

    // Prevent users from sending a friend request to themselves
    if (req.session.userId == toUserID) {
        req.session.error = 'You cannot send a friend request to yourself.';
        return res.redirect('/send_friend_request');
    }

    try {
        // Check if the toUserID exists
        const userExists = await pool.query(
            'SELECT * FROM Users WHERE userID = $1',
            [toUserID]
        );

        if (userExists.rows.length === 0) {
            // If the user doesn't exist, redirect back with an error message
            req.session.error = 'User does not exist.';
            res.redirect('/send_friend_request');
            return;
        }

        // Check if the users are already friends
        const friendsExist = await pool.query(
            'SELECT * FROM Friends WHERE (friend1 = $1 AND friend2 = $2) OR (friend1 = $2 AND friend2 = $1)',
            [req.session.userId, toUserID]
        );

        if (friendsExist.rows.length > 0) {
            // If the users are already friends, redirect back with an error message
            req.session.error = 'You are already friends.';
            res.redirect('/send_friend_request');
            return;
        }

        // Check if any request already exists and check for timePassed
        const existingRequest = await pool.query(
            'SELECT * FROM Requests WHERE (fromUserID = $1 AND toUserID = $2) OR (fromUserID = $2 AND toUserID = $1)',
            [req.session.userId, toUserID]
        );

        if (existingRequest.rows.length > 0) {
            const timePassed = parseInt(existingRequest.rows[0].timepassed, 10);
            const currentTime = Math.floor(Date.now() / 1000);
            console.log(`Current time: ${currentTime}, timePassed: ${timePassed}, difference: ${currentTime - timePassed}`);

            if (currentTime - timePassed < 300) { // 5 minutes = 300 seconds
                req.session.error = 'You cannot send a friend request to this user again within 5 minutes.';
                res.redirect('/send_friend_request');
                return;
            }
        }

        // Insert or update the friend request
        const currentTime = Math.floor(Date.now() / 1000);
        await pool.query(
            `INSERT INTO Requests (fromUserID, toUserID, status, timePassed) 
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (fromUserID, toUserID) DO UPDATE 
             SET status = EXCLUDED.status, timePassed = EXCLUDED.timePassed`,
            [req.session.userId, toUserID, 'pending', currentTime]
        );

        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

// Reject Friend Request
app.post('/reject_friend_request', async (req, res) => {
    const { fromUserID } = req.body;
    try {
        const currentTime = Math.floor(Date.now() / 1000);
        await pool.query(
            'UPDATE Requests SET status = $1, timePassed = $2 WHERE fromUserID = $3 AND toUserID = $4 AND status = $5',
            ['rejected', currentTime, fromUserID, req.session.userId, 'pending']
        );
        res.redirect('/view_friend_requests');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

// Remove Friend
app.post('/remove_friend', async (req, res) => {
    const { friendID } = req.body;
    try {
        const currentTime = Math.floor(Date.now() / 1000);

        // Delete the friend relationship
        await pool.query(
            'DELETE FROM Friends WHERE (friend1 = $1 AND friend2 = $2) OR (friend1 = $2 AND friend2 = $1)', 
            [req.session.userId, friendID]
        );

        // Insert or update the related friend requests with the status 'removed' and set the timePassed
        await pool.query(
            `INSERT INTO Requests (fromUserID, toUserID, status, timePassed) 
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (fromUserID, toUserID) DO UPDATE 
             SET status = EXCLUDED.status, timePassed = EXCLUDED.timePassed`,
            [req.session.userId, friendID, 'removed', currentTime]
        );

        res.redirect('/view_friends');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});


// View Friend Requests
app.get('/view_friend_requests', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        try {
            const incomingResult = await pool.query(
                'SELECT * FROM Requests WHERE toUserID = $1 AND status = $2', 
                [req.session.userId, 'pending']
            );
            const outgoingResult = await pool.query(
                'SELECT * FROM Requests WHERE fromUserID = $1 AND status = $2', 
                [req.session.userId, 'pending']
            );
            res.render('view_friend_requests', { 
                incomingRequests: incomingResult.rows,
                outgoingRequests: outgoingResult.rows 
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

// Accept Friend Request
app.post('/accept_friend_request', async (req, res) => {
    const { fromUserID } = req.body;
    try {
        await pool.query('BEGIN');
        
        // Update request status to accepted
        await pool.query('UPDATE Requests SET status = $1 WHERE fromUserID = $2 AND toUserID = $3', ['accepted', fromUserID, req.session.userId]);

        // Insert into Friends table
        await pool.query('INSERT INTO Friends (friend1, friend2) VALUES ($1, $2)', [fromUserID, req.session.userId]);

        // Delete the accepted request from Requests table
        await pool.query('DELETE FROM Requests WHERE fromUserID = $1 AND toUserID = $2', [fromUserID, req.session.userId]);

        await pool.query('COMMIT');

        res.redirect('/dashboard');
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

// View Friends
app.get('/view_friends', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        try {
            const result = await pool.query(`
                SELECT u.userid, u.name, u.email
                FROM Friends f
                JOIN Users u ON (f.friend1 = u.userid OR f.friend2 = u.userid)
                WHERE (f.friend1 = $1 OR f.friend2 = $1) AND u.userid != $1
            `, [req.session.userId]);
            res.render('view_friends', { friends: result.rows });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

// My Account
app.get('/my_account', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const result = await pool.query('SELECT * FROM Users WHERE userID = $1', [req.session.userId]);
        const user = result.rows[0];
        res.render('my_account', { user });
    }
});

app.post('/cancel_friend_request', async (req, res) => {
    const { toUserID } = req.body;
    await pool.query('DELETE FROM Requests WHERE fromUserID = $1 AND toUserID = $2 AND status = $3', [req.session.userId, toUserID, 'pending']);
    res.redirect('/view_friend_requests');
});

app.get('/create_stock_list', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const error = req.session.error || null;
        delete req.session.error;
        res.render('create_stock_list', { error });
    }
});

app.post('/create_stock_list', async (req, res) => {
    const { listName, visibility } = req.body;
    try {
        await pool.query('INSERT INTO StockLists (listName, userID, visibility) VALUES ($1, $2, $3)', [listName, req.session.userId, visibility]);
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

// Add Stock to Stock List
app.get('/add_stock_to_list/:listName', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const listName = req.params.listName;
        try {
            const availableStocks = await pool.query(
                `SELECT DISTINCT code FROM Stocks`
            );

            const error = req.session.error || null;
            delete req.session.error;
            res.render('add_stock_to_list', { error, listName, availableStocks: availableStocks.rows });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

app.post('/add_stock_to_list/:listName', async (req, res) => {
    const { code, shares } = req.body;
    const listName = req.params.listName;
    try {
        const latestStock = await pool.query(
            'SELECT timestamp FROM Stocks WHERE code = $1 ORDER BY timestamp DESC LIMIT 1',
            [code]
        );

        if (latestStock.rows.length === 0) {
            req.session.error = 'Stock code not found.';
            return res.redirect(`/add_stock_to_list/${listName}`);
        }

        const timestamp = latestStock.rows[0].timestamp;

        await pool.query(
            'INSERT INTO Contains (code, timestamp, listName, shares) VALUES ($1, $2, $3, $4)',
            [code, timestamp, listName, shares]
        );
        req.session.successMessage = 'Stock added to list successfully';
        res.redirect(`/view_stock_list/${listName}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/change_visibility/:listName', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const { listName } = req.params;
        res.render('change_visibility', { listName, error: req.session.error || null });
        req.session.error = null;
    }
});

app.post('/change_visibility', async (req, res) => {
    const { listName, visibility } = req.body;
    try {
        await pool.query('UPDATE StockLists SET visibility = $1 WHERE listName = $2 AND userID = $3', [visibility, listName, req.session.userId]);
        req.session.successMessage = 'Visibility updated successfully!';
        res.redirect('/view_stock_lists');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});;

app.get('/view_stock_lists', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        try {
            const stockListsResult = await pool.query(
                'SELECT listName, visibility FROM StockLists WHERE userID = $1',
                [req.session.userId]
            );
            const successMessage = req.session.successMessage || null;
            req.session.successMessage = null;
            res.render('view_stock_lists', { stockLists: stockListsResult.rows, successMessage });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

// View stock list and statistics
app.get('/view_stock_list/:listName', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
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

            // Check cached values for Coefficient of Variation and Beta
            const cvBetaResult = await pool.query(
                `SELECT code, coefficient_of_variation, beta
                 FROM StockStatisticsCache
                 WHERE last_updated > NOW() - INTERVAL '24 HOURS'
                 AND code IN (SELECT code FROM Contains WHERE listName = $1)`,
                [listName]
            );

            const cachedCodes = cvBetaResult.rows.map(row => row.code);
            const missingCodes = stockListResult.rows.map(row => row.code).filter(code => !cachedCodes.includes(code));

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

                const insertPromises = newCvBetaResult.rows.map(row => {
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

            // Fetch Covariance
            const covarianceResult = await pool.query(
                `SELECT code1, code2, covariance
                 FROM CovarianceCache
                 WHERE last_updated > NOW() - INTERVAL '24 HOURS'
                 AND code1 IN (SELECT code FROM Contains WHERE listName = $1)
                 AND code2 IN (SELECT code FROM Contains WHERE listName = $1)`,
                [listName]
            );

            const missingCovPairs = stockListResult.rows.flatMap(row1 => {
                return stockListResult.rows.map(row2 => {
                    return { code1: row1.code, code2: row2.code };
                }).filter(pair => !covarianceResult.rows.some(row => (row.code1 === pair.code1 && row.code2 === pair.code2) || (row.code1 === pair.code2 && row.code2 === pair.code1)));
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

                const insertCovPromises = newCovarianceResult.rows.map(row => {
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

            // Fetch Correlation
            const correlationResult = await pool.query(
                `SELECT code1, code2, correlation
                 FROM CorrelationCache
                 WHERE last_updated > NOW() - INTERVAL '24 HOURS'
                 AND code1 IN (SELECT code FROM Contains WHERE listName = $1)
                 AND code2 IN (SELECT code FROM Contains WHERE listName = $1)`,
                [listName]
            );

            const missingCorrPairs = stockListResult.rows.flatMap(row1 => {
                return stockListResult.rows.map(row2 => {
                    return { code1: row1.code, code2: row2.code };
                }).filter(pair => !correlationResult.rows.some(row => (row.code1 === pair.code1 && row.code2 === pair.code2) || (row.code1 === pair.code2 && row.code2 === pair.code1)));
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

                const insertCorrPromises = newCorrelationResult.rows.map(row => {
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

            res.render('view_stock_list', {
                stocks: stockListResult.rows,
                listName,
                cvBetaData: cvBetaResult.rows,
                covarianceData: covarianceResult.rows,
                correlationData: correlationResult.rows,
                userId: req.session.userId
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});


app.get('/stock_price', async (req, res) => {
    const { code } = req.query;
    try {
        const result = await pool.query('SELECT close FROM Stocks WHERE code = $1 ORDER BY timestamp DESC LIMIT 1', [code]);
        if (result.rows.length > 0) {
            res.json({ success: true, price: result.rows[0].close });
        } else {
            res.json({ success: false, message: 'Stock price not found.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});


app.get('/share_stock_list', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        try {
            const stockListsResult = await pool.query(
                'SELECT listName FROM StockLists WHERE userID = $1 AND visibility = $2',
                [req.session.userId, 'private']
            );
            const error = req.session.error || null;
            const success = req.session.success || null;
            delete req.session.error;
            delete req.session.success;
            res.render('share_stock_list', { stockLists: stockListsResult.rows, error, success });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

app.post('/share_stock_list', async (req, res) => {
    const { listName, userID } = req.body;

    if (req.session.userId == userID) {
        req.session.error = 'You cannot share the stock list with yourself.';
        return res.redirect('/share_stock_list');
    }

    try {
        const userExists = await pool.query(
            'SELECT * FROM Users WHERE userID = $1',
            [userID]
        );

        if (userExists.rows.length === 0) {
            req.session.error = 'User does not exist.';
            return res.redirect('/share_stock_list');
        }

        const alreadyShared = await pool.query(
            'SELECT * FROM Share WHERE userID = $1 AND listName = $2',
            [userID, listName]
        );

        if (alreadyShared.rows.length > 0) {
            req.session.error = 'You have already shared this stock list with this user.';
            return res.redirect('/share_stock_list');
        }

        await pool.query(
            'INSERT INTO Share (userID, listName) VALUES ($1, $2)',
            [userID, listName]
        );
        req.session.success = `Stock list "${listName}" shared with user ID ${userID} successfully.`;
        res.redirect('/share_stock_list');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

// Route to render the add_review page
app.get('/add_review/:listName', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
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

        if (stockListResult.rows.length === 0 || stockListResult.rows[0].userid === req.session.userId) {
            req.session.error = 'You do not have access to this stock list or you own it.';
            res.redirect('/view_all_stock_lists');
        } else {
            res.render('add_review', { listName, error: req.session.error || null });
            req.session.error = null; // Clear the error after displaying
        }
    }
});

// Handle form submission for adding a review
app.post('/add_review', async (req, res) => {
    const { listName, text } = req.body;
    try {
        // Check if the stock list is accessible to the user and not owned by them
        const stockListResult = await pool.query(
            `SELECT * FROM StockLists 
             WHERE listName = $1 AND (
                 visibility = 'public' 
                 OR listName IN (SELECT listName FROM Share WHERE userID = $2)
             ) AND userID != $2`,
            [listName, req.session.userId]
        );

        if (stockListResult.rows.length === 0) {
            req.session.error = 'You do not have access to this stock list or it is your own.';
            res.redirect('/view_all_stock_lists');
        } else {
            // Check if a review already exists for this list by this user
            const existingReview = await pool.query(
                'SELECT * FROM ReviewOn WHERE userID = $1 AND listName = $2',
                [req.session.userId, listName]
            );

            if (existingReview.rows.length > 0) {
                req.session.error = 'You have already reviewed this stock list.';
                res.redirect(`/add_review/${listName}`);
            } else {
                // Insert the new review
                const reviewResult = await pool.query(
                    'INSERT INTO Reviews (userID, text) VALUES ($1, $2) RETURNING reviewID',
                    [req.session.userId, text]
                );
                const reviewID = reviewResult.rows[0].reviewid;

                await pool.query(
                    'INSERT INTO ReviewOn (reviewID, userID, listName) VALUES ($1, $2, $3)',
                    [reviewID, req.session.userId, listName]
                );
                res.redirect(`/view_reviews/${listName}`);
            }
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

// View all accessible stock lists
app.get('/view_all_stock_lists', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        try {
            const result = await pool.query(
                `SELECT * FROM StockLists 
                 WHERE userID = $1 
                    OR visibility = 'public' 
                    OR listName IN (SELECT listName FROM Share WHERE userID = $1)`,
                [req.session.userId]
            );
            res.render('view_all_stock_lists', { stockLists: result.rows, userId: req.session.userId });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

// View reviews for a stock list
app.get('/view_reviews/:listName', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const listName = req.params.listName;
        try {
            const stockListResult = await pool.query('SELECT * FROM StockLists WHERE listName = $1', [listName]);
            if (stockListResult.rows.length > 0) {
                const stockList = stockListResult.rows[0];
                let reviewsResult;

                if (stockList.visibility === 'public' || stockList.userid === req.session.userId) {
                    reviewsResult = await pool.query(
                        'SELECT r.reviewID, r.userID, r.text, u.name FROM Reviews r JOIN ReviewOn ro ON r.reviewID = ro.reviewID JOIN Users u ON r.userID = u.userID WHERE ro.listName = $1',
                        [listName]
                    );
                } else {
                    reviewsResult = await pool.query(
                        'SELECT r.reviewID, r.userID, r.text, u.name FROM Reviews r JOIN ReviewOn ro ON r.reviewID = ro.reviewID JOIN Users u ON r.userID = u.userID WHERE ro.listName = $1 AND (ro.userID = $2 OR $3 = $4)',
                        [listName, req.session.userId, stockList.userid, req.session.userId]
                    );
                }

                res.render('view_reviews', { reviews: reviewsResult.rows, listName, stockListUserId: stockList.userid, userId: req.session.userId });
            } else {
                res.status(404).send('Stock list not found');
            }
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

// Render the form for editing a review
app.get('/edit_review/:reviewID', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const reviewID = req.params.reviewID;
        const listName = req.query.listName;  // Get listName from query parameters
        const reviewResult = await pool.query('SELECT * FROM Reviews WHERE reviewID = $1 AND userID = $2', [reviewID, req.session.userId]);

        if (reviewResult.rows.length > 0) {
            res.render('edit_review', { review: reviewResult.rows[0], listName });
        } else {
            res.status(403).send('Forbidden');
        }
    }
});

// Handle form submission for editing a review
app.post('/edit_review', async (req, res) => {
    const { reviewID, text, listName } = req.body;
    try {
        await pool.query('UPDATE Reviews SET text = $1 WHERE reviewID = $2 AND userID = $3', [text, reviewID, req.session.userId]);
        res.redirect(`/view_reviews/${listName}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});


// Handle review deletion
app.post('/delete_review', async (req, res) => {
    const { reviewID, listName } = req.body;
    try {
        const reviewResult = await pool.query('SELECT * FROM ReviewOn WHERE reviewID = $1', [reviewID]);
        const stockListResult = await pool.query('SELECT * FROM StockLists WHERE listName = $1', [listName]);

        if (reviewResult.rows.length > 0 && stockListResult.rows.length > 0) {
            const review = reviewResult.rows[0];
            const stockList = stockListResult.rows[0];

            if (review.userid === req.session.userId || req.session.userId === stockList.userid) {
                await pool.query('DELETE FROM ReviewOn WHERE reviewID = $1', [reviewID]);
                await pool.query('DELETE FROM Reviews WHERE reviewID = $1', [reviewID]);
                res.redirect(`/view_reviews/${listName}`);
            } else {
                res.status(403).send('Forbidden');
            }
        } else {
            res.status(404).send('Review or Stock list not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/deposit/:portfolioID', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const { portfolioID } = req.params;
        res.render('deposit', { portfolioID, error: req.session.error || null });
        req.session.error = null;
    }
});

// Handle form submission for depositing cash
app.post('/deposit', async (req, res) => {
    const { portfolioID, amount } = req.body;
    try {
        await pool.query('UPDATE Portfolios SET cashAmount = cashAmount + $1 WHERE portfolioID = $2 AND userID = $3', 
                         [amount, portfolioID, req.session.userId]);
        res.redirect('/view_portfolios');
    } catch (err) {
        console.error(err);
        req.session.error = 'Deposit failed.';
        res.redirect(`/deposit/${portfolioID}`);
    }
});

// Route to render the withdraw form
app.get('/withdraw/:portfolioID', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const { portfolioID } = req.params;
        res.render('withdraw', { portfolioID, error: req.session.error || null });
        req.session.error = null;
    }
});

// Handle form submission for withdrawing cash
app.post('/withdraw', async (req, res) => {
    const { portfolioID, amount } = req.body;
    try {
        const result = await pool.query('SELECT cashAmount FROM Portfolios WHERE portfolioID = $1 AND userID = $2', 
                                        [portfolioID, req.session.userId]);
        const cashAmount = result.rows[0].cashamount;

        if (cashAmount < amount) {
            req.session.error = 'Insufficient funds.';
            res.redirect(`/withdraw/${portfolioID}`);
        } else {
            await pool.query('UPDATE Portfolios SET cashAmount = cashAmount - $1 WHERE portfolioID = $2 AND userID = $3', 
                             [amount, portfolioID, req.session.userId]);
            res.redirect('/view_portfolios');
        }
    } catch (err) {
        console.error(err);
        req.session.error = 'Withdrawal failed.';
        res.redirect(`/withdraw/${portfolioID}`);
    }
});

// Render the form for buying stock
app.get('/buy_stock/:portfolioID', async (req, res) => {
    const { portfolioID } = req.params;
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        try {
            const portfolioResult = await pool.query('SELECT * FROM Portfolios WHERE portfolioID = $1 AND userID = $2', [portfolioID, req.session.userId]);
            const stockCodesResult = await pool.query('SELECT DISTINCT code FROM Stocks');

            if (portfolioResult.rows.length === 0) {
                res.status(404).send('Portfolio not found');
                return;
            }

            const portfolio = portfolioResult.rows[0];
            const stockCodes = stockCodesResult.rows.map(row => row.code);

            res.render('buy_stock', { 
                portfolioID, 
                cashAmount: portfolio.cashamount, 
                stockCodes, 
                error: req.session.error || null,
                success: req.session.success || null,
                stockPrice: null, // Initial rendering doesn't have stock price
                totalCost: null  // Initial rendering doesn't have total cost
            });
            req.session.error = null; // Clear the error after displaying
            req.session.success = null; // Clear the success message after displaying
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

app.post('/buy_stock', async (req, res) => {
    const { portfolioID, code, shares } = req.body;
    try {
        // Fetch the latest stock price for the given stock code
        const stockResult = await pool.query(
            'SELECT * FROM Stocks WHERE code = $1 ORDER BY timestamp DESC LIMIT 1',
            [code]
        );

        if (stockResult.rows.length === 0) {
            req.session.error = 'Stock code not found.';
            return res.redirect(`/buy_stock/${portfolioID}`);
        }

        const stock = stockResult.rows[0];
        const cost = stock.close * shares;

        // Update the portfolio's cash amount
        const portfolioResult = await pool.query('SELECT * FROM Portfolios WHERE portfolioID = $1', [portfolioID]);
        const portfolio = portfolioResult.rows[0];

        if (portfolio.cashamount < cost) {
            req.session.error = 'Insufficient funds to buy the stock.';
            return res.redirect(`/buy_stock/${portfolioID}`);
        }

        await pool.query(
            'UPDATE Portfolios SET cashAmount = cashAmount - $1 WHERE portfolioID = $2',
            [cost, portfolioID]
        );

        // Check if a stock list for this portfolio already exists
        const stockListResult = await pool.query('SELECT * FROM Includes WHERE portfolioID = $1', [portfolioID]);
        let listName;

        if (stockListResult.rows.length === 0) {
            // Create a new stock list if none exists
            listName = `Portfolio_${portfolioID}_StockList`;
            await pool.query('INSERT INTO StockLists (listName, userID, visibility) VALUES ($1, $2, $3)', [listName, portfolio.userid, 'private']);
            await pool.query('INSERT INTO Includes (portfolioID, listName) VALUES ($1, $2)', [portfolioID, listName]);
        } else {
            listName = stockListResult.rows[0].listname;
        }

        // Insert or update the Contains table with the new stock holding
        await pool.query(
            'INSERT INTO Contains (code, listName, timestamp, shares) VALUES ($1, $2, $3, $4) ' +
            'ON CONFLICT (code, listName, timestamp) DO UPDATE SET shares = Contains.shares + EXCLUDED.shares',
            [code, listName, stock.timestamp, shares]
        );

        req.session.success = 'Stock bought successfully!';
        res.redirect(`/buy_stock/${portfolioID}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});


// Route to render the sell stock form
app.get('/sell_stock/:portfolioID', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const { portfolioID } = req.params;
        try {
            const stocksResult = await pool.query(
                'SELECT c.code, c.shares FROM Contains c ' +
                'JOIN Includes i ON c.listName = i.listName ' +
                'WHERE i.portfolioID = $1 AND i.portfolioID IN (SELECT portfolioID FROM Portfolios WHERE userID = $2)',
                [portfolioID, req.session.userId]
            );
            const stockCodes = stocksResult.rows;

            const cashResult = await pool.query('SELECT cashAmount FROM Portfolios WHERE portfolioID = $1 AND userID = $2', [portfolioID, req.session.userId]);
            const cashAmount = cashResult.rows[0].cashamount;

            res.render('sell_stock', { 
                portfolioID, 
                stockCodes, 
                cashAmount, 
                stockPrice: null, 
                totalSale: null, 
                error: req.session.error || null, 
                success: req.session.success || null 
            });
            req.session.error = null;
            req.session.success = null;
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

// Handle form submission for selling stock
app.post('/sell_stock', async (req, res) => {
    const { portfolioID, code, shares } = req.body;
    try {
        // Fetch the latest stock price for the given stock code
        const stockResult = await pool.query(
            'SELECT * FROM Stocks WHERE code = $1 ORDER BY timestamp DESC LIMIT 1',
            [code]
        );

        if (stockResult.rows.length === 0) {
            req.session.error = 'Stock code not found.';
            return res.redirect(`/sell_stock/${portfolioID}`);
        }

        const stock = stockResult.rows[0];
        const revenue = stock.close * shares;

        // Check if the user owns enough shares to sell
        const holdingsResult = await pool.query(
            'SELECT c.shares, c.listName FROM Contains c ' +
            'JOIN Includes i ON c.listName = i.listName ' +
            'WHERE i.portfolioID = $1 AND c.code = $2',
            [portfolioID, code]
        );

        if (holdingsResult.rows.length === 0 || holdingsResult.rows[0].shares < shares) {
            req.session.error = 'Insufficient shares to sell.';
            return res.redirect(`/sell_stock/${portfolioID}`);
        }

        const listName = holdingsResult.rows[0].listname;

        // Update the portfolio's cash amount
        await pool.query(
            'UPDATE Portfolios SET cashAmount = cashAmount + $1 WHERE portfolioID = $2',
            [revenue, portfolioID]
        );

        // Update the Contains table with the new stock holding
        await pool.query(
            'UPDATE Contains SET shares = shares - $1 WHERE code = $2 AND listName = $3',
            [shares, code, listName]
        );

        // Remove the stock holding if shares become zero or less
        await pool.query(
            'DELETE FROM Contains WHERE code = $1 AND listName = $2 AND shares <= 0',
            [code, listName]
        );

        req.session.success = 'Stock sold successfully!';
        res.redirect(`/sell_stock/${portfolioID}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});