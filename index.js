require('dotenv').config()
const express = require('express')
const fs = require('fs')
const bcrypt = require('bcrypt')
const path = require('path')
const app = express()
const util = require('util')
const mysql = require('mysql')
const fileUpload = require('express-fileupload')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const { totalmem } = require('os')
app.use(express.json({ limit: '10mb' }))
app.use(cookieParser())
app.use(fileUpload())
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }))
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.static('public'))
app.use('Bootstrap4', express.static('public/Bootstrap4'))
app.use('/products', express.static('views/seller/products'))
const con = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'ecommerce'
})
con.connect((error, result) => {
    if (error) throw error
    if (result) {
        console.log('Database is connected')
    }
})
const q = util.promisify(con.query).bind(con)
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function getSafeUploadName(originalName) {
    const ext = path.extname(originalName || '').toLowerCase()
    const base = (path.basename(originalName || '', ext) || 'upload').replace(/[^a-zA-Z0-9_-]+/g, '_')
    return `${Date.now()}-${base}${ext}`
}

function isValidUploadedImage(file) {
    return !!file && file.size > 0 && ALLOWED_IMAGE_TYPES.has(file.mimetype)
}

function redirectIfLoggedIn(req, res, next) {
    const token = req.cookies.MASTER_ECOM
    if (!token) return next()

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        if (decoded.role === 'seller') return res.redirect('/seller')
        if (decoded.role === 'buyer') return res.redirect('/buyer?page=1')
    } catch {
        res.clearCookie('MASTER_ECOM')
    }
    next()
}
function verify(req, res, next) {
    const token = req.cookies.MASTER_ECOM
    if (!token) {
        return res.redirect('/login')
    }
    try {
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET)
            req.user = decoded

            if (!decoded) {
                res.clearCookie('MASTER_ECOM')
                return res.redirect('/login')
            }
            if (req.user.role !== 'buyer') {
                return res.redirect('/seller')
            }
        }
    }
    catch (e) {
        console.log(e)
    }

    next()
}

function verifySeller(req, res, next) {
    const token = req.cookies.MASTER_ECOM
    if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decoded
        if (!decoded) {
            res.clearCookie('MASTER_ECOM')
            return res.redirect('/')
        }
        if (req.user.role !== 'seller') {
            return res.redirect('/buyer?page=1')
        }
       
    }
    else {
        return res.redirect('/')
    }
    next()
}

app.get('/', redirectIfLoggedIn, function (req, res) {
    res.render('index')
})
app.get('/about', redirectIfLoggedIn, function (req, res) {
    res.render('about')
})
app.get('/contact', redirectIfLoggedIn, function (req, res) {
    res.render('contact')
})
app.get('/products', (req, res) => {
    const SQL = "SELECT image , product , price , category FROM products "
    con.query(SQL, (err, result) => {
        if (err) throw err
        return res.render('products', { result: result })


    })
})
app.get('/login', redirectIfLoggedIn, function (req, res) {
    res.render('login', { message: '' })
})
app.get('/signup', redirectIfLoggedIn, function (req, res) {
    res.render('signup', { message: '' })
})
app.post('/search', function (req, res) {
    const se = req.body.se
    const search = "SELECT * FROM products WHERE product LIKE ? OR category LIKE ?"
    con.query(search, [`%${se}%`, `%${se}%`], (err, result) => {
        if (err) throw err
        if (result.length > 0) {
            return res.render('products', { result: result, se: se })
        }
        return res.redirect('/products')
    }) 

})
app.get('/buyer', verify, async function (req, res) {
    let { page } = req.query ?? 1
    let limit = 4
    let offset = (page - 1) * limit
    console.log(req.user.role)
    const SQL = "SELECT id , image , product , price , category FROM products LIMIT ? OFFSET ? "
    const count = await q("SELECT COUNT(*) AS total FROM products ")
    const total = count[0].total
    const totalPages = Math.ceil(total / limit)
    con.query(SQL, [limit, offset], (err, result) => {
        if (err) throw err
        return res.render('user/index', { user: req.user.name, result: result, totalPages, page: Number(page) })
    })

})

app.post('/user_contact', verify, async (req, res) => {
    try {
        const username = req.body.name
        const subject = req.body.subject
        const email = req.body.email
        const message = req.body.message
        const result = await q("INSERT INTO contact (username , email , subject , message) VALUES(?,?,?,?)", [username, email, subject, message])
        res.redirect('/buyer_contact_view')
    }
    catch (e) {
        console.log(e)
    }
})
app.get('/viewcontact', verify, async (req, res) => {
   
    const id = req.user.id
    const check = await q("SELECT email FROM signup WHERE id = ?", [id])
    const user = check[0].email
    const result = await q("SELECT * FROM contact WHERE email = ?", [user])

    res.render('user/viewcontact', { result })
})

app.get('/buyer_orders', verify, async function (req, res) {
    const query = util.promisify(con.query).bind(con)
    try {
        let { page } = req.query || 1
        let limit = 4
        let offset = (page - 1) * limit
        const id = req.user.id
        const result = await query("SELECT * FROM orders WHERE bid = ?  LIMIT ? OFFSET ?", [id, limit, offset])
        const result2 = await query("SELECT COUNT(*) AS total FROM orders WHERE bid = ? ", [id])
        const total = result2[0].total
        // Returns the smallest integer greater than or equal to its numeric argument.
        const totalPages = Math.ceil(total / limit)

        const counts = await query("SELECT status, COUNT(*) AS total FROM orders WHERE bid = ? GROUP BY status ", [id])
        return res.render('user/orders', { result, result2, counts, totalPages, page: Number(page) })
    }
    catch (e) {
        console.log(e)
        return res.redirect('/buyer?page=1')
    }

})
app.get('/buyer_profile', verify, async (req, res) => {
    const id = req.user.id
    const result = await q("SELECT * FROM signup WHERE id = ?", [id])

    res.render('user/profile', { result: result[0], message: '' })
})
// ============= Search Product ===================
app.post('/search_product', verify, function (req, res) {
    const se = req.body.se
    const SQL = "SELECT * FROM products WHERE product LIKE ? OR category LIKE ?"
    con.query(SQL, [`%${se}%`, `%${se}%`], (err, result) => {
        if (err) throw err
        return res.render('user/index', { result: result, se: se, user: req.user.name })
    })
})

// ============= View Product on buyer ============

app.get('/buy/:id', verify, (req, res) => {
    const id = req.params.id
    let message = req.query.message
    const SQL = "SELECT * FROM products WHERE id = ? "
    con.query(SQL, [id], (err, result) => {
        if (err) throw err
        if (result.length > 0) {
            return res.render('user/buy', { user: req.user.name, id: req.user.id, result: result[0], message: message })
        }
    })
})

// ========== Order ===================
app.post('/order_buy', verify, (req, res) => {
    const bid = req.user.id
    const pid = req.body.pid
    const product = req.body.product
    const qty = parseInt(req.body.quantity)
    const image = req.body.image
    const shipping_address = req.body.shipping_address
    const payment = req.body.payment
    const status = "pending"
    if (!Number.isInteger(qty) || qty <= 0) {
        return res.redirect(`/buy/${pid}?message=Please give a valid quantity`)
    }

    const check = "SELECT * FROM products WHERE id = ?"
    con.query(check, [pid], (err, result) => {
        if (err) throw err
        if (result.length > 0) {
            const stock = result[0].stock
            const price = result[0].price
            const sid = result[0].sid
            const amount = qty * parseInt(price)
            if (qty > parseInt(stock)) {
                return res.redirect('/buyer?page=1')

            }
            const update = `UPDATE products SET stock= stock-? WHERE id = ? AND stock >= ? `
            con.query(update, [qty, pid, qty], (err, result) => {
                if (err) throw err
                if (result.affectedRows === 0) {
                    return res.status(400).json('Out of stock.')
                }
                const SQL = "INSERT INTO orders ( `sid`, `product`, `price`, `qty`, `amount`, `payment`, `shipping_address`, `status`, `bid`, `pid`, `image`) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
                con.query(SQL, [sid, product, price, qty, amount, payment, shipping_address, status, bid, pid, image], (err, result) => {
                    if (err) throw err
                    if (result.affectedRows > 0) {
                        return res.redirect('/buyer_orders?page=1')
                    }
                })

            })

        }
    })
})

//=========== Cancel Order ================
app.get('/cancel/:id', verify, function (req, res) {
    const id = req.params.id
    const bid = req.user.id
    const check = "SELECT status FROM orders WHERE id = ? and bid = ?"
    con.query(check, [id, bid], (err, result) => {
        if (err) throw err
        if (result.length === 0) {
            return res.status(400).json({ message: 'No order found' })
        }
        if (result[0].status === 'order confirm' || result[0].status === 'delivered') {
            return res.status(400).json({ message: 'This order cannot be cancel' })
        }
        else {
            const SQL = "DELETE FROM orders WHERE id = ?"
            con.query(SQL, [id], (err, result) => {
                if (err) throw err
                if (result.affectedRows > 0) {
                    return res.redirect('/buyer_orders?page=1')
                }
            })
        }
    })
})
app.get('/seller', verifySeller, async function (req, res) {
    try {
        const user = req.user.id
        const result = await q("SELECT id,username,email,role FROM signup WHERE id = ?", [user])
        const result2 = await q("SELECT COUNT(*) AS total FROM orders WHERE sid = ?", [user])
        const result3 = await q("SELECT COUNT(*) AS total FROM products WHERE sid = ?", [user])
        const result4 = await q("SELECT COALESCE(SUM(amount), 0) AS total FROM orders WHERE sid = ? AND status = 'delivered'", [user])
        const counts = await q("SELECT status , COUNT(*) AS total FROM orders WHERE sid = ? GROUP BY status", [user])
        const lowStock = await q("SELECT COUNT(*) AS total FROM products WHERE sid = ? AND stock <= 5", [user])
        const recent = await q('SELECT o.id,u.username,o.product,o.amount,o.status FROM signup u INNER JOIN orders o ON u.id = o.bid WHERE sid = ? ORDER BY o.id DESC', [user])
        const top = await q("SELECT product,price,image,COUNT(*) AS sold FROM orders WHERE sid = ? GROUP BY pid HAVING COUNT(*) > 1 ORDER BY id  DESC LIMIT 3", [user])
        return res.render('seller/index', { lowStock, result: result[0], result2, recent, result3, counts, result4, top })
    } catch (error) {
        console.log(error)

    }

})

app.get('/seller_profile', verifySeller, function (req, res) {
    const user = req.user.id
    const sql = "SELECT id,username,email,role FROM signup WHERE id = ?"
    con.query(sql, [user], (err, result) => {
        if (err) throw err
        if (result.length > 0) {
            res.render('seller/profile', { result: result[0] })
        }
    })

})
app.get('/product_overview/:pid', verifySeller, async (req, res) => {
    const pid = req.params.pid
    const id = req.user.id

    const product = await q("SELECT * FROM products WHERE id = ? AND sid = ?", [pid, id])
    const sold = await q("SELECT COUNT(*) AS total FROM orders WHERE pid = ? AND sid = ?", [pid, id])
    const revenue = await q("SELECT COALESCE(SUM(amount), 0) AS total FROM orders WHERE pid = ? AND sid = ? AND status = 'delivered'", [pid, id])
    const statusBreakdown = await q("SELECT status, COUNT(*) AS total FROM orders WHERE pid = ? AND sid = ? GROUP BY status", [pid, id])
    const orderGraph = await q("SELECT DATE(created_at) AS date, COUNT(*) AS total FROM orders WHERE pid = ? AND sid = ? GROUP BY DATE(created_at) ORDER BY date ASC", [pid, id])

    res.render('seller/product_overview', {
        product: product[0],
        sold, revenue, statusBreakdown, orderGraph
    })
})
app.get('/seller_buyer', verifySeller, async function (req, res) {
    try {
        const id = req.user.id
        const result2 = await q("SELECT u.id,u.username,u.email,COUNT(*) AS total, (SELECT COUNT(*) FROM orders WHERE sid = ?) AS result FROM orders as o JOIN signup as u ON o.bid = u.id WHERE sid = ? GROUP BY o.bid  ", [id, id])
        const counts = await q("SELECT status , COUNT(*) AS total FROM orders WHERE sid = ? GROUP BY status", [id])
        return res.render('seller/viewbuyer', { show: result2, counts })
    } catch (error) {
        console.log(error)
        return res.redirect('/seller')
    }
})
app.get('/seller_orders', verifySeller, async function (req, res) {
    try {
        const id = req.user.id
        const result2 = await q("SELECT *  FROM orders WHERE sid = ?  ", [id])
        const result3 = await q("SELECT COUNT(*) As total  FROM orders WHERE sid = ?  ", [id])
        const counts = await q("SELECT status , COUNT(*) AS total FROM orders WHERE sid = ? GROUP BY status", [id])
        return res.render('seller/vieworders', { result3: result3[0], show: result2, counts })
    } catch (error) {
        console.log(error)
        return res.redirect('/seller')
    }
})
app.get('/view_buyer_order/:id', verifySeller, async (req, res) => {
    try {
        const id = req.params.id
        const sid = req.user.id
        const query = util.promisify(con.query).bind(con)
        const search_buyer = await query("SELECT * FROM signup  WHERE id = ?", [id])
        const result = await query("SELECT * FROM orders WHERE sid = ? and bid IN(?)", [sid, id])
        const result3 = await query("SELECT COUNT(*) AS total FROM orders WHERE sid = ? and bid IN(?)", [sid, id])
        const result5 = await query("SELECT COALESCE(SUM(amount),0)AS total FROM orders WHERE sid = ? and bid IN(?) AND status = 'delivered'", [sid, id])
        const counts = await query("SELECT status , COUNT(*) AS total FROM orders WHERE sid = ? and bid IN(?) GROUP BY status", [sid, id])
        return res.render('seller/orders', { result, result3, counts, search_buyer, result5 })

    } catch (error) {
        console.log(error)
        return res.redirect('/seller_buyer')
    }


})
app.get('/edit_status/:id', verifySeller, async function (req, res) {
    try {
        const id = req.params.id
        const status = req.query.status
        const sid = req.user.id
        const result = await q("UPDATE orders set status = ? WHERE id = ? AND sid = ?", [status, id, sid])
        const result2 = await q("SELECT bid FROM orders WHERE id = ? AND sid = ?", [id, sid])
        if (!result2.length) {
            return res.redirect('/seller_buyer')
        }
        const bid = result2[0].bid
        return res.redirect(`/view_buyer_order/${bid}`)
    }
    catch (e) {
        console.log(e)
    }

})
app.get('/edit_status_order/:id', verifySeller, async function (req, res) {
    try {
        const id = req.params.id
        const status = req.query.status
        const sid = req.user.id
        const result = await q("UPDATE orders set status = ? WHERE id = ? AND sid = ?", [status, id, sid])
        const result2 = await q("SELECT bid FROM orders WHERE id = ? AND sid = ?", [id, sid])
        if (!result2.length) {
            return res.redirect('/seller_orders')
        }
        return res.redirect(`/seller_orders`)
    }
    catch (e) {
        console.log(e)
    }

})
app.post('/update_products/:id', verifySeller, async function (req, res) {
    try {
        const sid = req.user.id
        const id = req.params.id
        const product = req.body.name
        const price = req.body.price
        const stock = req.body.stock
        const category = req.body.category
        const des = req.body.description

        const existingProduct = await q("SELECT image FROM products WHERE id = ? AND sid = ?", [id, sid])
        if (!existingProduct.length) {
            return res.redirect('/seller_products')
        }

        if (req.files && req.files.image) {
            const image = req.files.image
            if (!isValidUploadedImage(image)) {
                return res.redirect('/seller_products')
            }

            const fileName = getSafeUploadName(image.name)
            const uploadPath = path.join(__dirname, 'views', 'seller', 'products')
            image.mv(path.join(uploadPath, fileName), async (err, result) => {
                if (err) {
                    console.log(err)
                    return res.redirect('/seller_products')
                }

                const old = existingProduct[0]?.image

                await q("UPDATE products set product = ? , price = ? , stock= ? , description = ? , category = ? , image = ? WHERE id = ? AND sid = ?",
                    [product, price, stock, des, category, fileName, id, sid]
                )
                await q("UPDATE orders set image = ? WHERE sid = ? and pid = ? ", [fileName, sid, id])

                if (old) {
                    fs.unlink(path.join(uploadPath, old), (err) => {
                        console.log('Could not delete old image:', err)
                    })
                }
                return res.redirect('/seller_products')
            })
        } else {
            const result2 = await q("UPDATE products set product = ? , price = ? , stock= ? , description = ? , category = ?  WHERE id = ? AND sid = ?",
                [product, price, stock, des, category, id, sid]
            )
            return res.redirect('/seller_products')
        }

    }
    catch (e) {
        console.log(e)
    }
})

app.get('/seller_products', verifySeller, function (req, res) {
    const id = req.user.id
    const SQL = "SELECT * FROM products WHERE sid = ?"
    con.query(SQL, [id], (err, result) => {
        if (err) throw err

        return res.render('seller/products', { result: result })


    })

})
app.post('/delproduct/:id', verifySeller, async function (req, res) {
    try {
        const id = req.params.id
        const sid = req.user.id
        const query = util.promisify(con.query).bind(con)
        const existingProduct = await query("SELECT image FROM products WHERE id = ? AND sid = ?", [id, sid])
        if (!existingProduct.length) {
            return res.redirect('/seller_products')
        }

        const imageName = existingProduct[0]?.image
        await query("DELETE FROM products WHERE id = ? AND sid = ?", [id, sid])

        if (imageName) {
            const uploadPath = path.join(__dirname, 'views', 'seller', 'products', imageName)
            fs.unlink(uploadPath, (err) => {
                if (err) console.log('Could not delete product image:', err)
            })
        }

        return res.redirect('/seller_products')
    }
    catch (e) {
        console.log(e)
    }
})
app.get('/delorder/:id', verifySeller, async function (req, res) {
    try {
        const id = req.params.id
        const bid = req.query.bid
        const sid = req.user.id
        const result = await q("DELETE FROM orders WHERE id = ? and sid = ?", [id, sid])
        return res.redirect(`/view_buyer_order/${bid}`)
    }
    catch (e) {
        console.log(e)
    }
})
app.get('/delorder_order/:id', verifySeller, async function (req, res) {
    try {
        const id = req.params.id
        const bid = req.query.bid
        const sid = req.user.id
        const result = await q("DELETE FROM orders WHERE id = ? and sid = ?", [id, sid])
        return res.redirect(`/seller_orders`)
    }
    catch (e) {
        console.log(e)
    }
})
// ============ Register ==========
app.post('/register', redirectIfLoggedIn, async function (req, res) {
    const username = req.body.username
    const password = req.body.password
    const email = req.body.email
    const fathername = req.body.fathername
    const role = req.body.role

    try {
        const check = await q("SELECT * FROM signup WHERE email = ?", [email])
        if (check.length > 0) {
            return res.render('signup', { message: 'Email already exist' })
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const sql = "INSERT INTO `signup`(`username`, `email`, `fathername`, `password`, `role`) VALUES(?, ?, ?, ?, ?)"
        const result = await q(sql, [username, email, fathername, hashedPassword, role])
        if (result.affectedRows > 0) {
            res.redirect('/login')
        }
    } catch (e) {
        console.log(e)
        return res.render('signup', { message: 'Something went wrong' })
    }
})

// ================= Login ======================

app.post('/loginjs', redirectIfLoggedIn, async function (req, res) {
    const email = req.body.email
    const password = req.body.password

    try {
        const results = await q("SELECT * FROM signup WHERE email = ?", [email])
        if (results.length === 0) {
            return res.render('login', { message: 'No user found Please register' })
        }

        const isMatch = await bcrypt.compare(password, results[0].password)
        if (!isMatch) {
            return res.render('login', { message: 'Invalid Password' })
        }

        const token = jwt.sign(
            { id: results[0].id, email: results[0].email, name: results[0].username, role: results[0].role },
            process.env.JWT_SECRET
        )

        if (results[0].role === 'seller') {
            res.cookie('MASTER_ECOM', token, {
                maxAge: 24 * 60 * 60 * 365 * 1000,
                secure: true,
                httpOnly: true,
                sameSite: 'strict'
            })
            return res.redirect('/seller')
        }
        if (results[0].role === 'buyer') {
            res.cookie('MASTER_ECOM', token, {
                maxAge: 24 * 60 * 60 * 365 * 1000,
                secure: true,
                httpOnly: true,
                sameSite: 'strict'
            })
            return res.redirect('/buyer?page=1')
        }
    } catch (e) {
        console.log(e)
        return res.render('login', { message: 'Something went wrong' })
    }
})

// ============ Logout ==================
app.post('/logout', function (req, res) {
    res.clearCookie('MASTER_ECOM')
    res.redirect('/')
})
//=========== Add Product ======================
app.post('/insert_product', verifySeller, function (req, res) {
    const sid = req.user.id
    const product = req.body.name
    const description = req.body.description
    const price = req.body.price
    const stock = req.body.stock
    const category = req.body.category

    if (!req.files || !req.files.image) {
        const SQL = "INSERT INTO products (`sid` ,`product`, `description`, `price`, `category`, `stock`) VALUES(? , ? , ?, ? ,?, ?)"
        con.query(SQL, [sid, product, description, price, category, stock], (err, result) => {
            if (err) throw err
            if (result.affectedRows > 0) {
                return res.redirect('/seller_products')
            }
        })
        return
    }
    const image = req.files.image
    if (!isValidUploadedImage(image)) {
        return res.redirect('/seller_products')
    }
    const fileName = getSafeUploadName(image.name)
    const uploadPath = path.join(__dirname, 'views', 'seller', 'products', fileName)
    image.mv(uploadPath, (err, result) => {
        if (err) {
            console.log(err)
            return res.redirect('/seller_products')
        }
        const SQL = "INSERT INTO `products` (`sid`,`product`, `description`, `price`, `category`, `image`, `stock`) VALUES(? , ? , ? , ?, ? ,?, ?)"
        con.query(SQL, [sid, product, description, price, category, fileName, stock], (err, result) => {
            if (err) throw err
            if (result.affectedRows > 0) {
                return res.redirect('/seller_products')
            }
        })
    })

})




// ========== All updates =============

app.post('/edit_presonal_seller', verifySeller, function (req, res) {
    const id = req.user.id
    const name = req.body.username
    const email = req.body.email
    const SQL = 'UPDATE signup SET username = ? , email = ? WHERE id = ? '
    con.query(SQL, [name, email, id], (err, result) => {
        if (err) throw err

        if (result.affectedRows > 0) {
            return res.redirect('/seller_profile')
        }
    })
})

app.post('/edit_personal_buyer', verify, function (req, res) {
    const id = req.user.id
    const name = req.body.username
    const email = req.body.email
    const SQL = 'UPDATE signup SET username = ? , email = ? WHERE id = ? '
    con.query(SQL, [name, email, id], (err, result) => {
        if (err) throw err

        if (result.affectedRows > 0) {
            return res.redirect('/buyer_profile')
        }
    })
})

app.post('/edit_password_buyer', verify, function (req, res) {
    const id = req.user.id
    const currentPassword = req.body.currentPassword
    const newPassword = req.body.newpassword

    const getUser = "SELECT * FROM signup WHERE id = ?"
    con.query(getUser, [id], (err, result) => {
        if (err) throw err
        if (result.length === 0) {
            return res.status(404).send('User not found')
        }

        bcrypt.compare(currentPassword, result[0].password, (err, isMatch) => {
            if (err) throw err
            if (!isMatch) {
                return res.status(401).send('Current password is incorrect')
            }

            bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
                if (err) throw err

                const updateSQL = 'UPDATE signup SET password = ? WHERE id = ?'
                con.query(updateSQL, [hashedPassword, id], (err, result) => {
                    if (err) throw err;
                    if (result.affectedRows > 0) {
                        return res.redirect('/buyer_profile')
                    }
                })
            })
        })
    })
})

app.post('/edit_password', verifySeller, function (req, res) {
    const id = req.user.id
    const currentPassword = req.body.currentPassword
    const newPassword = req.body.newpassword

    const getUser = "SELECT * FROM signup WHERE id = ?"
    con.query(getUser, [id], (err, result) => {
        if (err) throw err
        if (result.length === 0) {
            return res.status(404).send('User not found')
        }

        bcrypt.compare(currentPassword, result[0].password, (err, isMatch) => {
            if (err) throw err
            if (!isMatch) {
                return res.status(401).send('Current password is incorrect')
            }

            bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
                if (err) throw err

                const updateSQL = 'UPDATE signup SET password = ? WHERE id = ?'
                con.query(updateSQL, [hashedPassword, id], (err, result) => {
                    if (err) throw err;
                    if (result.affectedRows > 0) {
                        return res.redirect('/seller_profile')
                    }
                })
            })
        })
    })
})

app.listen(5000, () => {
    console.log('Server is running')
})