import db from '../lib/db'
import {RowDataPacket} from "mysql2/promise"

interface SocialMediaLinks {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
    spotify?: string;
    twitter?: string;
    vinted?: string;
    paypal?: string;
    standvirtual?: string;
    olx?: string;
    piscapisca?: string;
    custojusto?: string;
}

interface Card {
    card_id: string;
    id?: string;
    card_type?: string;
    username?: string;
    email?: string;
    company?: string;
    title?: string;
    phone?: string;
    address?: string;
    url?: string;
    profile_image_url?: string;
    background_image_url?: string;
    notes?: string;
    card_taps?: number;
    socialMedia?: SocialMediaLinks; // Add social media links as a property
}

const CardModel = {
    findCardById: async (card_id: string): Promise<Card | null> => {
        const query = "SELECT * FROM cards WHERE card_id = ?"
        const [rows] = await db.query<Card[] & RowDataPacket[]>(query, [card_id]);
        if(rows.length === 0){
            return null;
        }
        return rows[0] // This returns the first user or null if the card doesnt exist
    }
}

export default CardModel