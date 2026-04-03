import 'dotenv/config';
import mongoose from 'mongoose';
import Paper from './models/Paper.js';
import User from './models/User.js';

async function testFetch() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const papers = await Paper.find({ status: 'PUBLISHED' })
            .populate('authorId', 'name')
            .select('title abstract cloudinaryUrl submittedAt authorId');
        
        console.log("Papers returned:", JSON.stringify(papers.slice(0, 2), null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        mongoose.disconnect();
    }
}
testFetch();
