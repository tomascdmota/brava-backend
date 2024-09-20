import CardModel from '../models/cardModel'


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

interface CardResponse {
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


const cardService = {
    getCard: async (card_id: string): Promise<CardResponse> => {
        const card = await CardModel.findCardById(card_id);
        if(!card){
            throw new Error(`Card with ID ${card_id} doesn't exist`);
        }
        return card
    }
}

export default cardService