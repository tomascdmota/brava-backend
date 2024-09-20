import {Request, Response} from 'express'
import authService from '../services/authService'

const authController = {
    login: async(req: Request, res: Response): Promise<void> => {
        const {username, password} = req.body

        try{
            const {access_token, user} = await authService.login(username, password);
            
            res.cookie('session_token', access_token, {
                maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                sameSite: 'none',
            });

            res.status(200).send({
                access_token,user
            })
        } catch(error: any){
                res.status(400).json({message: error.message});
        }
    }
}

export default authController   