import Paper from '../models/Paper.js';
import User from '../models/User.js';
import cloudinary from '../config/cloudinary.js';
import sendEmail from '../utils/email.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';

// Helper to Create Author if not exists
const findOrCreateAuthor = async (name, email) => {
    let user = await User.findOne({ email });
    let password = null;
    let isNew = false;

    if (!user) {
        isNew = true;
        password = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8); // Secure random password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = new User({
            name,
            email,
            password: hashedPassword,
            role: 'author'
        });
        await user.save();
    }
    return { user, password, isNew };
};

export const submitPaper = async (req, res) => {
    try {
        console.log('--- Submit Paper Request ---');
        console.log('Body:', req.body);
        console.log('File:', req.file ? req.file.filename : 'No file');

        const { title, abstract, name, email } = req.body;
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // 1. Upload to Cloudinary
        console.log('Uploading to Cloudinary...');
        const result = await cloudinary.uploader.upload(req.file.path, {
            resource_type: 'image',      // Force 'image' for PDFs to allow view/transform
            format: 'pdf',               // Ensure it is stored as PDF
            //folder: 'research_papers',
            use_filename: true,
            access_mode: 'public'        // Ensure public access
        });
        console.log('Cloudinary Upload Success:', result.secure_url);

        // Cleanup local file
        fs.unlinkSync(req.file.path);

        // 2. Handle Author (Auto-create or Link)
        let authorId;
        if (req.user) {
            console.log('User logged in, using existing ID:', req.user.id);
            authorId = req.user.id;
        } else {
            console.log('No logged-in user, checking for existing author...');
            if (!name || !email) return res.status(400).json({ message: 'Author details required' });

            try {
                const { user, password, isNew } = await findOrCreateAuthor(name, email);
                authorId = user._id;
                console.log('Author ID resolved:', authorId, 'Is New:', isNew);

                if (isNew) {
                    console.log('Sending email to new user...');
                    try {
                        await sendEmail(
                            email,
                            'Your Research Account Created',
                            `Welcome! Your password is provided below.`,
                            `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #2563eb;">Welcome to Research Portal</h2>
                            <p>Your paper <strong>"${title}"</strong> has been successfully submitted.</p>
                            <p>An account has been created for you to track your submission status.</p>
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p style="margin: 0;"><strong>Email:</strong> ${email}</p>
                                <p style="margin: 10px 0 0;"><strong>Password:</strong> <span style="font-family: monospace; font-size: 1.2em; background: #fff; padding: 2px 6px; border-radius: 4px;">${password}</span></p>
                            </div>
                            <p>Please login to change your password and view your dashboard.</p>
                            <a href="${process.env.CLIENT_URL}/login" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login Now</a>
                        </div>`
                        );
                        console.log('Welcome email sent successfully.');
                    } catch (emailError) {
                        console.error('Failed to send welcome email:', emailError);
                        // Don't fail the whole request if email fails, but log it
                    }
                } else {
                    console.log('User already exists, skipping account creation email.');
                    // Optionally send a "Submission Received" email even for existing users
                }
            } catch (authError) {
                console.error('Error in findOrCreateAuthor:', authError);
                return res.status(500).json({ message: 'Failed to create/link author account' });
            }
        }

        // 3. Create Paper
        console.log('Creating paper record...');
        const newPaper = new Paper({
            title,
            abstract,
            authorId,
            cloudinaryUrl: result.secure_url,
            cloudinaryPublicId: result.public_id,
            status: 'SUBMITTED'
        });

        await newPaper.save();
        console.log('Paper saved successfully:', newPaper._id);

        res.status(201).json({ message: 'Paper submitted successfully', paper: newPaper });

    } catch (error) {
        console.error('Submit Paper Error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

export const getAllPapers = async (req, res) => {
    try {
        const papers = await Paper.find().populate('authorId', 'name email').populate('reviewers.reviewerId', 'name email');
        res.json(papers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAssignedPapers = async (req, res) => {
    try {
        const papers = await Paper.find({ 'reviewers.reviewerId': req.user.id })
            .populate('authorId', 'name')
            .populate('reviewers.reviewerId', 'name'); // useful to see others? maybe strict view later

        // Filter or just send all? The frontend needs to find *their* specific status.
        // Let's send the paper object, frontend will find their entry in reviewers array.
        res.json(papers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const assignReviewer = async (req, res) => {
    try {
        const { paperId, reviewerId } = req.body;
        const paper = await Paper.findById(paperId);
        if (!paper) return res.status(404).json({ message: 'Paper not found' });

        // Check if already assigned
        const exists = paper.reviewers.some(r => r.reviewerId.toString() === reviewerId);
        if (exists) {
            return res.status(400).json({ message: 'Reviewer already assigned' });
        }

        paper.reviewers.push({
            reviewerId,
            status: 'ASSIGNED'
        });

        paper.status = 'UNDER_REVIEW';
        await paper.save();

        // Notify Reviewer
        const reviewer = await User.findById(reviewerId);
        if (reviewer) {
            await sendEmail(reviewer.email, 'New Paper Assigned', 'You have a new paper to review.', '<p>New paper assigned.</p>');
        }

        res.json({ message: 'Reviewer assigned' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const submitReview = async (req, res) => {
    try {
        const { paperId, remark, recommendation } = req.body;
        const paper = await Paper.findById(paperId);

        if (!paper) return res.status(404).json({ message: 'Paper not found' });

        if (paper.status === 'PUBLISHED' || paper.status === 'REJECTED') {
            return res.status(400).json({ message: 'Cannot review a finalized paper' });
        }

        // Find specific reviewer entry using robust comparison
        const reviewEntry = paper.reviewers.find(r =>
            (r.reviewerId._id && r.reviewerId._id.toString() === req.user.id) ||
            (r.reviewerId.toString() === req.user.id)
        );

        if (!reviewEntry) return res.status(403).json({ message: 'Not assigned to this paper' });

        if (reviewEntry) {
            reviewEntry.remark = remark;
            reviewEntry.recommendation = recommendation;
            reviewEntry.status = 'REVIEWED';
        }

        await paper.save();
        res.json({ message: 'Review submitted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getMyPapers = async (req, res) => {
    try {
        const papers = await Paper.find({ authorId: req.user.id });
        res.json(papers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const finalDecision = async (req, res) => {
    try {
        const { paperId, decision } = req.body; // PUBLISH or REJECT
        const paper = await Paper.findById(paperId);
        if (!paper) return res.status(404).json({ message: 'Paper not found' });

        if (decision === 'PUBLISH') {
            paper.status = 'PUBLISHED';
        } else if (decision === 'REJECT') {
            paper.status = 'REJECTED';
        } else {
            return res.status(400).json({ message: 'Invalid decision' });
        }

        await paper.save();

        // Notify Author
        const author = await User.findById(paper.authorId);
        await sendEmail(author.email, `Paper ${decision}ED`, `Your paper ${paper.title} has been ${decision}ED.`, `<p>Your paper has been ${decision}ED.</p>`);

        res.json({ message: 'Decision recorded' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const removeReviewer = async (req, res) => {
    try {
        const { paperId, reviewerId } = req.body;
        const paper = await Paper.findById(paperId);
        if (!paper) return res.status(404).json({ message: 'Paper not found' });

        // Remove from array
        paper.reviewers = paper.reviewers.filter(r => r.reviewerId.toString() !== reviewerId);

        // If no reviewers left, maybe revert status? 
        // Let's keep it simple. If valid reviewer removed, they are gone.
        // If all reviewers gone, status might ideally go back to SUBMITTED but 'assign' sets it to UNDER_REVIEW.
        // Let's check length.
        if (paper.reviewers.length === 0 && paper.status === 'UNDER_REVIEW') {
            paper.status = 'SUBMITTED';
        }

        await paper.save();
        res.json({ message: 'Reviewer removed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getPublishedPapers = async (req, res) => {
    try {
        const papers = await Paper.find({ status: 'PUBLISHED' })
            .populate('authorId', 'name') // Only need name
            .select('title abstract cloudinaryUrl submittedAt authorId'); // Select relevant fields
        res.json(papers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getDebugPapers = async (req, res) => {
    try {
        const papers = await Paper.find({ status: 'PUBLISHED' }).lean();
        res.json(papers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Stream PDF through server to bypass Cloudinary authentication
export const getPdfUrl = async (req, res) => {
    try {
        const { paperId } = req.params;
        const paper = await Paper.findById(paperId);

        if (!paper) {
            return res.status(404).json({ message: 'Paper not found' });
        }

        // Generate a signed URL using cloudinary.url with proper signature
        const publicId = paper.cloudinaryPublicId;

        // Generate signed URL with all necessary parameters
        const signedUrl = cloudinary.url(publicId + '.pdf', {
            resource_type: 'image',
            type: 'upload',
            sign_url: true,
            secure: true
        });

        res.json({ url: signedUrl });
    } catch (error) {
        console.error('Error generating PDF URL:', error);
        res.status(500).json({ error: error.message });
    }
};

// Server-side PDF redirect - redirects to stored Cloudinary URL
export const streamPdf = async (req, res) => {
    try {
        const { paperId } = req.params;
        const paper = await Paper.findById(paperId);

        if (!paper) {
            return res.status(404).send('Paper not found');
        }

        // Simply redirect to the stored cloudinaryUrl
        let redirectUrl = paper.cloudinaryUrl;

        // Hacky fix: If the URL is missing the resource type and just has /v, 
        // older uploads might be 'raw'. New ones are 'image'. 
        // But if 'image' is missing from URL, Cloudinary might not serve PDF correctly in browser.
        // Let's try to enforce /image/upload if it looks like a standard Cloudinary URL but missing type.
        if (redirectUrl.includes('cloudinary.com') && !redirectUrl.includes('/raw/') && !redirectUrl.includes('/image/')) {
            redirectUrl = redirectUrl.replace('/upload/', '/image/upload/');
        }

        console.log('Redirecting to Cloudinary URL:', redirectUrl);
        res.redirect(redirectUrl);

    } catch (error) {
        console.error('Error redirecting to PDF:', error);
        res.status(500).send('Failed to load PDF: ' + error.message);
    }
};

export const deletePaper = async (req, res) => {
    try {
        const { paperId } = req.params;
        const paper = await Paper.findById(paperId);

        if (!paper) {
            return res.status(404).json({ message: 'Paper not found' });
        }

        // Delete from Cloudinary
        if (paper.cloudinaryPublicId) {
            try {
                await cloudinary.uploader.destroy(paper.cloudinaryPublicId, { resource_type: 'image' });
            } catch (clError) {
                console.error('Cloudinary delete error:', clError);
                // Continue deletion even if cloudinary fails
            }
        }

        await Paper.findByIdAndDelete(paperId);
        res.json({ message: 'Paper deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const unpublishPaper = async (req, res) => {
    try {
        const { paperId } = req.params;
        const paper = await Paper.findById(paperId);

        if (!paper) {
            return res.status(404).json({ message: 'Paper not found' });
        }

        if (paper.status !== 'PUBLISHED') {
            return res.status(400).json({ message: 'Only published papers can be unpublished' });
        }

        paper.status = 'UNDER_REVIEW'; // Move back to review status
        await paper.save();

        // Notify Author
        const author = await User.findById(paper.authorId);
        if (author) {
            await sendEmail(
                author.email,
                'Paper Unpublished',
                `Your paper "${paper.title}" has been unpublished and moved back to review status.`,
                `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #64748b;">Paper Visibility Updated</h2>
                    <p>Your paper <strong>"${paper.title}"</strong> has been unpublished by the administrator and returned to the review phase.</p>
                    <p>This may be due to required revisions or administrative review.</p>
                </div>`
            );
        }

        res.json({ message: 'Paper unpublished successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


