import mongoose from 'mongoose';
import 'dotenv/config';
import Paper from './models/Paper.js';

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        try {
            const papers = await Paper.find().sort({ submittedAt: -1 }).limit(3);
            console.log('\n\n=== LATEST PAPERS ===');
            papers.forEach((p, i) => {
                console.log(`\n--- Paper ${i + 1} ---`);
                console.log(`Title: ${p.title}`);
                console.log(`ID: ${p._id}`);
                console.log(`URL: ${p.cloudinaryUrl}`);
                console.log(`PublicID: ${p.cloudinaryPublicId}`);
            });
            console.log('\n=====================\n');
        } catch (e) {
            console.error(e);
        } finally {
            mongoose.disconnect();
        }
    })
    .catch(err => {
        console.error('Connection Error:', err);
        process.exit(1);
    });
