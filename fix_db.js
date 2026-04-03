import 'dotenv/config';
import mongoose from 'mongoose';
import Paper from './models/Paper.js';
import User from './models/User.js';

async function fix() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        // Find any user to act as the author
        let user = await User.findOne({ role: 'author' });
        if (!user) user = await User.findOne({}); 
        
        if (user) {
            const paper = await Paper.findOne({ _id: '69954bca53d773d096d0ff57' });
            if (paper) {
                paper.authorId = user._id;
                paper.submittedAt = new Date(); // Fix the date as well
                await paper.save();
                console.log("SUCCESS: Fixed paper! Author set to", user.name);
            } else {
                console.log("ERROR: Could not find paper");
            }
        } else {
            console.log("ERROR: No users found in database");
            // Create a dummy user
            const newUser = new User({
                name: 'Test Author',
                email: 'testauthor@example.com',
                password: 'password123',
                role: 'author'
            });
            await newUser.save();
            const paper = await Paper.findOne({ _id: '69954bca53d773d096d0ff57' });
            if (paper) {
                paper.authorId = newUser._id;
                paper.submittedAt = new Date();
                await paper.save();
                console.log("SUCCESS: Created test user and fixed paper!");
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
}
fix();
