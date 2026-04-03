import User from '../models/User.js';
import Paper from '../models/Paper.js';
import sendEmail from '../utils/email.js';

export const getPendingReviewers = async (req, res) => {
    try {
        const reviewers = await User.find({ role: 'reviewer', reviewerStatus: 'PENDING' });
        res.json(reviewers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAllReviewers = async (req, res) => {
    try {
        const reviewers = await User.find({ role: 'reviewer', reviewerStatus: 'APPROVED' });
        res.json(reviewers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const handleReviewerStatus = async (req, res) => {
    try {
        const { userId, status } = req.body; // APPROVED or REJECTED
        const user = await User.findById(userId);
        if (!user || user.role !== 'reviewer') {
            return res.status(404).json({ message: 'Reviewer not found' });
        }

        user.reviewerStatus = status;
        await user.save();

        // Email notification
        await sendEmail(
            user.email,
            `Reviewer Application ${status}`,
            `Your application has been ${status}.`,
            `<p>Your application has been <strong>${status}</strong>.</p>`
        );

        res.json({ message: `Reviewer ${status}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAuthors = async (req, res) => {
    try {
        const authors = await User.find({ role: 'author' });
        res.json(authors);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.role === 'admin') {
            return res.status(403).json({ message: 'Cannot delete admin users' });
        }

        // If user is a reviewer, remove them from all assigned papers
        if (user.role === 'reviewer') {
            await Paper.updateMany(
                { 'reviewers.reviewerId': userId },
                { $pull: { reviewers: { reviewerId: userId } } }
            );

            // Revert status to SUBMITTED if no reviewers left
            // This is a bit tricky with updateMany, but let's at least remove the reviewer entries.
            // A separate cleanup could be done for paper status if needed.
        }

        await User.findByIdAndDelete(userId);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
