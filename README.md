E-Commerce Project Handover
Yeh project ek Node.js based E-Commerce platform hai, jisme Buyer aur Seller ke liye alag-alag features aur role-based access control shamil hai.

Features
Role-Based Access: Buyer aur Seller ke liye alag dashbaords aur permissions.

Authentication: bcrypt aur JWT (JSON Web Tokens) ke zariye secure login aur session management.

Inventory Management: Sellers apne products aur stock ko manage kar sakte hain.

Order Processing: Stock validation ke saath order placement system.

File Uploads: express-fileupload ke zariye product image management.

Setup Instructions
1. Database Setup
MySQL server start karein aur ecommerce naam ka database create karein.

Apni database dump file (.sql) ko is database mein import karein.

2. Environment Configuration
Project directory mein .env file banayein aur apne database details configure karein.

index.js mein database connection settings check kar lein.

3. Installation
Terminal mein project folder ke andar ye command chalayein:

Bash
npm install
4. Run the Project
Server start karne ke liye ye command use karein:

Bash
node index.js
Server chalne ke baad, browser mein http://localhost:3000 (ya aapka port) par access karein.
