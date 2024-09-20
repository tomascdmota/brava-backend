import {Request, Response} from 'express'
import cardService from '../services/cardService'

const cardController = {
    getCard: async (req: Request, res: Response): Promise<void> => {
        const card_id = req.params.id; // Changed from req.body to req.params

        try {
            const card = await cardService.getCard(card_id);
            res.status(200).send(card); // Directly send the card object
        } catch (error: any) {
            if (error.message.includes("doesn't exist")) {
                res.status(404).json({ message: error.message });
            } else {
                res.status(400).json({ message: error.message });
            }
        }
    }
};



export default cardController