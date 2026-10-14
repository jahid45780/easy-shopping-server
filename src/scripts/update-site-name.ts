import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { SiteContent } from '../app/modules/siteContent/siteContent.model';
import { User } from '../app/modules/user/user.model';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const replaceBrand = (value: string) => value
    .replace(/Shohoz Kitchen/gi, 'Easy Shopping')
    .replace(/shohozkitchen/gi, 'Easy Shopping')
    .replace(/Shohoz/gi, 'Easy Shopping');

async function updateSiteName() {
    try {
        const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
        if (!uri) throw new Error('Set MONGODB_URI in the server .env before running this script.');
        await mongoose.connect(uri);

        const siteDocuments = await SiteContent.find({
            $or: [
                { 'footer.companyName': /shohoz/i }, { 'footer.copyright': /shohoz/i },
                { 'general.storeName': /shohoz/i }, { 'general.tagline': /shohoz/i },
                { defaultTagline: /shohoz/i }, { 'seo.title': /shohoz/i },
                { 'seo.description': /shohoz/i }, { 'seo.keywords': /shohoz/i },
                { 'ticker.text': /shohoz/i }, { 'announcement.message': /shohoz/i },
                { 'legalPages.title': /shohoz/i }, { 'legalPages.content': /shohoz/i },
            ],
        });

        for (const site of siteDocuments) {
            const changed: string[] = [];
            const update = (pathName: string, value: unknown) => {
                if (typeof value !== 'string' || !/shohoz/i.test(value)) return value;
                changed.push(pathName);
                return replaceBrand(value);
            };

            for (const field of ['footer.companyName', 'footer.copyright', 'general.storeName', 'general.tagline', 'defaultTagline', 'seo.title', 'seo.description', 'seo.keywords', 'announcement.message']) {
                const value = site.get(field);
                let next = update(field, value);
                if (field === 'seo.title' && typeof value === 'string' && /shohoz/i.test(value)) {
                    next = 'Easy Shopping - Your trusted online shopping destination';
                }
                if (next !== value) site.set(field, next);
            }
            for (const [index, item] of (site.ticker || []).entries()) {
                const next = update(`ticker.${index}.text`, item.text);
                if (next !== item.text) item.text = next as string;
            }
            for (const [index, page] of (site.legalPages || []).entries()) {
                for (const field of ['title', 'content'] as const) {
                    const next = update(`legalPages.${index}.${field}`, page[field]);
                    if (next !== page[field]) page[field] = next as string;
                }
            }
            if (changed.length) {
                await site.save();
                console.log(`SiteContent ${site._id}: ${changed.join(', ')}`);
            }
        }

        const users = await User.find({
            $or: [{ firstName: /shohoz/i }, { lastName: /shohoz/i }],
        });
        for (const user of users) {
            const changed: string[] = [];
            for (const field of ['firstName', 'lastName'] as const) {
                if (/shohoz/i.test(user[field] || '')) {
                    user[field] = 'Easy Shopping';
                    changed.push(field);
                }
            }
            if (changed.length) {
                await user.save();
                console.log(`User ${user._id}: ${changed.join(', ')}`);
            }
        }
        if (!siteDocuments.length) console.log('No matching SiteContent fields found.');
        if (!users.length) console.log('No matching user names found.');
    } catch (error) {
        console.error('Update failed:', error instanceof Error ? error.message : 'Unknown error');
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

void updateSiteName();
