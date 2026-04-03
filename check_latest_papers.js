import mongoose from 'mongoose';
import 'dotenv/config';
import Paper from './models/Paper.js';

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB');

        // Get last 3 papers
        const papers = await Paper.find().sort({ submittedAt: -1 }).limit(3);

        console.log('--- Latest 3 Papers ---');
        papers.forEach(p => {
            console.log(`Title: ${p.title}`);
            console.log(`ID: ${p._id}`);
            console.log(`URL: ${p.cloudinaryUrl}`);
            console.log(`Public ID: ${p.cloudinaryPublicId}`);
            console.log('-----------------------');
        });

        mongoose.connection.close();
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
