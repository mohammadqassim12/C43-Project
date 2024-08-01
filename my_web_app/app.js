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

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
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

app.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        res.render('dashboard', { name: req.session.userName });
    }
});

app.get('/add_stock', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        res.render('add_stock');
    }
});

app.post('/add_stock', async (req, res) => {
    const { code, timestamp, open, high, low, close, volume } = req.body;
    await pool.query('INSERT INTO Stocks (code, timestamp, open, high, low, close, volume) VALUES ($1, $2, $3, $4, $5, $6, $7)', 
                    [code, timestamp, open, high, low, close, volume]);
    res.redirect('/dashboard');
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
    await pool.query('INSERT INTO Portfolios (userID, cashAmount) VALUES ($1, $2)', [req.session.userId, cashAmount]);
    res.redirect('/dashboard');
});

// View Portfolios
app.get('/view_portfolios', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const result = await pool.query('SELECT * FROM Portfolios WHERE userID = $1', [req.session.userId]);
        res.render('view_portfolios', { portfolios: result.rows });
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

        // Check if any request already exists
        const existingRequest = await pool.query(
            'SELECT * FROM Requests WHERE (fromUserID = $1 AND toUserID = $2) OR (fromUserID = $2 AND toUserID = $1)',
            [req.session.userId, toUserID]
        );

        if (existingRequest.rows.length > 0) {
            // If a request already exists, redirect back with an error message
            req.session.error = 'Friend request already exists.';
            res.redirect('/send_friend_request');
        } else {
            // If no existing request, insert the new friend request
            await pool.query(
                'INSERT INTO Requests (fromUserID, toUserID, status, timePassed) VALUES ($1, $2, $3, $4)',
                [req.session.userId, toUserID, 'pending', 0]
            );
            res.redirect('/dashboard');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

// Reject Friend Request
app.post('/reject_friend_request', async (req, res) => {
    const { fromUserID } = req.body;
    try {
        await pool.query('DELETE FROM Requests WHERE fromUserID = $1 AND toUserID = $2 AND status = $3', [fromUserID, req.session.userId, 'pending']);
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
        // Delete the friend relationship
        await pool.query('DELETE FROM Friends WHERE (friend1 = $1 AND friend2 = $2) OR (friend1 = $2 AND friend2 = $1)', [req.session.userId, friendID]);
        
        // Delete any related friend requests
        await pool.query('DELETE FROM Requests WHERE (fromUserID = $1 AND toUserID = $2) OR (fromUserID = $2 AND toUserID = $1)', [req.session.userId, friendID]);
        
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

// Add Review
app.get('/add_review', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        res.render('add_review');
    }
});

app.post('/add_review', async (req, res) => {
    const { listName, text } = req.body;
    await pool.query('INSERT INTO Reviews (userID, listName, text) VALUES ($1, $2, $3)', [req.session.userId, listName, text]);
    res.redirect('/dashboard');
});

// View Reviews
app.get('/view_reviews', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const result = await pool.query('SELECT * FROM Reviews WHERE userID = $1', [req.session.userId]);
        res.render('view_reviews', { reviews: result.rows });
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

app.get('/add_stock_to_list', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const error = req.session.error || null;
        delete req.session.error;
        res.render('add_stock_to_list', { error });
    }
});

app.post('/add_stock_to_list', async (req, res) => {
    const { code, listName, shares } = req.body;
    try {
        const latestStock = await pool.query(
            'SELECT timestamp FROM Stocks WHERE code = $1 ORDER BY timestamp DESC LIMIT 1',
            [code]
        );

        if (latestStock.rows.length === 0) {
            req.session.error = 'Stock code not found.';
            return res.redirect('/add_stock_to_list');
        }

        const timestamp = latestStock.rows[0].timestamp;

        await pool.query(
            'INSERT INTO Contains (code, timestamp, listName, shares) VALUES ($1, $2, $3, $4)',
            [code, timestamp, listName, shares]
        );
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/change_visibility', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const error = req.session.error || null;
        delete req.session.error;
        res.render('change_visibility', { error });
    }
});

app.post('/change_visibility', async (req, res) => {
    const { listName, visibility } = req.body;
    try {
        await pool.query('UPDATE StockLists SET visibility = $1 WHERE listName = $2 AND userID = $3', [visibility, listName, req.session.userId]);
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/view_stock_lists', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        try {
            const result = await pool.query('SELECT * FROM StockLists WHERE userID = $1', [req.session.userId]);
            res.render('view_stock_lists', { stockLists: result.rows });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

app.get('/view_stock_list/:listName', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        const listName = req.params.listName;
        try {
            const result = await pool.query(
                'SELECT c.code, c.timestamp, c.shares, s.open, s.high, s.low, s.close, s.volume FROM Contains c JOIN Stocks s ON c.code = s.code AND c.timestamp = s.timestamp WHERE c.listName = $1',
                [listName]
            );
            res.render('view_stock_list', { stocks: result.rows, listName });
        } catch (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});